import { Router, type IRouter } from "express";
import { db, emailSubscribersTable } from "@workspace/db";
import { EmailSubscribeBody } from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/email/subscribe", async (req, res): Promise<void> => {
  const parsed = EmailSubscribeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email } = parsed.data;

  await db
    .insert(emailSubscribersTable)
    .values({ email, subscribed: true })
    .onConflictDoUpdate({
      target: emailSubscribersTable.email,
      set: { subscribed: true },
    });

  res.json({ success: true, message: "Subscribed successfully" });
});

export default router;
