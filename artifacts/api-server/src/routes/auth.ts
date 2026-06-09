import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { db, profilesTable, passwordResetTokensTable } from "@workspace/db";
import { getAuthProfile, serializeProfile } from "../lib/auth.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const router: IRouter = Router();

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*]/.test(password)) return "Password must contain at least one special character (!@#$%^&*)";
  return null;
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
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
  const unsubscribe_token = crypto.randomUUID();

  const [profile] = await db
    .insert(profilesTable)
    .values({
      id,
      email: normalizedEmail,
      password_hash,
      session_token,
      unsubscribe_token,
      is_pro: false,
      is_admin: false,
      alerts_enabled: true,
    })
    .returning();

  // Fire-and-forget signup notification — do not block the response
  const signupTime = new Date().toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "long",
    timeStyle: "short",
  });
  resend.emails.send({
    from: "Thursday Drop <alerts@thursdaydrop.ca>",
    to: "thursdaydrop.ca@gmail.com",
    subject: `New signup: ${normalizedEmail}`,
    html: `
      <p><strong>New Thursday Drop account created</strong></p>
      <p><strong>Email:</strong> ${normalizedEmail}</p>
      <p><strong>Plan:</strong> Free</p>
      <p><strong>Signed up:</strong> ${signupTime} ET</p>
    `,
  }).catch((err: unknown) => {
    req.log.error({ err }, "Signup notification email failed");
  });

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

// Forgot password — sends reset email
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, normalizedEmail))
    .limit(1);

  // Always return success to avoid leaking whether an email exists
  if (!profile) {
    res.json({ success: true });
    return;
  }

  // Invalidate any existing tokens for this user
  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.user_id, profile.id));

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    id: crypto.randomUUID(),
    user_id: profile.id,
    token,
    expires_at: expiresAt,
    used: false,
  });

  try {
    const emailLib = await import("../lib/email.js");
    await emailLib.sendPasswordResetEmail(profile.email, token);
  } catch (err) {
    req.log.error({ err }, "Failed to send password reset email");
    // Don't expose the error — still return success
  }

  res.json({ success: true });
});

// Reset password — validates token and sets new password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body ?? {};

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Reset token is required" });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "New password is required" });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const now = new Date();

  const [resetRecord] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        eq(passwordResetTokensTable.used, false),
        gt(passwordResetTokensTable.expires_at, now),
      ),
    )
    .limit(1);

  if (!resetRecord) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, resetRecord.user_id))
    .limit(1);

  if (!profile) {
    res.status(400).json({ error: "Account not found." });
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const session_token = crypto.randomUUID();

  const [updated] = await db
    .update(profilesTable)
    .set({ password_hash, session_token })
    .where(eq(profilesTable.id, profile.id))
    .returning();

  // Mark the token as used
  await db
    .update(passwordResetTokensTable)
    .set({ used: true })
    .where(eq(passwordResetTokensTable.id, resetRecord.id));

  res.json({ token: session_token, profile: serializeProfile(updated) });
});

// Unsubscribe via token (no auth required)
router.get("/auth/unsubscribe", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    res.status(400).json({ error: "Missing unsubscribe token" });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.unsubscribe_token, token))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Invalid or expired unsubscribe token" });
    return;
  }

  await db
    .update(profilesTable)
    .set({ alerts_enabled: false })
    .where(eq(profilesTable.id, profile.id));

  res.json({ success: true });
});

router.post("/auth/admin-login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};

  if (username !== "admin") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(503).json({ error: "ADMIN_PASSWORD not configured" });
    return;
  }
  if (password !== adminPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.is_admin, true))
    .limit(1);

  const session_token = crypto.randomUUID();

  let profile;
  if (existing) {
    const [updated] = await db
      .update(profilesTable)
      .set({ session_token, is_pro: true, is_admin: true })
      .where(eq(profilesTable.id, existing.id))
      .returning();
    profile = updated;
  } else {
    const password_hash = await bcrypt.hash(crypto.randomUUID(), 12);
    const [created] = await db
      .insert(profilesTable)
      .values({
        id: crypto.randomUUID(),
        email: "admin@thursday-drop.internal",
        password_hash,
        session_token,
        is_pro: true,
        is_admin: true,
      })
      .returning();
    profile = created;
  }

  res.json({ token: session_token, profile: serializeProfile(profile) });
});

export default router;
