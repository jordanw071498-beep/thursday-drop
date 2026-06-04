import { upsertSuggestions, type SuggestionInput } from "./suggestions.js";
import { logger } from "./logger.js";

/**
 * Curated Scotch, Irish, Japanese, Canadian, and American whisky/spirits
 * names likely to appear in LCBO Vintages releases.
 *
 * Source: LCBO Vintages purchase history, public distillery lists.
 * These are factual producer/brand names — no scraped or licensed content.
 */

const SCOTCH_DISTILLERIES: string[] = [
  // Speyside
  "The Macallan",
  "Glenfiddich",
  "The Glenlivet",
  "Aberlour",
  "Glenfarclas",
  "Balvenie",
  "Cardhu",
  "Craigellachie",
  "Dailuaine",
  "Glen Grant",
  "Glen Moray",
  "GlenAllachie",
  "Glenrothes",
  "Linkwood",
  "Longmorn",
  "Mortlach",
  "Strathisla",
  "Tamnavulin",
  "Tomintoul",
  "Benriach",
  "Aultmore",
  "Speyburn",
  "Dufftown",
  "Mannochmore",
  "Benromach",
  "Knockando",

  // Highland
  "Glenmorangie",
  "Dalmore",
  "Oban",
  "Dalwhinnie",
  "Blair Athol",
  "Edradour",
  "Glengoyne",
  "GlenDronach",
  "Aberfeldy",
  "Ben Nevis",
  "Balblair",
  "Clynelish",
  "Teaninich",
  "Deanston",
  "Tomatin",
  "Ardmore",
  "Glen Ord",
  "Glenturret",
  "Old Pulteney",
  "Royal Brackla",
  "Fettercairn",
  "Glencadam",
  "Macduff",

  // Islay
  "Ardbeg",
  "Laphroaig",
  "Lagavulin",
  "Bowmore",
  "Caol Ila",
  "Bunnahabhain",
  "Bruichladdich",
  "Kilchoman",
  "Port Charlotte",
  "Port Ellen",
  "Octomore",
  "Ardnahoe",

  // Islands
  "Highland Park",
  "Talisker",
  "Tobermory",
  "Ledaig",
  "Scapa",
  "Jura",
  "Arran",

  // Lowland
  "Auchentoshan",
  "Glenkinchie",
  "Bladnoch",

  // Campbeltown
  "Springbank",
  "Glengyle",
  "Glen Scotia",
];

const SCOTCH_EXPRESSIONS: string[] = [
  "Macallan 12",
  "Macallan 15",
  "Macallan 18",
  "Macallan 25",
  "Macallan Double Cask",
  "Macallan Sherry Oak",
  "Macallan Gold",
  "Macallan Rare Cask",
  "Glenfiddich 12",
  "Glenfiddich 15",
  "Glenfiddich 18",
  "Glenfiddich 21",
  "Glenfiddich 30",
  "Glenlivet 12",
  "Glenlivet 15",
  "Glenlivet 18",
  "Glenlivet 21",
  "Glenmorangie Original",
  "Glenmorangie Lasanta",
  "Glenmorangie Quinta Ruban",
  "Glenmorangie Nectar D'Or",
  "Glenmorangie Signet",
  "Dalmore 12",
  "Dalmore 15",
  "Dalmore 18",
  "Dalmore King Alexander III",
  "Dalmore Cigar Malt",
  "Ardbeg 10",
  "Ardbeg An Oa",
  "Ardbeg Uigeadail",
  "Ardbeg Corryvreckan",
  "Laphroaig 10",
  "Laphroaig Quarter Cask",
  "Laphroaig Select",
  "Lagavulin 16",
  "Lagavulin 8",
  "Lagavulin Distillers Edition",
  "Bowmore 12",
  "Bowmore 15",
  "Bowmore 18",
  "Highland Park 12",
  "Highland Park 15",
  "Highland Park 18",
  "Highland Park 21",
  "Talisker 10",
  "Talisker 18",
  "Talisker Storm",
  "Springbank 10",
  "Springbank 15",
  "Springbank 18",
  "GlenDronach 12",
  "GlenDronach 15",
  "GlenDronach 18",
  "GlenDronach 21",
  "Aberlour 12",
  "Aberlour 16",
  "Aberlour A'bunadh",
  "Balvenie DoubleWood 12",
  "Balvenie Caribbean Cask",
  "Balvenie 21",
  "Glenfarclas 10",
  "Glenfarclas 15",
  "Glenfarclas 21",
  "Glenfarclas 25",
  "Glenfarclas 105",
];

const IRISH_WHISKEY: string[] = [
  "Redbreast",
  "Green Spot",
  "Yellow Spot",
  "Red Spot",
  "Midleton Very Rare",
  "Jameson",
  "Jameson 18",
  "Jameson Black Barrel",
  "Teeling",
  "Teeling Single Grain",
  "Teeling Single Malt",
  "Dingle",
  "Knappogue Castle",
  "Bushmills",
  "Bushmills 16",
  "Bushmills 21",
  "Writers Tears",
  "Tullamore D.E.W.",
  "Powers",
  "Connemara",
  "The Irishman",
  "Waterford",
  "Kilbeggan",
];

const JAPANESE_WHISKY: string[] = [
  "Nikka",
  "Nikka From The Barrel",
  "Nikka Coffey Grain",
  "Nikka Coffey Malt",
  "Nikka Days",
  "Yoichi",
  "Miyagikyo",
  "Hibiki",
  "Hibiki Harmony",
  "Hibiki Japanese Harmony",
  "Hakushu",
  "Yamazaki",
  "Yamazaki 12",
  "Yamazaki 18",
  "Toki",
  "Kakubin",
  "Chita",
  "Ichiro's Malt",
  "Akashi",
  "Mars Iwai",
  "Fuji",
  "Tokinoka",
  "Hatozaki",
];

const CANADIAN_WHISKY: string[] = [
  "Crown Royal",
  "Crown Royal Reserve",
  "Crown Royal XO",
  "Canadian Club",
  "Canadian Club 100% Rye",
  "Forty Creek",
  "Lot No. 40",
  "Pike Creek",
  "Gibson's",
  "Wiser's",
  "Wiser's 18",
  "Canadian Mist",
  "Pendleton",
];

const AMERICAN_WHISKEY: string[] = [
  "Pappy Van Winkle",
  "Buffalo Trace",
  "Eagle Rare",
  "Blanton's",
  "W.L. Weller",
  "E.H. Taylor",
  "George T. Stagg",
  "Van Winkle",
  "Woodford Reserve",
  "Woodford Reserve Double Oaked",
  "Maker's Mark",
  "Maker's Mark 46",
  "Wild Turkey",
  "Wild Turkey Rare Breed",
  "Russell's Reserve",
  "Four Roses",
  "Four Roses Small Batch",
  "Knob Creek",
  "Elijah Craig",
  "Heaven Hill",
  "Old Forester",
  "Jim Beam",
  "Booker's",
  "Basil Hayden",
  "Angel's Envy",
  "Michter's",
  "Bulleit",
  "Jefferson's",
  "High West",
];

const COGNAC_ARMAGNAC: string[] = [
  "Hennessy",
  "Hennessy XO",
  "Hennessy VS",
  "Hennessy VSOP",
  "Rémy Martin",
  "Rémy Martin XO",
  "Rémy Martin VSOP",
  "Rémy Martin Louis XIII",
  "Courvoisier",
  "Martell",
  "Martell Cordon Bleu",
  "Martell XO",
  "Pierre Ferrand",
  "Delamain",
  "Hardy",
  "Camus",
  "Davidoff",
  "Hine",
  "Frapin",
  "Gilles Louvet",
  "Dartigalongue",
  "Château de Laubade",
  "Tariquet",
  "Castaréde",
  "Delord",
];

const PREMIUM_SPIRITS_PRODUCERS: string[] = [
  // Calvados
  "Christian Drouin",
  "Dupont",
  "Domaine Lemorton",
  "Roger Groult",

  // Mezcal / Tequila (Vintages occasionally carries these)
  "Casa Noble",
  "Don Julio",
  "Clase Azul",
  "El Silencio",
  "Ilegal Mezcal",
  "Del Maguey",

  // Grappa
  "Nonino",
  "Poli",
  "Jacopo Poli",

  // Rum
  "Appleton Estate",
  "Mount Gay",
  "Diplomático",
  "Ron Zacapa",
  "El Dorado",
  "Plantation",
  "Rhum J.M.",

  // Generic brands that appear in Vintages
  "Balcones",
  "Westward",
  "Stranahan's",
  "Garrison Brothers",
];

function buildSuggestions(): SuggestionInput[] {
  const allProducers = [
    ...SCOTCH_DISTILLERIES,
    ...IRISH_WHISKEY,
    ...JAPANESE_WHISKY,
    ...CANADIAN_WHISKY,
    ...AMERICAN_WHISKEY,
    ...COGNAC_ARMAGNAC,
    ...PREMIUM_SPIRITS_PRODUCERS,
  ].map((name): SuggestionInput => ({
    display_name: name,
    producer: name,
    wine_name: null,
    type: "producer",
  }));

  const allExpressions = [
    ...SCOTCH_EXPRESSIONS,
  ].map((name): SuggestionInput => ({
    display_name: name,
    producer: null,
    wine_name: name,
    type: "wine",
  }));

  return [...allProducers, ...allExpressions];
}

export interface SpiritsSeedResult {
  inserted: number;
}

/**
 * Upsert curated Scotch/spirits producer and expression names into
 * wine_suggestions. Safe to run multiple times — conflicts just increment count.
 */
export async function seedSpiritsSuggestions(): Promise<SpiritsSeedResult> {
  const items = buildSuggestions();
  logger.info({ count: items.length }, "Seeding curated spirits suggestions");
  await upsertSuggestions(items, "curated");
  logger.info({ count: items.length }, "Curated spirits suggestions seeded");
  return { inserted: items.length };
}
