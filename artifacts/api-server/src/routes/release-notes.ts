/**
 * release-notes.ts — Weekly Release Notes API
 *
 * ISOLATION GUARANTEE:
 *   - Imports ONLY: db, releaseNotesTable from @workspace/db
 *   - Never imports or calls: runMatchingEngine, sendPendingAlerts,
 *     sendMorningAlerts, alertFlusher, Resend, or any email function
 *   - Never writes to: alerts, watchlist_items, wines, release_cycles,
 *     profiles, or any table other than release_notes
 */

import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, releaseNotesTable } from "@workspace/db";
import { getAuthProfile } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function computeReadingTime(body: string): number {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * GET /api/release-notes
 * List all published notes, newest first. Logged-in users only.
 */
router.get("/release-notes", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }

  const notes = await db
    .select({
      id:                   releaseNotesTable.id,
      slug:                 releaseNotesTable.slug,
      title:                releaseNotesTable.title,
      excerpt:              releaseNotesTable.excerpt,
      hero_image_url:       releaseNotesTable.hero_image_url,
      author:               releaseNotesTable.author,
      article_type:         releaseNotesTable.article_type,
      status:               releaseNotesTable.status,
      published_at:         releaseNotesTable.published_at,
      reading_time_minutes: releaseNotesTable.reading_time_minutes,
      view_count:           releaseNotesTable.view_count,
      created_at:           releaseNotesTable.created_at,
    })
    .from(releaseNotesTable)
    .where(eq(releaseNotesTable.status, "published"))
    .orderBy(desc(releaseNotesTable.published_at));

  res.json({ notes });
});

/**
 * GET /api/release-notes/:slug
 * Single note by slug. Published to logged-in users; drafts to admins only.
 * Increments view_count (fire-and-forget).
 */
router.get("/release-notes/:slug", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [note] = await db
    .select()
    .from(releaseNotesTable)
    .where(eq(releaseNotesTable.slug, req.params.slug))
    .limit(1);

  if (!note) { res.status(404).json({ error: "Not found" }); return; }
  if (note.status !== "published" && !profile.is_admin) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Increment view_count — does not affect any alert or notification pipeline
  db.update(releaseNotesTable)
    .set({ view_count: sql`${releaseNotesTable.view_count} + 1` })
    .where(eq(releaseNotesTable.id, note.id))
    .catch((err) => logger.error({ err }, "Failed to increment view_count"));

  res.json({ note });
});

/**
 * GET /api/release-notes-admin
 * List all notes (draft + published) for the admin editor.
 */
router.get("/release-notes-admin", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!profile.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const notes = await db
    .select()
    .from(releaseNotesTable)
    .orderBy(desc(releaseNotesTable.created_at));

  res.json({ notes });
});

/**
 * POST /api/release-notes
 * Create a new note. Admin only.
 */
router.post("/release-notes", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!profile.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const { title, body, excerpt, hero_image_url, article_type, status, featured_wines } = req.body;
  let { slug } = req.body;

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!body || typeof body !== "string") {
    res.status(400).json({ error: "body is required" });
    return;
  }

  slug = (typeof slug === "string" && slug.trim()) ? slug.trim() : slugify(title);
  const reading_time_minutes = computeReadingTime(body);
  const resolvedStatus = status === "published" ? "published" : "draft";
  const published_at = resolvedStatus === "published" ? new Date() : null;

  const [note] = await db
    .insert(releaseNotesTable)
    .values({
      slug,
      title,
      body,
      excerpt:              excerpt ?? null,
      hero_image_url:       hero_image_url ?? null,
      author:               "Thursday Drop",
      article_type:         article_type ?? "weekly_release",
      status:               resolvedStatus,
      published_at,
      reading_time_minutes,
      featured_wines:       Array.isArray(featured_wines) ? featured_wines : [],
    })
    .returning();

  logger.info({ id: note.id, slug: note.slug, status: note.status }, "Release note created");
  res.status(201).json({ note });
});

/**
 * PUT /api/release-notes/:id
 * Update a note. Admin only. Publishing sets published_at once (never cleared).
 */
router.put("/release-notes/:id", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!profile.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(releaseNotesTable)
    .where(eq(releaseNotesTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof releaseNotesTable.$inferInsert> = {
    updated_at: new Date(),
  };

  const { title, body, excerpt, hero_image_url, article_type, status, featured_wines, slug } = req.body;

  if (typeof title === "string")         updates.title = title;
  if (typeof body === "string") {
    updates.body = body;
    updates.reading_time_minutes = computeReadingTime(body);
  }
  if (excerpt !== undefined)             updates.excerpt = excerpt ?? null;
  if (hero_image_url !== undefined)      updates.hero_image_url = hero_image_url ?? null;
  if (typeof article_type === "string")  updates.article_type = article_type;
  if (Array.isArray(featured_wines))     updates.featured_wines = featured_wines;
  if (typeof slug === "string" && slug)  updates.slug = slug.trim();

  if (typeof status === "string") {
    updates.status = status;
    if (status === "published" && existing.status !== "published") {
      updates.published_at = new Date();
    }
  }

  const [updated] = await db
    .update(releaseNotesTable)
    .set(updates)
    .where(eq(releaseNotesTable.id, id))
    .returning();

  logger.info({ id: updated.id, status: updated.status }, "Release note updated");
  res.json({ note: updated });
});

/**
 * DELETE /api/release-notes/:id
 * Delete a note. Admin only.
 */
router.delete("/release-notes/:id", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!profile.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(releaseNotesTable).where(eq(releaseNotesTable.id, id));
  logger.info({ id }, "Release note deleted");
  res.json({ success: true });
});

export default router;
