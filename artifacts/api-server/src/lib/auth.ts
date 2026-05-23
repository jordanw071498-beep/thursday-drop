import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import type { Request } from "express";

export type AuthProfile = typeof profilesTable.$inferSelect;

export async function getAuthProfile(req: Request): Promise<AuthProfile | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.session_token, token))
    .limit(1);

  return profile ?? null;
}

export function serializeProfile(p: AuthProfile) {
  return {
    id: p.id,
    email: p.email,
    is_pro: p.is_pro,
    is_admin: p.is_admin,
    stripe_customer_id: p.stripe_customer_id ?? null,
    created_at: p.created_at.toISOString(),
  };
}
