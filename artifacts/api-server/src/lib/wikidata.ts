import { upsertSuggestions } from "./suggestions.js";
import { logger } from "./logger.js";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "ThursdayDropBot/1.0 (https://thursdaydrop.ca)";

interface WikidataEntity {
  qid: string;
  label: string;
}

const PRODUCER_ENTITIES: WikidataEntity[] = [
  { qid: "Q156311", label: "winery" },
  { qid: "Q205763", label: "distillery" },
  { qid: "Q131734", label: "brewery" },
];

async function querySparql(entityQid: string, limit = 4000): Promise<string[]> {
  const sparql = [
    "SELECT DISTINCT ?label WHERE {",
    `  ?item wdt:P31 wd:${entityQid} .`,
    "  ?item rdfs:label ?label .",
    '  FILTER(LANG(?label) = "en")',
    "}",
    `LIMIT ${limit}`,
  ].join("\n");

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });

  if (!res.ok) {
    throw new Error(`Wikidata SPARQL responded ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as { results: { bindings: Array<{ label?: { value: string } }> } };
  return (data.results?.bindings ?? [])
    .map((b) => b.label?.value ?? "")
    .filter((s) => s.length >= 2 && s.length <= 200);
}

export interface WikidataImportResult {
  total: number;
  by_entity: Array<{ qid: string; label: string; fetched: number; error?: string }>;
}

/**
 * Fetch CC0 winery/distillery/brewery names from Wikidata SPARQL and upsert
 * them into wine_suggestions as type="producer".
 */
export async function importWikidata(): Promise<WikidataImportResult> {
  let total = 0;
  const by_entity: WikidataImportResult["by_entity"] = [];

  for (const entity of PRODUCER_ENTITIES) {
    logger.info({ qid: entity.qid, label: entity.label }, "Fetching Wikidata producers");

    try {
      const names = await querySparql(entity.qid);
      logger.info({ qid: entity.qid, label: entity.label, fetched: names.length }, "Wikidata producers fetched");

      if (names.length > 0) {
        await upsertSuggestions(
          names.map((name) => ({
            display_name: name,
            producer: name,
            wine_name: null,
            type: "producer" as const,
          })),
          "wikidata",
        );
      }

      total += names.length;
      by_entity.push({ qid: entity.qid, label: entity.label, fetched: names.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, qid: entity.qid, label: entity.label }, "Wikidata fetch failed");
      by_entity.push({ qid: entity.qid, label: entity.label, fetched: 0, error: msg });
    }
  }

  return { total, by_entity };
}
