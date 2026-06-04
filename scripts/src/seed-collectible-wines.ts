/**
 * One-shot runner: seed collectible wines into wine_suggestions.
 * Usage: pnpm --filter @workspace/scripts run seed-collectible-wines
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

const WINE_NAMES: string[] = [
  // Barolo & Barbaresco
  "Giacomo Conterno Cascina Francia", "Giacomo Conterno Cerretta", "Giacomo Conterno Arione",
  "Giacomo Conterno Monfortino", "Monfortino Riserva", "Francia",
  "Bruno Giacosa Asili", "Bruno Giacosa Rabajà", "Bruno Giacosa Falletto Riserva",
  "Bruno Giacosa Rocche del Falletto", "Falletto Riserva", "Rocche del Falletto",
  "Luciano Sandrone Aleste", "Luciano Sandrone Vite Talin",
  "Luciano Sandrone Cannubi Boschis", "Luciano Sandrone Le Vigne",
  "Cannubi Boschis", "Le Vigne",
  "Roberto Voerzio Brunate", "Roberto Voerzio Cerequio", "Roberto Voerzio La Serra",
  "Vietti Rocche di Castiglione", "Vietti Lazzarito", "Vietti Ravera", "Vietti Villero",
  "G.D. Vajra Bricco delle Viole", "G.D. Vajra Coste di Rose",
  "Paolo Scavino Bric dël Fiasc", "Paolo Scavino Cannubi", "Paolo Scavino Rocche dell'Annunziata",
  "Elio Altare Arborina", "Elio Altare Cerretta",
  "Massolino Vigna Rionda", "Massolino Parussi",
  "Cappellano Pie Rupestris", "Cappellano Otin Fiorin",
  "Oddero Brunate", "Oddero Vigna Rionda",
  "Poderi Aldo Conterno Granbussia", "Poderi Aldo Conterno Romirasco",
  "Poderi Aldo Conterno Cicala", "Poderi Aldo Conterno Colonnello",
  "Roagna Crichet Pajé", "Roagna Pajé", "Roagna Asili", "Roagna Montefico",
  "Gaja Barbaresco", "Gaja Costa Russi", "Gaja Sorì Tildìn", "Gaja Sorì San Lorenzo",
  "Bartolo Mascarello Barolo", "Giuseppe Rinaldi Barolo",
  "Cerequio", "Brunate", "Sorì San Lorenzo", "Sorì Tildìn", "Costa Russi", "Asili", "Rabajà",
  // Brunello
  "Soldera Case Basse", "Soldera Brunello", "Case Basse",
  "Poggio di Sotto Riserva", "Poggio di Sotto Brunello",
  "Valdicava Brunello", "Valdicava Madonna del Piano",
  "Il Marroneto Madonna delle Grazie", "Il Marroneto Brunello", "Madonna delle Grazie",
  "Salvioni Brunello", "Fuligni Brunello", "Fuligni Riserva",
  "Canalicchio di Sopra Riserva", "Le Ragnaie Passo del Lume Spento",
  "Le Potazzine Brunello", "Cerbaiona Brunello", "Stella di Campalto Brunello",
  "Cupano Brunello", "Biondi-Santi Brunello Riserva", "Biondi-Santi Brunello",
  "Casanova di Neri Cerretalto", "Casanova di Neri Tenuta Nuova", "Argiano Vigna del Suolo",
  // Super Tuscans
  "Montevertine Le Pergole Torte", "Pergole Torte",
  "Fontodi Flaccianello", "Flaccianello della Pieve",
  "Castello dei Rampolla Vigna d'Alceo", "Castello dei Rampolla Sammarco",
  "Isole e Olena Cepparello", "Querciabella Camartina",
  "Tua Rita Giusto di Notri", "Tua Rita Redigaffi",
  "Le Macchiole Paleo", "Le Macchiole Messorio", "Le Macchiole Scrio",
  "Biserno", "Lodovico", "Tenuta San Guido Guidalberto", "Tenuta San Guido Sassicaia",
  "Ornellaia Massetino", "Galatrona", "Percarlo",
  "Paleo Rosso", "Messorio", "Scrio", "Redigaffi",
  // Rest of Italy
  "Valentini Trebbiano d'Abruzzo", "Valentini Montepulciano d'Abruzzo",
  "Emidio Pepe Montepulciano", "Emidio Pepe Trebbiano",
  "Quintarelli Amarone", "Quintarelli Alzero", "Quintarelli Rosso del Bepi",
  "Giuseppe Quintarelli Amarone Riserva",
  "Dal Forno Amarone", "Dal Forno Monte Lodoletta",
  "Rosso del Bepi", "Alzero", "Monte Lodoletta",
  "Montevetrano", "Terra di Lavoro", "Kurni",
  // Bordeaux
  "Château Lafite Rothschild", "Château Latour", "Château Margaux",
  "Château Mouton Rothschild", "Château Haut-Brion", "Château Palmer",
  "Château Ausone", "Château Cheval Blanc", "Château Angélus", "Château Pavie",
  "Château Léoville Las Cases", "Château Cos d'Estournel", "Château Pontet-Canet",
  "Château Lynch-Bages", "Château Pichon Baron", "Château Pichon Lalande",
  "Château Ducru-Beaucaillou", "Château Montrose", "Château Canon", "Château Figeac",
  "Pétrus", "Le Pin", "L'Église Clinet", "Vieux Château Certan", "La Mission Haut-Brion",
  // Burgundy — specific wines
  "Musigny", "Bonnes-Mares", "Chambertin", "Chambertin Clos de Bèze",
  "Clos Saint-Jacques", "Clos de Tart", "Clos des Lambrays", "Clos de la Roche",
  "Clos de Vougeot", "Echézeaux", "Grands Echézeaux", "Corton-Charlemagne",
  "Bienvenues-Bâtard-Montrachet", "Bâtard-Montrachet", "Chevalier-Montrachet",
  "Le Montrachet", "Criots-Bâtard-Montrachet",
  "Mazis-Chambertin", "Latricières-Chambertin", "Ruchottes-Chambertin",
  "Clos Saint-Denis", "Clos de la Roche VV",
  "Les Amoureuses", "Les Suchots", "Les Malconsorts", "Les Saint-Georges",
  "Les Perrières", "Les Genevrières", "Les Charmes", "Les Caillerets",
  "Henri Jayer Cros Parantoux", "Henri Jayer Echézeaux",
  "Roumier Bonnes-Mares", "Roumier Musigny", "Mugnier Musigny", "Vogüé Musigny",
  "Rousseau Chambertin", "Rousseau Clos Saint-Jacques",
  "Leroy Musigny", "Leroy Richebourg",
  "Coche-Dury Meursault Perrières", "Roulot Meursault Perrières", "Ramonet Montrachet",
  "Romanée-Conti", "La Tâche", "Richebourg", "Romanée-Saint-Vivant", "Montrachet DRC",
  // Champagne
  "Krug Grande Cuvée", "Krug Clos du Mesnil", "Krug Clos d'Ambonnay",
  "Dom Pérignon", "Cristal", "Salon", "Salon Le Mesnil", "Salon Blanc de Blancs",
  "Jacques Selosse", "Jacques Selosse Substance", "Jacques Selosse Initial", "Selosse Rosé",
  "Egly-Ouriet", "Egly-Ouriet VP", "Egly-Ouriet Millésime",
  "Bollinger R.D.", "Bollinger Vieilles Vignes Françaises",
  "Sir Winston Churchill", "Philipponnat Clos des Goisses",
  "Dom Ruinart", "Ruinart Dom Ruinart Blanc de Blancs",
  "Pol Roger Vintage", "Charles Heidsieck Blanc des Millénaires",
  "Taittinger Comtes de Champagne",
  "Billecart-Salmon Clos Saint-Hilaire", "Billecart-Salmon Nicolas François",
  "Jacquesson Avize Champ Caïn", "Pierre Peters Les Chétillons", "Pierre Peters Cuvée Spéciale",
  "Agrapart Minéral", "Agrapart Vénus", "Agrapart Terroirs", "Agrapart Experience",
  "Ulysse Collin Les Pierrières", "Ulysse Collin Les Maillons",
  "Ulysse Collin Les Enfers", "Ulysse Collin Les Roises",
  "Cedric Bouchard Roses de Jeanne", "Cedric Bouchard Presle", "Cedric Bouchard Val Vilaine",
  "Larmandier-Bernier Vieille Vigne du Levant", "Larmandier-Bernier Terre de Vertus",
  "Henriot Enchanteleurs", "Piper-Heidsieck Rare",
  "Bérêche Reflet d'Antan", "Comtes de Champagne",
  // Rhône
  "Chave Hermitage", "Chave Blanc", "Chave Cathelin",
  "Guigal La Landonne", "Guigal La Mouline", "Guigal La Turque", "Guigal Ex Voto",
  "Jamet Côte-Rôtie", "Jamet Côte Brune",
  "Gangloff La Barbarine", "Gangloff Sereine Noire", "Rostaing Côte Blonde",
  "Jean-Louis Chave Selection",
  "Allemand Reynard", "Allemand Chaillot", "Allemand Sans Soufre",
  "Clos des Papes", "Clos des Papes Blanc",
  "Beaucastel Hommage à Jacques Perrin", "Beaucastel Châteauneuf-du-Pape",
  "Pegau Cuvée Réservée", "Pegau Capo",
  "Rayas", "Rayas Réservé",
  "Henri Bonneau Réserve des Célestins", "Henri Bonneau Marie Beurrier",
  "Vieux Télégraphe La Crau", "Domaine du Vieux Donjon", "Le Vieux Clos",
  // Loire
  "Clos Rougeard Le Bourg", "Clos Rougeard Les Poyeux",
  "Clos Rougeard Bourgueil", "Clos Rougeard Brézé",
  "Nicolas Joly Coulée de Serrant", "Nicolas Joly Clos de la Bergerie",
  "Didier Dagueneau Silex", "Didier Dagueneau Pur Sang",
  "Didier Dagueneau Astéroïde", "Didier Dagueneau Buisson Renard",
  "Huet Le Haut-Lieu", "Huet Clos du Bourg", "Huet Le Mont",
  // Alsace
  "Zind-Humbrecht Clos Windsbuhl", "Trimbach Clos Sainte Hune",
  "Marcel Deiss Schoenenbourg", "Domaine Weinbach Schlossberg",
  // Germany
  "Egon Müller Scharzhofberger", "Joh. Jos. Prüm Wehlener Sonnenuhr",
  "JJ Prüm Graacher Himmelreich",
  "Keller G-Max", "Keller Abtserde", "Keller Morstein", "Keller Hubacker", "Keller Kirchspiel",
  "Dönnhoff Hermannshöhle", "Dönnhoff Dellchen",
  "Emrich-Schönleber Halenberg", "Wittmann Morstein", "Wittmann Kirchspiel",
  "Robert Weil Kiedrich Gräfenberg",
  "Egon Müller Auslese", "Egon Müller Beerenauslese", "Schloss Johannisberg Goldlack",
  // Spain
  "Pingus", "Flor de Pingus", "Vega Sicilia Único", "Vega Sicilia Valbuena 5°",
  "Alión", "Aalto PS", "Teso La Monja", "La Faraona", "Moncerbal", "Las Lamas",
  "El Pecado", "Mauro Terreus", "Artadi El Pisón", "Contador", "Amancio", "Cirsion",
  "Clos Erasmus", "L'Ermita", "Finca Dofí", "Mas La Plana", "Mas Doix 1902",
  // Portugal
  "Niepoort Batuta", "Niepoort Charme", "Quinta do Noval Nacional",
  "Barca Velha", "Pêra-Manca", "Chryseia", "Meandro do Vale Meão", "Vale Meão",
  // Australia & NZ
  "Penfolds Grange", "Penfolds Bin 707", "Penfolds RWT", "Penfolds St Henri",
  "Henschke Hill of Grace", "Henschke Mount Edelstone",
  "Torbreck RunRig", "Torbreck The Laird", "Torbreck Descendant",
  "Clarendon Hills Astralis", "Chris Ringland Shiraz", "Glaetzer Amon-Ra",
  "Mollydooker Velvet Glove", "Wendouree Shiraz",
  "Leeuwin Estate Art Series Chardonnay", "Cloudy Bay Te Koko",
  "Felton Road Block 3", "Felton Road Block 5", "Felton Road Cornish Point",
  "Dry River Pinot Noir", "Ata Rangi Pinot Noir", "Craggy Range Le Sol",
  "Kumeu River Mate's Vineyard",
  // South America
  "Almaviva", "Seña", "Clos Apalta", "Viñedo Chadwick", "Don Melchor",
  "Montes Alpha M", "Purple Angel", "Casa Real Cabernet Sauvignon",
  "Errazuriz Kai", "Errazuriz Don Maximiano",
  "Catena Zapata Adrianna River Stones", "Catena Zapata Adrianna White Bones",
  "Nicolás Catena Zapata", "Cheval des Andes",
  "Achaval-Ferrer Finca Altamira", "Achaval-Ferrer Finca Bella Vista",
  "Achaval-Ferrer Finca Mirador", "Cobos Malbec", "Bodega Noemía",
  "Zuccardi Finca Piedra Infinita",
  // California
  "Screaming Eagle", "Harlan Estate",
  "Bond Melbury", "Bond Vecina", "Bond Quella", "Bond St. Eden", "Promontory",
  "Opus One", "Dominus", "Napanook", "Scarecrow",
  "Hundred Acre", "Hundred Acre Ark Vineyard", "Hundred Acre Kayli Morgan", "Hundred Acre Wraith",
  "Colgin IX Estate", "Colgin Cariad", "Colgin Tychson Hill",
  "Bryant Family Vineyard", "Sloan Estate",
  "Realm Beckstoffer To Kalon", "Realm The Absurd", "Realm Fidelio",
  "Schrader Old Sparky", "Schrader Beckstoffer To Kalon", "Schrader CCS",
  "Maybach Materium", "Maybach Amoenus",
  "Kapcsándy Grand Vin", "Kapcsándy Roberta's Reserve",
  "Dalla Valle Maya", "Dalla Valle Cabernet Sauvignon",
  "Grace Family Cabernet Sauvignon", "Eisele Vineyard Cabernet Sauvignon",
  "Joseph Phelps Insignia", "Shafer Hillside Select", "Shafer Relentless",
  "Spottswoode Estate Cabernet Sauvignon",
  "Corison Kronos Vineyard", "Corison Sunbasket Vineyard", "Heitz Martha's Vineyard",
  "Diamond Creek Volcanic Hill", "Diamond Creek Red Rock Terrace", "Diamond Creek Gravelly Meadow",
  "Chateau Montelena Estate Cabernet",
  "Dunn Howell Mountain Cabernet", "Dunn Napa Valley Cabernet",
  "Ridge Monte Bello", "Ridge Lytton Springs", "Ridge Geyserville",
  "Peter Michael Les Pavots", "Peter Michael Au Paradis",
  "Peter Michael Belle Côte", "Peter Michael Ma Belle-Fille",
  "Kistler Vineyard Chardonnay", "Kistler Laguna Ridge Pinot Noir",
  "Aubert Lauren Vineyard Chardonnay", "Aubert UV-SL Chardonnay", "Aubert CIX Estate Chardonnay",
  "Marcassin Chardonnay", "Marcassin Pinot Noir",
  "Williams Selyem Rochioli Riverblock", "Williams Selyem Westside Road Neighbors",
  "Williams Selyem Precious Mountain",
  "Kosta Browne Gap's Crown", "Kosta Browne Keefer Ranch",
  "Sea Smoke Ten Pinot Noir", "Sea Smoke Southing Pinot Noir", "Sea Smoke Botella Pinot Noir",
  "Sine Qua Non Syrah", "Sine Qua Non Grenache",
  "Saxum James Berry Vineyard", "Saxum Booker Vineyard",
  "Booker Fracture", "Booker Oublié", "Andremily Syrah", "Linne Calodo Nemesis",
  "L'Aventure Estate Cuvée", "Turtle Rock G2 Syrah",
  "Bevan Cellars Ontogeny", "Bevan Cellars Tench Vineyard",
  "TOR Beckstoffer To Kalon", "TOR Cabernet Sauvignon",
  "Myriad Beckstoffer Dr. Crane", "Myriad Elysian",
  "Pulido-Walker Panek Vineyard", "Pulido-Walker Mt. Veeder",
  "Checkerboard Kings Row", "Checkerboard Aurora Vineyard", "Futo Estate",
  "Blankiet Paradise Hills", "Blankiet Prince of Hearts",
  "Vine Hill Ranch Cabernet Sauvignon",
  "Vérité La Muse", "Vérité La Joie", "Vérité Le Désir",
  "Pahlmeyer Proprietary Red", "Lewis Cellars Reserve Cabernet",
  "Paul Hobbs Beckstoffer Dr. Crane", "Paul Hobbs To Kalon Cabernet",
  "Inglenook Rubicon", "Staglin Family Vineyard Cabernet",
  // Scotch collectible expressions
  "Macallan 12 Sherry Oak", "Macallan 18 Sherry Oak", "Macallan 25 Sherry Oak",
  "Macallan Rare Cask", "Macallan M", "Macallan Reflexion",
  "Springbank 10", "Springbank 15", "Springbank 18", "Springbank 21",
  "Longrow Red", "Hazelburn 21",
  "Lagavulin 16", "Lagavulin 12 Special Release",
  "Ardbeg Uigeadail", "Ardbeg Corryvreckan", "Ardbeg Traigh Bhan",
  "Laphroaig 25", "Laphroaig Cairdeas",
  "Bowmore 18", "Bowmore 25", "Talisker 18", "Talisker 25",
  "Highland Park 18", "Highland Park 25", "Highland Park 30",
  "GlenDronach 18", "GlenDronach 21", "GlenAllachie 15", "GlenAllachie 18",
  "Glenfarclas 25", "Glenfarclas 30", "Glenfarclas 40",
  "Glenmorangie Signet", "Balvenie Tun 1509", "Balvenie 21 PortWood", "Balvenie 30",
  "Benromach 21", "Bunnahabhain 25", "Bruichladdich Black Art", "Octomore",
  "Port Charlotte PAC", "Mortlach 20", "Glen Scotia 25", "Deanston 18",
  "Daftmill 15", "Kilkerran 16", "Kilkerran Heavily Peated",
  "Ben Nevis 10", "Clynelish 14", "Clynelish Special Releases",
  "Glen Grant 18", "Glendullan Rare", "Tobermory 21", "Arran 18", "Loch Lomond 21",
  "Compass Box Hedonism", "Compass Box Flaming Heart",
  "Johnnie Walker Blue Label", "Royal Salute 38 Stone of Destiny",
];

const PRODUCER_NAMES: string[] = [
  // Burgundy
  "Armand Rousseau", "Leroy", "Coche-Dury", "Domaine Leflaive",
  "Faiveley", "Louis Jadot", "Joseph Drouhin", "Pierre-Yves Colin-Morey",
  "Ramonet", "Roulot", "Sauzet", "Comte Georges de Vogüé", "Jacques-Frédéric Mugnier",
  // Champagne
  "Jacques Selosse", "Egly-Ouriet", "Philipponnat", "Billecart-Salmon", "Taittinger",
  // Rhône
  "Jean-Louis Chave", "Henri Bonneau", "Guigal",
  // Barolo/Barbaresco
  "Giacomo Conterno", "Bruno Giacosa", "Luciano Sandrone", "Roberto Voerzio",
  "G.D. Vajra", "Paolo Scavino", "Elio Altare", "Massolino", "Cappellano",
  "Oddero", "Poderi Aldo Conterno", "Roagna", "Bartolo Mascarello", "Giuseppe Rinaldi", "Gaja",
  // Brunello
  "Soldera", "Poggio di Sotto", "Il Marroneto", "Salvioni", "Fuligni",
  "Canalicchio di Sopra", "Le Ragnaie", "Le Potazzine", "Cerbaiona",
  "Stella di Campalto", "Cupano", "Casanova di Neri", "Argiano",
  // Super Tuscan / Tuscan
  "Montevertine", "Fontodi", "Castello dei Rampolla", "Isole e Olena",
  "Querciabella", "Tua Rita", "Le Macchiole",
  // Italian
  "Valentini", "Emidio Pepe",
  // California
  "Screaming Eagle", "Harlan Estate", "Opus One", "Dominus",
  "Colgin", "Shafer Vineyards", "Ridge Vineyards", "Peter Michael",
  "Kistler", "Williams Selyem", "Kosta Browne", "Sea Smoke", "Sine Qua Non", "Saxum",
  // South America
  "Catena Zapata", "Achaval-Ferrer", "Zuccardi",
  // Australia
  "Penfolds", "Henschke", "Torbreck", "Clarendon Hills",
];

async function main() {
  const wines: SuggestionInput[] = WINE_NAMES.map((n) => ({
    display_name: n, wine_name: n, producer: null, type: "wine",
  }));
  const producers: SuggestionInput[] = PRODUCER_NAMES.map((n) => ({
    display_name: n, wine_name: null, producer: n, type: "producer",
  }));

  const all = [...wines, ...producers];
  console.log(`Seeding ${all.length} collectible wine/producer suggestions…`);
  const inserted = await upsert(all, "curated");
  console.log(`Done. ${inserted} unique entries upserted.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
