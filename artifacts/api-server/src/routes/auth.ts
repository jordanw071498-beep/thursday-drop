import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, profilesTable } from "@workspace/db";
import { getAuthProfile, serializeProfile } from "../lib/auth.js";

const router: IRouter = Router();

router.post("/auth/signup", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const session_token = crypto.randomUUID();
  const id = crypto.randomUUID();

  const [profile] = await db
    .insert(profilesTable)
    .values({
      id,
      email: normalizedEmail,
      password_hash,
      session_token,
      is_pro: false,
      is_admin: false,
    })
    .returning();

  res.status(201).json({ token: session_token, profile: serializeProfile(profile) });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, normalizedEmail))
    .limit(1);

  if (!profile || !profile.password_hash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, profile.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const session_token = crypto.randomUUID();

  const [updated] = await db
    .update(profilesTable)
    .set({ session_token })
    .where(eq(profilesTable.id, profile.id))
    .returning();

  res.json({ token: session_token, profile: serializeProfile(updated) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (profile) {
    await db
      .update(profilesTable)
      .set({ session_token: null })
      .where(eq(profilesTable.id, profile.id));
  }
  res.status(204).send();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(serializeProfile(profile));
});

export default router;
