import { db, releaseCyclesTable, winesTable, watchlistItemsTable, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const BASE_URL = "https://www.vintagesshoponline.com/vintages/Public";

interface ScrapedWine {
  wine_name: string;
  producer: string | null;
  lcbo_number: string | null;
  region: string | null;
  region_category: string | null;
  vintage: string | null;
  score: string | null;
  score_source: string | null;
  price: string | null;
  qty_available: number | null;
  closing_date: string | null;
  buy_url: string | null;
}

function extractVintageFromName(wineName: string): string | null {
  const match = wineName.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

async function discoverProgramIds(): Promise<{ programId: string; label: string; type: string }[]> {
  const pages = [
    { url: `${BASE_URL}/SpecialOffers.aspx?lang=en`, type: "special_offers" },
    { url: `${BASE_URL}/MonthlyFeatures.aspx?lang=en`, type: "monthly_features" },
    { url: `${BASE_URL}/BordeauxFutures.aspx?lang=en`, type: "bordeaux_futures" },
  ];

  const programs: { programId: string; label: string; type: string }[] = [];

  for (const page of pages) {
    try {
      const resp = await fetch(page.url, {
        headers: { "User-Agent": "Mozilla/5.0 ThursdayDropBot/1.0" },
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const programRegex = /programId=(\d+)/gi;
      let match;
      const seen = new Set<string>();

      while ((match = programRegex.exec(html)) !== null) {
        const programId = match[1];
        if (!seen.has(programId)) {
          seen.add(programId);
          programs.push({ programId, label: `Program ${programId}`, type: page.type });
        }
      }
    } catch (err) {
      logger.warn({ err, url: page.url }, "Failed to fetch program page");
    }
  }

  if (programs.length === 0) {
    programs.push(
      { programId: "1000", label: "Current Release", type: "special_offers" },
    );
  }

  return programs;
}

async function scrapeProgram(programId: string): Promise<ScrapedWine[]> {
  const wines: ScrapedWine[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/OrderProgramProducts.aspx?programId=${programId}&lang=en&page=${page}`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 ThursdayDropBot/1.0" },
      });
      if (!resp.ok) break;
      const html = await resp.text();

      if (html.includes("No products found") || html.includes("0 results")) {
        hasMore = false;
        break;
      }

      const rows = html.match(/<tr[^>]*class="[^"]*wine[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const row of rows) {
        const getText = (pattern: RegExp) => {
          const m = pattern.exec(row);
          return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
        };

        const wineName = getText(/class="[^"]*wine-name[^"]*"[^>]*>(.*?)<\/td>/i) ?? "Unknown Wine";
        const scrapedVintage = getText(/class="[^"]*vintage[^"]*"[^>]*>(.*?)<\/td>/i);
        const vintage = scrapedVintage || extractVintageFromName(wineName);

        wines.push({
          wine_name: wineName,
          producer: getText(/class="[^"]*producer[^"]*"[^>]*>(.*?)<\/td>/i),
          lcbo_number: getText(/class="[^"]*lcbo[^"]*"[^>]*>(.*?)<\/td>/i),
          region: getText(/class="[^"]*region[^"]*"[^>]*>(.*?)<\/td>/i),
          region_category: null,
          vintage,
          score: getText(/class="[^"]*score[^"]*"[^>]*>(.*?)<\/td>/i),
          score_source: getText(/class="[^"]*score-source[^"]*"[^>]*>(.*?)<\/td>/i),
          price: getText(/class="[^"]*price[^"]*"[^>]*>\$?([\d.]+)/i),
          qty_available: null,
          closing_date: null,
          buy_url: null,
        });
      }

      const hasNextPage = html.includes('rel="next"') || html.includes("NextPage");
      if (!hasNextPage || rows.length < 10) hasMore = false;
      else page++;
    } catch (err) {
      logger.warn({ err, programId, page }, "Failed to scrape program page");
      hasMore = false;
    }
  }

  return wines;
}

function wineMatchesWatchlistItem(
  wine: { wine_name: string; producer: string | null; vintage: string | null },
  item: { wine_name: string; vintage: string | null; producer: string | null; match_type: string },
): boolean {
  if (item.match_type === "producer") {
    if (!item.producer || !wine.producer) return false;
    return wine.producer.toLowerCase().includes(item.producer.toLowerCase()) ||
      item.producer.toLowerCase().includes(wine.producer.toLowerCase());
  }

  const nameMatch = wine.wine_name.toLowerCase().includes(item.wine_name.toLowerCase()) ||
    item.wine_name.toLowerCase().includes(wine.wine_name.toLowerCase());

  if (!nameMatch) return false;

  if (item.vintage) {
    return wine.vintage === item.vintage;
  }

  return true;
}

export async function runScraper(): Promise<{ message: string; wines_found: number }> {
  logger.info("Starting scraper run");

  const programs = await discoverProgramIds();
  logger.info({ count: programs.length }, "Discovered programs");

  let totalWines = 0;

  for (const program of programs) {
    const wines = await scrapeProgram(program.programId);

    if (wines.length === 0) continue;

    const [cycle] = await db
      .insert(releaseCyclesTable)
      .values({
        program_id: program.programId,
        program_label: program.label,
        program_type: program.type,
        wine_count: wines.length,
      })
      .returning();

    const insertedWines = [];
    for (const wine of wines) {
      const [inserted] = await db.insert(winesTable).values({
        release_cycle_id: cycle.id,
        wine_name: wine.wine_name,
        producer: wine.producer,
        lcbo_number: wine.lcbo_number,
        region: wine.region,
        region_category: wine.region_category,
        vintage: wine.vintage,
        score: wine.score,
        score_source: wine.score_source,
        price: wine.price,
        qty_available: wine.qty_available,
        closing_date: wine.closing_date,
        buy_url: wine.buy_url,
        sold_out: false,
      }).returning();
      insertedWines.push(inserted);
    }

    const watchlistItems = await db.select().from(watchlistItemsTable);
    for (const insertedWine of insertedWines) {
      for (const watchlistItem of watchlistItems) {
        if (wineMatchesWatchlistItem(
          { wine_name: insertedWine.wine_name, producer: insertedWine.producer, vintage: insertedWine.vintage },
          watchlistItem,
        )) {
          await db.insert(alertsTable).values({
            user_id: watchlistItem.user_id,
            wine_id: insertedWine.id,
            wine_name: insertedWine.wine_name,
            sent: false,
          }).onConflictDoNothing();
        }
      }
    }

    totalWines += wines.length;
    logger.info({ programId: program.programId, winesFound: wines.length }, "Scraped program");
  }

  return {
    message: `Scraped ${programs.length} programs, found ${totalWines} wines`,
    wines_found: totalWines,
  };
}
