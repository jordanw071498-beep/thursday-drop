/**
 * Supplemental seed: batch 2 — user-requested big names.
 * Run: pnpm --filter @workspace/scripts run seed-collectible-wines-2
 */
import { db, wineSuggestionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

type SuggestionInput = {
  display_name: string;
  producer: string | null;
  wine_name: string | null;
  type: "wine" | "producer";
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

async function upsert(items: SuggestionInput[], source: string) {
  const seen = new Map<string, {
    display_name: string; normalized_name: string;
    producer: string | null; wine_name: string | null;
    type: string; source: string; count: number;
  }>();
  for (const item of items) {
    const name = item.display_name.trim();
    if (!name) continue;
    const key = `${normalize(name)}::${item.type}`;
    if (!seen.has(key)) {
      seen.set(key, {
        display_name: name, normalized_name: normalize(name),
        producer: item.producer ?? null, wine_name: item.wine_name ?? null,
        type: item.type, source, count: 1,
      });
    }
  }
  const values = [...seen.values()];
  const BATCH = 50;
  for (let i = 0; i < values.length; i += BATCH) {
    await db.insert(wineSuggestionsTable).values(values.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: [wineSuggestionsTable.display_name, wineSuggestionsTable.type],
        set: { count: sql`${wineSuggestionsTable.count} + 1` },
      });
  }
  return values.length;
}

function wine(name: string): SuggestionInput {
  return { display_name: name, wine_name: name, producer: null, type: "wine" };
}
function producer(name: string): SuggestionInput {
  return { display_name: name, producer: name, wine_name: null, type: "producer" };
}

const ENTRIES: SuggestionInput[] = [
  // ── Fontodi ──────────────────────────────────────────────────────────
  producer("Fontodi"),
  wine("Flaccianello della Pieve"),      // 100% Sangiovese IGT — Fontodi's flagship
  wine("Vigna del Sorbo"),               // Chianti Classico Gran Selezione

  // ── Castello di Ama ──────────────────────────────────────────────────
  producer("Castello di Ama"),
  wine("L'Apparita"),                    // 100% Merlot, iconic Chianti Classico estate
  wine("San Lorenzo"),                   // Castello di Ama Gran Selezione CCGS

  // ── Bellavista (Franciacorta) ─────────────────────────────────────────
  producer("Bellavista"),
  wine("Bellavista Vittorio Moretti"),   // top prestige cuvée
  wine("Bellavista Alma Gran Cuvée"),

  // ── Shafer ───────────────────────────────────────────────────────────
  producer("Shafer Vineyards"),
  wine("Hillside Select"),               // Stags Leap Cabernet Sauvignon
  wine("One Point Five"),                // Stags Leap Cabernet (second tier)
  wine("Relentless"),                    // Syrah/Petite Sirah
  wine("Red Shoulder Ranch"),            // Carneros Chardonnay

  // ── Poggio Antico ─────────────────────────────────────────────────────
  producer("Poggio Antico"),
  wine("Altero"),                        // Poggio Antico Brunello Riserva
  wine("Poggio Antico Brunello di Montalcino"),
  wine("Poggio Antico Brunello Riserva"),

  // ── Caymus ────────────────────────────────────────────────────────────
  producer("Caymus Vineyards"),
  wine("Caymus Cabernet Sauvignon"),     // Napa Valley
  wine("Caymus Special Selection"),      // flagship single-vineyard blend

  // ── Faust ─────────────────────────────────────────────────────────────
  producer("Faust"),
  wine("Faust Cabernet Sauvignon"),      // Napa Valley (from Quintessa group)
  wine("Faust The Pact"),                // ultra-premium tier

  // ── Chateau Montelena ─────────────────────────────────────────────────
  producer("Chateau Montelena"),
  wine("Montelena Estate Cabernet Sauvignon"),
  wine("Chateau Montelena Chardonnay"),

  // ── Argiano ───────────────────────────────────────────────────────────
  producer("Argiano"),
  wine("Solengo"),                       // Argiano's Super Tuscan (Cab/Merlot/Syrah/Petit Verdot)
  wine("Argiano Brunello di Montalcino"),
  wine("Argiano Brunello Riserva"),

  // ── Altesino ──────────────────────────────────────────────────────────
  producer("Altesino"),
  wine("Montosoli"),                     // single-vineyard Brunello from Altesino
  wine("Altesino Brunello di Montalcino"),
  wine("Altesino Brunello Riserva"),

  // ── Cakebread Cellars ─────────────────────────────────────────────────
  producer("Cakebread Cellars"),
  wine("Cakebread Cabernet Sauvignon"),  // Napa Valley
  wine("Cakebread Chardonnay"),          // Napa Valley

  // ── CastelGiocondo (Frescobaldi) ─────────────────────────────────────
  producer("CastelGiocondo"),
  wine("CastelGiocondo Brunello di Montalcino"),
  wine("Ripe al Convento"),              // CastelGiocondo Brunello Riserva
  wine("Ripe al Convento di CastelGiocondo"), // full formal name

  // ── Château de Beaucastel ────────────────────────────────────────────
  producer("Château de Beaucastel"),
  wine("Beaucastel Hommage à Jacques Perrin"),  // already in DB, bumps count
  wine("Beaucastel Châteauneuf-du-Pape"),

  // ── Conti Costanti ────────────────────────────────────────────────────
  producer("Conti Costanti"),
  wine("Costanti Brunello di Montalcino"),
  wine("Costanti Brunello Riserva"),

  // ── Fattoria Le Pupille ───────────────────────────────────────────────
  producer("Fattoria Le Pupille"),
  wine("Saffredi"),                      // Maremma IGT (Cab/Merlot/Alicante Bouschet)

  // ── Dunn Vineyards ────────────────────────────────────────────────────
  producer("Dunn Vineyards"),
  wine("Dunn Howell Mountain Cabernet Sauvignon"),
  wine("Dunn Napa Valley Cabernet Sauvignon"),

  // ── Gaja (additional wines) ───────────────────────────────────────────
  wine("Sperss"),                        // Gaja Barolo (Serralunga d'Alba)
  wine("Conteisa"),                      // Gaja Barolo (La Morra)
  wine("Darmagi"),                       // Gaja Langhe Cabernet Sauvignon
  wine("Gaia & Rey"),                    // Gaja Langhe Chardonnay
  wine("Rossj-Bass"),                    // Gaja Langhe (Chardonnay + Sauvignon Blanc)
  producer("Ca' Marcanda"),              // Gaja's Bolgheri estate
  wine("Magari"),                        // Ca'Marcanda blend (Cab/Merlot/Cab Franc)
  wine("Promis"),                        // Ca'Marcanda blend (Merlot/Syrah/Sangiovese)
  wine("Ca' Marcanda Camarcanda"),       // Ca'Marcanda's flagship

  // ── Pio Cesare ────────────────────────────────────────────────────────
  producer("Pio Cesare"),
  wine("Barolo Ornato"),                 // Pio Cesare single-vineyard Barolo
  wine("Barolo Mosconi"),                // Pio Cesare Mosconi vineyard Barolo
  wine("Barbaresco Il Bricco"),          // Pio Cesare single-vineyard Barbaresco
  wine("Piodilei"),                      // Pio Cesare Langhe Chardonnay
  wine("Pio Cesare Barolo"),
  wine("Pio Cesare Barbaresco"),

  // ── Quintessa ─────────────────────────────────────────────────────────
  producer("Quintessa"),
  wine("Quintessa Red Wine"),            // Rutherford Napa red blend

  // ── Luce della Vite (Frescobaldi + Mondavi) ───────────────────────────
  producer("Luce della Vite"),
  wine("Luce"),                          // flagship Sangiovese/Merlot
  wine("Lucente"),                       // second wine (Sangiovese/Merlot)

  // ── Tenuta Sette Ponti ────────────────────────────────────────────────
  producer("Tenuta Sette Ponti"),
  wine("Oreno"),                         // flagship Merlot/Cabernet/Petit Verdot

  // ── Joseph Phelps ─────────────────────────────────────────────────────
  producer("Joseph Phelps Vineyards"),
  wine("Insignia"),                      // Napa Valley Bordeaux blend
  wine("Joseph Phelps Insignia"),        // with producer prefix

  // ── La Rioja Alta ─────────────────────────────────────────────────────
  producer("La Rioja Alta"),
  wine("La Rioja Alta Gran Reserva 890"),
  wine("La Rioja Alta Gran Reserva 904"),
  wine("Gran Reserva 890"),              // how it appears on LCBO
  wine("Gran Reserva 904"),
  wine("Viña Ardanza"),                  // La Rioja Alta Reserva
  wine("Viña Alberdi"),                  // La Rioja Alta Crianza

  // ── Marqués de Murrieta ───────────────────────────────────────────────
  producer("Marqués de Murrieta"),
  wine("Castillo Ygay"),                 // Gran Reserva Especial (top bottling)
  wine("Castillo Ygay Blanco"),          // white Gran Reserva
  wine("Capellanía"),                    // 100% Viura white Rioja Reserva
  wine("Marqués de Murrieta Reserva"),
  wine("Marqués de Murrieta Gran Reserva"),

  // ── Pazo Barrantes (Rías Baixas) ──────────────────────────────────────
  producer("Pazo Barrantes"),
  wine("Pazo Barrantes Albariño"),
  wine("Pazo Barrantes La Comtesse"),    // prestige cuvée Albariño

  // ── Antinori estate wines ─────────────────────────────────────────────
  producer("Antinori"),
  wine("Tignanello"),                    // already in DB
  wine("Solaia"),                        // already in DB
  wine("Guado al Tasso"),                // Bolgheri Superiore (Cab/Merlot/Syrah)
  wine("Guado al Tasso Vermentino"),
  wine("Le Difese"),                     // Tenuta San Guido entry wine

  // ── Masseto / Ornellaia ───────────────────────────────────────────────
  producer("Masseto"),
  wine("Masseto"),                       // already in DB — bumps count
  wine("Ornellaia"),                     // already in DB
  wine("Le Serre Nuove"),                // Ornellaia's second wine
  wine("Le Volte dell'Ornellaia"),       // entry-level Ornellaia

  // ── Tenuta San Guido ─────────────────────────────────────────────────
  producer("Tenuta San Guido"),
  wine("Sassicaia"),                     // already in DB
  wine("Guidalberto"),                   // already in DB
  wine("Le Difese"),                     // entry-level (Sangiovese/Cabernet)
];

async function main() {
  console.log(`Seeding ${ENTRIES.length} entries…`);
  const n = await upsert(ENTRIES, "curated");
  console.log(`Done — ${n} unique entries upserted (existing ones got count bumped).`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
