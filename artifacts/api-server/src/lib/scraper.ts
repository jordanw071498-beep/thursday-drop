import * as cheerio from "cheerio";
import { db, releaseCyclesTable, winesTable, watchlistItemsTable, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const BASE = "https://www.vintagesshoponline.com/vintages";
const UA = "Mozilla/5.0 (compatible; ThursdayDropBot/1.0; +https://thursdaydrop.ca)";

const INDEX_PAGES = [
  { url: `${BASE}/ClassicsCollection.aspx`, type: "classics_collection" },
  { url: `${BASE}/SpecialOffer.aspx`, type: "special_offer" },
  { url: `${BASE}/BordeauxFuture.aspx`, type: "bordeaux_futures" },
];

interface ProgramInfo {
  programId: string;
  label: string;
  type: string;
  closingDate: string | null;
}

interface ScrapedWine {
  wine_name: string;
  producer: string | null;
  lcbo_number: string | null;
  region: string | null;
  region_category: string;
  vintage: string | null;
  score: string | null;
  score_source: string | null;
  price: string | null;
  qty_available: number | null;
  closing_date: string | null;
  buy_url: string | null;
}

export interface ScraperResult {
  message: string;
  wines_found: number;
  programs: Array<{
    programId: string;
    label: string;
    pages: number;
    wines: number;
    skipped: boolean;
    errors: string[];
    sample: string[];
  }>;
}

async function fetchHtml(url: string, options?: RequestInit): Promise<string> {
  const resp = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-CA,en;q=0.9",
      ...(options?.headers as Record<string, string> ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  return resp.text();
}

function extractVintage(name: string): string | null {
  const m = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? m[0] : null;
}

function parseScore(raw: string): { score: string | null; score_source: string | null } {
  const m = raw.trim().match(/^(\d+)\s*\(([^)]+)\)$/);
  if (m) return { score: m[1], score_source: m[2] };
  const n = raw.trim().match(/^(\d{2,3})$/);
  if (n) return { score: n[1], score_source: null };
  return { score: null, score_source: null };
}

function categorizeRegion(region: string, countryGroup: string): string {
  const t = `${region} ${countryGroup}`.toLowerCase();
  if (/burgundy|bourgogne|chablis|c[oô]te[- ]d['']or|c[oô]te de nuits|c[oô]te de beaune|m[aâ]con|meursault|puligny|chassagne|gevrey|chambolle|vosne|nuits|pommard|volnay|beaune|mercurey|rully|givry|montagny/.test(t)) return "burgundy";
  if (/bordeaux|m[eé]doc|pauillac|saint-[eé]milion|saint-estèphe|margaux|pomerol|graves|sauternes|barsac|listrac|moulis|haut-m[eé]doc/.test(t)) return "bordeaux";
  if (/rh[oô]ne|ch[aâ]teauneuf|hermitage|crozes|gigondas|vacqueyras|c[oô]tes du rh[oô]ne|cornas|saint-joseph|condrieu|c[oô]te-r[oô]tie|lirac/.test(t)) return "rhone";
  if (/champagne/.test(t)) return "champagne";
  if (/italy|italia|tuscany|toscana|piedmont|piemonte|veneto|barolo|barbaresco|brunello|chianti|amarone|prosecco|sicil|sardini|emilia|friuli|lombardy/.test(t)) return "italy";
  return "other";
}

function extractProducer(wineName: string): string | null {
  const noYear = wineName.replace(/\b(19[5-9]\d|20[0-3]\d)\b/g, "").trim();
  const VARIATALS_RE = /\b(Cabernet|Chardonnay|Pinot|Merlot|Syrah|Shiraz|Riesling|Sauvignon|Blanc de Blancs|Blanc de Noirs|Rouge|Brut|Nature|Ros[eé]|NV|Sec|Demi|Grand Cru|Premier Cru|Villages|Superiore|Reserva|Crianza|Cava)\b/i;
  const idx = noYear.search(VARIATALS_RE);
  const base = idx > 1 ? noYear.slice(0, idx).trim() : noYear;
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0].toLowerCase();
  if (first === "château" || first === "chateau" || first === "domaine" || first === "maison") {
    return words.slice(0, Math.min(3, words.length)).join(" ");
  }
  return words.slice(0, Math.min(2, words.length)).join(" ") || null;
}

function extractFormFields($: cheerio.CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {};
  $("input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") ?? "";
    if (name) fields[name] = value;
  });
  return fields;
}

function parseWines($: cheerio.CheerioAPI, programId: string, closingDate: string | null): ScrapedWine[] {
  const wines: ScrapedWine[] = [];
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

    const vintage = extractVintage(wineName);
    const producer = extractProducer(wineName);
    const region_category = categorizeRegion(region ?? "", currentGroup);
    const buy_url = `https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=${programId}&lang=en`;

    wines.push({
      wine_name: wineName,
      producer,
      lcbo_number: lcboNumber,
      region,
      region_category,
      vintage,
      score,
      score_source,
      price,
      qty_available: null,
      closing_date: closingDate,
      buy_url,
    });
  });

  return wines;
}

async function scrapeProgram(info: ProgramInfo): Promise<{ wines: ScrapedWine[]; pages: number; errors: string[] }> {
  const url = `${BASE}/Public/OrderProgramProducts.aspx?programId=${info.programId}&lang=en`;
  const wines: ScrapedWine[] = [];
  const errors: string[] = [];

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err: any) {
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
      if (!m) {
        logger.warn({ programId: info.programId, page: p }, "No postback found for page");
        break;
      }

      const body = new URLSearchParams({
        ...formFields,
        __EVENTTARGET: m[1],
        __EVENTARGUMENT: m[2],
      });

      const pageHtml = await fetchHtml(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: url,
        },
        body: body.toString(),
      });

      const $p = cheerio.load(pageHtml);
      formFields = { ...formFields, ...extractFormFields($p) };
      wines.push(...parseWines($p, info.programId, info.closingDate));
    } catch (err: any) {
      errors.push(`Page ${p}: ${err.message}`);
      logger.warn({ err, programId: info.programId, page: p }, "Page scrape failed");
    }
  }

  return { wines, pages: totalPages, errors };
}

async function discoverPrograms(): Promise<ProgramInfo[]> {
  const programs: ProgramInfo[] = [];
  const seen = new Set<string>();

  for (const page of INDEX_PAGES) {
    try {
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
      });

      logger.info({ url: page.url, found }, "Index page scraped");
    } catch (err) {
      logger.warn({ err, url: page.url }, "Index page failed");
    }
  }

  return programs;
}

async function runMatchingEngine(
  insertedWines: Array<{ id: number; wine_name: string; producer: string | null; vintage: string | null }>,
): Promise<number> {
  const watchlistItems = await db.select().from(watchlistItemsTable);
  let matched = 0;

  for (const wine of insertedWines) {
    for (const item of watchlistItems) {
      let matches = false;

      if (item.match_type === "producer") {
        if (wine.producer && item.producer) {
          matches =
            wine.producer.toLowerCase().includes(item.producer.toLowerCase()) ||
            item.producer.toLowerCase().includes(wine.producer.toLowerCase());
        }
      } else {
        const nameHit =
          wine.wine_name.toLowerCase().includes(item.wine_name.toLowerCase()) ||
          item.wine_name.toLowerCase().includes(wine.wine_name.toLowerCase());
        if (nameHit) {
          matches = item.match_type === "wine" || !item.vintage || wine.vintage === item.vintage;
        }
      }

      if (matches) {
        try {
          await db
            .insert(alertsTable)
            .values({ user_id: item.user_id, wine_id: wine.id, wine_name: wine.wine_name, sent: false })
            .onConflictDoNothing();
          matched++;
        } catch {
          // ignore duplicate conflicts
        }
      }
    }
  }

  return matched;
}

export async function runScraper(): Promise<ScraperResult> {
  logger.info("Scraper run started");
  const summaries: ScraperResult["programs"] = [];
  let totalWines = 0;

  const programs = await discoverPrograms();
  logger.info({ count: programs.length }, "Programs discovered");

  for (const info of programs) {
    const existing = await db
      .select()
      .from(releaseCyclesTable)
      .where(eq(releaseCyclesTable.program_id, info.programId))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ programId: info.programId }, "Already scraped, skipping");
      summaries.push({ programId: info.programId, label: info.label, pages: 0, wines: 0, skipped: true, errors: [], sample: [] });
      continue;
    }

    const { wines, pages, errors } = await scrapeProgram(info);
    logger.info({ programId: info.programId, wines: wines.length, pages }, "Program scraped");

    if (wines.length === 0) {
      summaries.push({ programId: info.programId, label: info.label, pages, wines: 0, skipped: false, errors: errors.length ? errors : ["No wines found"], sample: [] });
      continue;
    }

    const [cycle] = await db
      .insert(releaseCyclesTable)
      .values({
        program_id: info.programId,
        program_label: info.label,
        program_type: info.type,
        closing_date: info.closingDate,
        wine_count: wines.length,
      })
      .returning();

    const inserted: Array<{ id: number; wine_name: string; producer: string | null; vintage: string | null }> = [];

    for (const w of wines) {
      const [row] = await db
        .insert(winesTable)
        .values({
          release_cycle_id: cycle.id,
          wine_name: w.wine_name,
          producer: w.producer,
          lcbo_number: w.lcbo_number,
          region: w.region,
          region_category: w.region_category,
          vintage: w.vintage,
          score: w.score,
          score_source: w.score_source,
          price: w.price,
          qty_available: w.qty_available,
          closing_date: w.closing_date,
          buy_url: w.buy_url,
          sold_out: false,
        })
        .returning();
      inserted.push({ id: row.id, wine_name: row.wine_name, producer: row.producer, vintage: row.vintage });
    }

    const alertsQueued = await runMatchingEngine(inserted);
    logger.info({ programId: info.programId, alertsQueued }, "Matching engine done");

    totalWines += wines.length;
    summaries.push({
      programId: info.programId,
      label: info.label,
      pages,
      wines: wines.length,
      skipped: false,
      errors,
      sample: wines.slice(0, 5).map((w) => `${w.wine_name} | LCBO#${w.lcbo_number} | ${w.region} | ${w.score}${w.score_source ? ` (${w.score_source})` : ""} | $${w.price} | ${w.vintage ?? "NV"}`),
    });
  }

  logger.info({ totalWines, programs: programs.length }, "Scraper run complete");
  return {
    message: `Scraped ${programs.length} programs, inserted ${totalWines} wines`,
    wines_found: totalWines,
    programs: summaries,
  };
}
