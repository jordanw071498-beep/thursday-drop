import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { GetProfileResponse, CreateProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

function getUserId(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return authHeader.replace("Bearer ", "") || null;
}

function serializeProfile(p: typeof profilesTable.$inferSelect) {
  return {
    ...p,
    stripe_customer_id: p.stripe_customer_id ?? null,
    created_at: p.created_at.toISOString(),
  };
}

router.get("/profile", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetProfileResponse.parse(serializeProfile(profile)));
});

router.post("/profile", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({
      id: userId,
      email: parsed.data.email,
      is_pro: false,
      is_admin: false,
    })
    .onConflictDoUpdate({
      target: profilesTable.id,
      set: { email: parsed.data.email },
    })
    .returning();

  res.status(201).json(serializeProfile(profile));
});

export default router;
