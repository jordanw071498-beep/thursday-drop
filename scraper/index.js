/**
 * Thursday Drop — Standalone LCBO Vintages Scraper
 *
 * Usage:
 *   cd scraper && npm install && node index.js
 *
 * Requires DATABASE_URL environment variable.
 * Optionally reads CRON_SECRET (not needed for standalone runs).
 */

import * as cheerio from "cheerio";
import pg from "pg";

const { Pool } = pg;

const BASE = "https://www.vintagesshoponline.com/vintages";
const UA = "Mozilla/5.0 (compatible; ThursdayDropBot/1.0; +https://thursdaydrop.ca)";

const INDEX_PAGES = [
  { url: `${BASE}/ClassicsCollection.aspx`, type: "classics_collection" },
  { url: `${BASE}/SpecialOffer.aspx`, type: "special_offer" },
  { url: `${BASE}/BordeauxFuture.aspx`, type: "bordeaux_futures" },
];

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function fetchHtml(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-CA,en;q=0.9",
      ...(options.headers ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  return resp.text();
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function extractVintage(name) {
  const m = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[0] : null;
}

function parseScore(raw) {
  const m = raw.trim().match(/^(\d+)\s*\(([^)]+)\)$/);
  if (m) return { score: m[1], score_source: m[2] };
  const n = raw.trim().match(/^(\d{2,3})$/);
  if (n) return { score: n[1], score_source: null };
  return { score: null, score_source: null };
}

function categorizeRegion(region, countryGroup) {
  const t = `${region} ${countryGroup}`.toLowerCase();
  if (/burgundy|bourgogne|chablis|c[oô]te[- ]d['']or|c[oô]te de nuits|c[oô]te de beaune|m[aâ]con|meursault|puligny|chassagne|gevrey|chambolle|vosne|nuits|pommard|volnay|beaune/.test(t)) return "burgundy";
  if (/bordeaux|m[eé]doc|pauillac|saint-[eé]milion|saint-estèphe|margaux|pomerol|graves|sauternes|barsac|haut-m[eé]doc/.test(t)) return "bordeaux";
  if (/rh[oô]ne|ch[aâ]teauneuf|hermitage|crozes|gigondas|vacqueyras|c[oô]tes du rh[oô]ne|cornas|saint-joseph|condrieu|c[oô]te-r[oô]tie/.test(t)) return "rhone";
  if (/champagne/.test(t)) return "champagne";
  if (/italy|italia|tuscany|toscana|piedmont|piemonte|veneto|barolo|barbaresco|brunello|chianti|amarone|prosecco|sicil|sardini|emilia|friuli|lombardy/.test(t)) return "italy";
  return "other";
}

function extractProducer(wineName) {
  const noYear = wineName.replace(/\b(19[5-9]\d|20[0-3]\d)\b/g, "").trim();
  const VARIATALS_RE = /\b(Cabernet|Chardonnay|Pinot|Merlot|Syrah|Shiraz|Riesling|Sauvignon|Blanc de Blancs|Blanc de Noirs|Rouge|Brut|Nature|Ros[eé]|NV|Sec|Demi|Grand Cru|Premier Cru|Villages|Superiore|Reserva|Crianza|Cava)\b/i;
  const idx = noYear.search(VARIATALS_RE);
  const base = idx > 1 ? noYear.slice(0, idx).trim() : noYear;
  const words = base.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const first = words[0].toLowerCase();
  if (first === "château" || first === "chateau" || first === "domaine" || first === "maison") {
    return words.slice(0, Math.min(3, words.length)).join(" ");
  }
  return words.slice(0, Math.min(2, words.length)).join(" ") || null;
}

function extractFormFields($) {
  const fields = {};
  $("input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") ?? "";
    if (name) fields[name] = value;
  });
  return fields;
}

function parseWines($, programId, closingDate) {
  const wines = [];
  let currentGroup = "";

  $("table.myList tr").each((_, row) => {
    const $row = $(row);

    if ($row.hasClass("group")) {
      currentGroup = $row.text().trim();
      return;
    }
    if (!$row.hasClass("item") && !$row.hasClass("itemAlt")) return;

    const tds = $row.find("td");
    if (tds.length < 4) return;

    const wineName = $row.find("span[id*='ProductName']").text().trim();
    if (!wineName) return;

    const lcboNumber = $row.find("span[id*='lblItemNumber']").text().trim() || null;
    const region = $(tds[2]).text().trim() || null;
    const scoreRaw = $(tds[3]).text().trim();
    const { score, score_source } = parseScore(scoreRaw);

    let priceRaw = $row.find(".colPricePerBottle").text().trim();
    if (!priceRaw) priceRaw = $(tds[tds.length - 1]).text().trim();
    const price = priceRaw.replace(/[^0-9.]/g, "") || null;

    wines.push({
      wine_name: wineName,
      producer: extractProducer(wineName),
      lcbo_number: lcboNumber,
      region,
      region_category: categorizeRegion(region ?? "", currentGroup),
      vintage: extractVintage(wineName),
      score,
      score_source,
      price,
      qty_available: null,
      closing_date: closingDate,
      buy_url: `${BASE}/Public/OrderProgramProducts.aspx?programId=${programId}&lang=en`,
    });
  });

  return wines;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

async function discoverPrograms() {
  const programs = [];
  const seen = new Set();

  for (const page of INDEX_PAGES) {
    try {
      console.log(`\n📄 Scraping index: ${page.url}`);
      const html = await fetchHtml(page.url);
      const $ = cheerio.load(html);
      let found = 0;

      $("a[href*='OrderProgramProducts.aspx?programId=']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const m = href.match(/programId=(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        found++;
        const label = $(el).text().trim();
        const closingDate = $(el).closest("tr").find("td").eq(1).text().trim() || null;
        programs.push({ programId: m[1], label, type: page.type, closingDate });
        console.log(`   → programId=${m[1]}  "${label}"  closing: ${closingDate ?? "unknown"}`);
      });

      console.log(`   ✓ Found ${found} program(s) on this page`);
    } catch (err) {
      console.error(`   ✗ Failed: ${err.message}`);
    }
  }

  return programs;
}

// ─── Program scrape ──────────────────────────────────────────────────────────

async function scrapeProgram(info) {
  const url = `${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`;
  const wines = [];
  const errors = [];

  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    return { wines, pages: 0, errors: [`Fetch failed: ${err.message}`] };
  }

  let $ = cheerio.load(html);
  let formFields = extractFormFields($);
  wines.push(...parseWines($, info.programId, info.closingDate));

  const pagerLinks = $("a.pagerButtonClass[href*='__doPostBack']");
  const totalPages = pagerLinks.length + 1;

  for (let p = 2; p <= totalPages; p++) {
    try {
      const link = pagerLinks.filter((_, el) => $(el).attr("aria-label") === `Page ${p}`);
      const href = link.attr("href") ?? "";
      const m = href.match(/__doPostBack\('([^']+)','([^']*)'\)/);
      if (!m) break;

      const body = new URLSearchParams({ ...formFields, __EVENTTARGET: m[1], __EVENTARGUMENT: m[2] });
      const pageHtml = await fetchHtml(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: url },
        body: body.toString(),
      });

      const $p = cheerio.load(pageHtml);
      formFields = { ...formFields, ...extractFormFields($p) };
      wines.push(...parseWines($p, info.programId, info.closingDate));
      console.log(`     Page ${p}: +${parseWines($p, info.programId, info.closingDate).length} wines`);
    } catch (err) {
      errors.push(`Page ${p}: ${err.message}`);
    }
  }

  return { wines, pages: totalPages, errors };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function programExists(programId) {
  const r = await db.query("SELECT id FROM release_cycles WHERE program_id = $1 LIMIT 1", [programId]);
  return r.rows.length > 0;
}

async function insertCycle(info, wineCount) {
  const r = await db.query(
    `INSERT INTO release_cycles (program_id, program_label, program_type, closing_date, wine_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [info.programId, info.label, info.type, info.closingDate, wineCount],
  );
  return r.rows[0].id;
}

async function insertWine(cycleId, w) {
  const r = await db.query(
    `INSERT INTO wines (release_cycle_id, wine_name, producer, lcbo_number, region, region_category,
       vintage, score, score_source, price, qty_available, closing_date, buy_url, sold_out)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false) RETURNING id, wine_name, producer, vintage`,
    [cycleId, w.wine_name, w.producer, w.lcbo_number, w.region, w.region_category,
      w.vintage, w.score, w.score_source, w.price, w.qty_available, w.closing_date, w.buy_url],
  );
  return r.rows[0];
}

async function runMatchingEngine(insertedWines) {
  const wl = await db.query("SELECT * FROM watchlist_items");
  let matched = 0;

  for (const wine of insertedWines) {
    for (const item of wl.rows) {
      let matches = false;
      if (item.match_type === "producer") {
        if (wine.producer && item.producer) {
          matches = wine.producer.toLowerCase().includes(item.producer.toLowerCase()) ||
            item.producer.toLowerCase().includes(wine.producer.toLowerCase());
        }
      } else {
        const nameHit = wine.wine_name.toLowerCase().includes(item.wine_name.toLowerCase()) ||
          item.wine_name.toLowerCase().includes(wine.wine_name.toLowerCase());
        if (nameHit) {
          matches = item.match_type === "wine" || !item.vintage || wine.vintage === item.vintage;
        }
      }
      if (matches) {
        try {
          await db.query(
            `INSERT INTO alerts (user_id, wine_id, wine_name, sent)
             VALUES ($1, $2, $3, false)
             ON CONFLICT DO NOTHING`,
            [item.user_id, wine.id, wine.wine_name],
          );
          matched++;
        } catch { /* skip */ }
      }
    }
  }
  return matched;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Thursday Drop — LCBO Vintages Scraper  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const programs = await discoverPrograms();
  console.log(`\n✓ Discovered ${programs.length} total program(s)\n`);

  let totalWines = 0;

  for (const info of programs) {
    console.log(`\n━━━ Program ${info.programId}: "${info.label}" ━━━`);

    const exists = await programExists(info.programId);
    if (exists) {
      console.log("   ↷ Already in database — skipping");
      continue;
    }

    console.log(`   Scraping: ${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`);
    const { wines, pages, errors } = await scrapeProgram(info);
    console.log(`   → ${wines.length} wines across ${pages} page(s)`);

    if (errors.length) {
      console.warn(`   ⚠ Errors: ${errors.join("; ")}`);
    }

    if (!wines.length) {
      console.log("   (no wines to insert)");
      continue;
    }

    const cycleId = await insertCycle(info, wines.length);
    const inserted = [];
    for (const w of wines) {
      const row = await insertWine(cycleId, w);
      inserted.push(row);
    }

    const alerts = await runMatchingEngine(inserted);

    console.log(`   ✓ Inserted ${inserted.length} wines, queued ${alerts} alert(s)`);
    console.log(`\n   First 5 wines:`);
    wines.slice(0, 5).forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.wine_name}`);
      console.log(`      LCBO#: ${w.lcbo_number ?? "—"}  |  Region: ${w.region ?? "—"}  |  Category: ${w.region_category}`);
      console.log(`      Score: ${w.score ?? "—"}${w.score_source ? ` (${w.score_source})` : ""}  |  Price: $${w.price ?? "—"}  |  Vintage: ${w.vintage ?? "NV"}`);
      console.log(`      Producer: ${w.producer ?? "—"}  |  Closing: ${w.closing_date ?? "—"}`);
    });

    totalWines += wines.length;
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  Done: ${String(totalWines).padEnd(4)} wines from ${String(programs.length).padEnd(2)} programs          ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  await db.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
