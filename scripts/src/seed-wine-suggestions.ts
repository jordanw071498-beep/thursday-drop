import { db, winesTable, watchlistItemsTable, wineSuggestionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const BATCH_SIZE = 100;

async function upsert(rows: Array<{
  display_name: string;
  producer: string | null;
  wine_name: string | null;
  type: string;
  source: string;
}>) {
  if (rows.length === 0) return 0;
  // Deduplicate by (display_name, type) before batching — PostgreSQL rejects
  // ON CONFLICT DO UPDATE when the same row is targeted twice in one statement.
  const seen = new Map<string, typeof values[number]>();
  for (const row of rows) {
    const key = `${row.display_name.trim().toLowerCase()}::${row.type}`;
    if (!seen.has(key)) {
      seen.set(key, {
        display_name: row.display_name.trim(),
        normalized_name: normalize(row.display_name),
        producer: row.producer ?? null,
        wine_name: row.wine_name ?? null,
        type: row.type,
        source: row.source,
        count: 1,
      });
    }
  }
  const values = [...seen.values()];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    await db
      .insert(wineSuggestionsTable)
      .values(batch)
      .onConflictDoUpdate({
        target: [wineSuggestionsTable.display_name, wineSuggestionsTable.type],
        set: { count: sql`${wineSuggestionsTable.count} + 1` },
      });
  }
  return values.length;
}

// ─── 1. Seed from scraped wines ───────────────────────────────────────────────
async function seedFromWines() {
  const wines = await db.select({
    wine_name: winesTable.wine_name,
    producer: winesTable.producer,
  }).from(winesTable);

  const wineRows: Parameters<typeof upsert>[0] = [];
  const producerSet = new Set<string>();

  for (const w of wines) {
    if (w.wine_name) {
      wineRows.push({
        display_name: w.wine_name,
        producer: w.producer ?? null,
        wine_name: w.wine_name,
        type: "wine",
        source: "scraped",
      });
    }
    if (w.producer && !producerSet.has(w.producer)) {
      producerSet.add(w.producer);
      wineRows.push({
        display_name: w.producer,
        producer: w.producer,
        wine_name: null,
        type: "producer",
        source: "scraped",
      });
    }
  }

  const n = await upsert(wineRows);
  console.log(`[scraped wines] inserted/updated ${n} rows`);
}

// ─── 2. Seed from user watchlist entries ─────────────────────────────────────
async function seedFromWatchlist() {
  const items = await db.select({
    wine_name: watchlistItemsTable.wine_name,
    producer: watchlistItemsTable.producer,
    match_type: watchlistItemsTable.match_type,
  }).from(watchlistItemsTable);

  const rows: Parameters<typeof upsert>[0] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const name = item.wine_name?.trim();
    if (!name) continue;

    const isProducer = item.match_type === "producer";
    const key = `${isProducer ? "producer" : "wine"}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      display_name: name,
      producer: isProducer ? name : (item.producer ?? null),
      wine_name: isProducer ? null : name,
      type: isProducer ? "producer" : "wine",
      source: "watchlist",
    });
  }

  const n = await upsert(rows);
  console.log(`[watchlist] inserted/updated ${n} rows`);
}

// ─── 3. Curated list ──────────────────────────────────────────────────────────
const CURATED: Array<{ display_name: string; producer: string | null; wine_name: string | null; type: string }> = [
  // Bordeaux producers
  { display_name: "Château Pétrus", producer: "Château Pétrus", wine_name: null, type: "producer" },
  { display_name: "Château Mouton Rothschild", producer: "Château Mouton Rothschild", wine_name: null, type: "producer" },
  { display_name: "Château Lafite Rothschild", producer: "Château Lafite Rothschild", wine_name: null, type: "producer" },
  { display_name: "Château Haut-Brion", producer: "Château Haut-Brion", wine_name: null, type: "producer" },
  { display_name: "Château Margaux", producer: "Château Margaux", wine_name: null, type: "producer" },
  { display_name: "Château Latour", producer: "Château Latour", wine_name: null, type: "producer" },
  { display_name: "Château Ausone", producer: "Château Ausone", wine_name: null, type: "producer" },
  { display_name: "Château Cheval Blanc", producer: "Château Cheval Blanc", wine_name: null, type: "producer" },
  { display_name: "Château Haut-Bailly", producer: "Château Haut-Bailly", wine_name: null, type: "producer" },
  { display_name: "Château Palmer", producer: "Château Palmer", wine_name: null, type: "producer" },
  { display_name: "Château Lynch-Bages", producer: "Château Lynch-Bages", wine_name: null, type: "producer" },
  { display_name: "Château Léoville-Las Cases", producer: "Château Léoville-Las Cases", wine_name: null, type: "producer" },
  { display_name: "Château Pichon Baron", producer: "Château Pichon Baron", wine_name: null, type: "producer" },
  { display_name: "Château Pichon Longueville Comtesse de Lalande", producer: "Château Pichon Longueville Comtesse de Lalande", wine_name: null, type: "producer" },
  { display_name: "Château Ducru-Beaucaillou", producer: "Château Ducru-Beaucaillou", wine_name: null, type: "producer" },
  { display_name: "Château Cos d'Estournel", producer: "Château Cos d'Estournel", wine_name: null, type: "producer" },
  { display_name: "Château Montrose", producer: "Château Montrose", wine_name: null, type: "producer" },
  { display_name: "Château Léoville-Barton", producer: "Château Léoville-Barton", wine_name: null, type: "producer" },
  { display_name: "Château Pontet-Canet", producer: "Château Pontet-Canet", wine_name: null, type: "producer" },
  { display_name: "Château Grand-Puy-Lacoste", producer: "Château Grand-Puy-Lacoste", wine_name: null, type: "producer" },
  { display_name: "Château Calon-Ségur", producer: "Château Calon-Ségur", wine_name: null, type: "producer" },
  { display_name: "Château La Mission Haut-Brion", producer: "Château La Mission Haut-Brion", wine_name: null, type: "producer" },
  { display_name: "Château Pape Clément", producer: "Château Pape Clément", wine_name: null, type: "producer" },
  { display_name: "Château Smith Haut Lafitte", producer: "Château Smith Haut Lafitte", wine_name: null, type: "producer" },
  { display_name: "Château Figeac", producer: "Château Figeac", wine_name: null, type: "producer" },
  { display_name: "Château Canon", producer: "Château Canon", wine_name: null, type: "producer" },
  { display_name: "Château Pavie", producer: "Château Pavie", wine_name: null, type: "producer" },
  { display_name: "Vieux Château Certan", producer: "Vieux Château Certan", wine_name: null, type: "producer" },
  { display_name: "Le Pin", producer: "Le Pin", wine_name: null, type: "producer" },
  { display_name: "Château La Fleur-Pétrus", producer: "Château La Fleur-Pétrus", wine_name: null, type: "producer" },
  { display_name: "Château Clinet", producer: "Château Clinet", wine_name: null, type: "producer" },
  { display_name: "Château L'Evangile", producer: "Château L'Evangile", wine_name: null, type: "producer" },
  { display_name: "Château d'Yquem", producer: "Château d'Yquem", wine_name: null, type: "producer" },
  { display_name: "Domaine de Chevalier", producer: "Domaine de Chevalier", wine_name: null, type: "producer" },
  { display_name: "Alter Ego de Palmer", producer: "Alter Ego de Palmer", wine_name: "Alter Ego de Palmer", type: "wine" },
  { display_name: "Château Brane-Cantenac", producer: "Château Brane-Cantenac", wine_name: null, type: "producer" },
  { display_name: "Château Rauzan-Ségla", producer: "Château Rauzan-Ségla", wine_name: null, type: "producer" },
  { display_name: "Château Gruaud Larose", producer: "Château Gruaud Larose", wine_name: null, type: "producer" },
  { display_name: "Château Léoville Poyferré", producer: "Château Léoville Poyferré", wine_name: null, type: "producer" },
  // Burgundy producers
  { display_name: "Domaine de la Romanée-Conti", producer: "Domaine de la Romanée-Conti", wine_name: null, type: "producer" },
  { display_name: "Domaine Armand Rousseau", producer: "Domaine Armand Rousseau", wine_name: null, type: "producer" },
  { display_name: "Domaine Leflaive", producer: "Domaine Leflaive", wine_name: null, type: "producer" },
  { display_name: "Domaine Ramonet", producer: "Domaine Ramonet", wine_name: null, type: "producer" },
  { display_name: "Domaine Dujac", producer: "Domaine Dujac", wine_name: null, type: "producer" },
  { display_name: "Domaine Leroy", producer: "Domaine Leroy", wine_name: null, type: "producer" },
  { display_name: "Maison Louis Jadot", producer: "Maison Louis Jadot", wine_name: null, type: "producer" },
  { display_name: "Domaine Louis Latour", producer: "Domaine Louis Latour", wine_name: null, type: "producer" },
  { display_name: "Maison Joseph Drouhin", producer: "Maison Joseph Drouhin", wine_name: null, type: "producer" },
  { display_name: "Domaine Faiveley", producer: "Domaine Faiveley", wine_name: null, type: "producer" },
  { display_name: "Domaine Ponsot", producer: "Domaine Ponsot", wine_name: null, type: "producer" },
  { display_name: "Domaine Méo-Camuzet", producer: "Domaine Méo-Camuzet", wine_name: null, type: "producer" },
  { display_name: "Domaine Comte Liger-Belair", producer: "Domaine Comte Liger-Belair", wine_name: null, type: "producer" },
  { display_name: "Domaine Marquis d'Angerville", producer: "Domaine Marquis d'Angerville", wine_name: null, type: "producer" },
  { display_name: "Domaine des Comtes Lafon", producer: "Domaine des Comtes Lafon", wine_name: null, type: "producer" },
  { display_name: "Domaine Etienne Sauzet", producer: "Domaine Etienne Sauzet", wine_name: null, type: "producer" },
  { display_name: "Domaine Fourrier", producer: "Domaine Fourrier", wine_name: null, type: "producer" },
  { display_name: "Domaine Hubert Lignier", producer: "Domaine Hubert Lignier", wine_name: null, type: "producer" },
  { display_name: "Anne Gros", producer: "Anne Gros", wine_name: null, type: "producer" },
  { display_name: "Domaine Henri Rebourseau", producer: "Domaine Henri Rebourseau", wine_name: null, type: "producer" },
  { display_name: "J-F Mugnier", producer: "J-F Mugnier", wine_name: null, type: "producer" },
  { display_name: "Albert Bichot", producer: "Albert Bichot", wine_name: null, type: "producer" },
  { display_name: "Domaine Bachelet", producer: "Domaine Bachelet", wine_name: null, type: "producer" },
  { display_name: "Simon Bize et Fils", producer: "Simon Bize et Fils", wine_name: null, type: "producer" },
  // Burgundy specific wines
  { display_name: "Romanée-Conti", producer: "Domaine de la Romanée-Conti", wine_name: "Romanée-Conti", type: "wine" },
  { display_name: "La Tâche", producer: "Domaine de la Romanée-Conti", wine_name: "La Tâche", type: "wine" },
  { display_name: "Richebourg", producer: null, wine_name: "Richebourg", type: "wine" },
  { display_name: "Chambertin", producer: null, wine_name: "Chambertin", type: "wine" },
  { display_name: "Musigny", producer: null, wine_name: "Musigny", type: "wine" },
  { display_name: "Clos de Vougeot", producer: null, wine_name: "Clos de Vougeot", type: "wine" },
  { display_name: "Montrachet", producer: null, wine_name: "Montrachet", type: "wine" },
  { display_name: "Bâtard-Montrachet", producer: null, wine_name: "Bâtard-Montrachet", type: "wine" },
  { display_name: "Chevalier-Montrachet", producer: null, wine_name: "Chevalier-Montrachet", type: "wine" },
  { display_name: "Gevrey-Chambertin", producer: null, wine_name: "Gevrey-Chambertin", type: "wine" },
  { display_name: "Vosne-Romanée", producer: null, wine_name: "Vosne-Romanée", type: "wine" },
  { display_name: "Chambolle-Musigny", producer: null, wine_name: "Chambolle-Musigny", type: "wine" },
  { display_name: "Pommard", producer: null, wine_name: "Pommard", type: "wine" },
  { display_name: "Volnay", producer: null, wine_name: "Volnay", type: "wine" },
  { display_name: "Puligny-Montrachet", producer: null, wine_name: "Puligny-Montrachet", type: "wine" },
  { display_name: "Meursault", producer: null, wine_name: "Meursault", type: "wine" },
  { display_name: "Corton-Charlemagne", producer: null, wine_name: "Corton-Charlemagne", type: "wine" },
  { display_name: "Clos Saint-Denis", producer: null, wine_name: "Clos Saint-Denis", type: "wine" },
  { display_name: "Grands Échézeaux", producer: null, wine_name: "Grands Échézeaux", type: "wine" },
  { display_name: "Échézeaux", producer: null, wine_name: "Échézeaux", type: "wine" },
  // Italy producers
  { display_name: "Antinori", producer: "Antinori", wine_name: null, type: "producer" },
  { display_name: "Marchesi Antinori", producer: "Marchesi Antinori", wine_name: null, type: "producer" },
  { display_name: "Tenuta San Guido", producer: "Tenuta San Guido", wine_name: null, type: "producer" },
  { display_name: "Angelo Gaja", producer: "Angelo Gaja", wine_name: null, type: "producer" },
  { display_name: "Giacomo Conterno", producer: "Giacomo Conterno", wine_name: null, type: "producer" },
  { display_name: "Bruno Giacosa", producer: "Bruno Giacosa", wine_name: null, type: "producer" },
  { display_name: "Vietti", producer: "Vietti", wine_name: null, type: "producer" },
  { display_name: "Paolo Scavino", producer: "Paolo Scavino", wine_name: null, type: "producer" },
  { display_name: "Biondi-Santi", producer: "Biondi-Santi", wine_name: null, type: "producer" },
  { display_name: "Soldera Case Basse", producer: "Soldera Case Basse", wine_name: null, type: "producer" },
  { display_name: "Dal Forno Romano", producer: "Dal Forno Romano", wine_name: null, type: "producer" },
  { display_name: "Quintarelli", producer: "Quintarelli", wine_name: null, type: "producer" },
  { display_name: "Masi", producer: "Masi", wine_name: null, type: "producer" },
  { display_name: "Zenato", producer: "Zenato", wine_name: null, type: "producer" },
  { display_name: "Ornellaia", producer: "Ornellaia", wine_name: null, type: "producer" },
  { display_name: "Masseto", producer: "Masseto", wine_name: null, type: "producer" },
  { display_name: "Allegrini", producer: "Allegrini", wine_name: null, type: "producer" },
  { display_name: "Bertani", producer: "Bertani", wine_name: null, type: "producer" },
  // Italy specific wines
  { display_name: "Sassicaia", producer: "Tenuta San Guido", wine_name: "Sassicaia", type: "wine" },
  { display_name: "Tignanello", producer: "Antinori", wine_name: "Tignanello", type: "wine" },
  { display_name: "Solaia", producer: "Antinori", wine_name: "Solaia", type: "wine" },
  { display_name: "Masseto", producer: "Masseto", wine_name: "Masseto", type: "wine" },
  { display_name: "Ornellaia", producer: "Ornellaia", wine_name: "Ornellaia", type: "wine" },
  { display_name: "Barolo Monfortino", producer: "Giacomo Conterno", wine_name: "Barolo Monfortino", type: "wine" },
  { display_name: "Barolo Cascina Francia", producer: "Giacomo Conterno", wine_name: "Barolo Cascina Francia", type: "wine" },
  { display_name: "Brunello di Montalcino", producer: null, wine_name: "Brunello di Montalcino", type: "wine" },
  { display_name: "Amarone della Valpolicella", producer: null, wine_name: "Amarone della Valpolicella", type: "wine" },
  { display_name: "Barolo", producer: null, wine_name: "Barolo", type: "wine" },
  { display_name: "Barbaresco", producer: null, wine_name: "Barbaresco", type: "wine" },
  // Champagne producers
  { display_name: "Krug", producer: "Krug", wine_name: null, type: "producer" },
  { display_name: "Pol Roger", producer: "Pol Roger", wine_name: null, type: "producer" },
  { display_name: "Louis Roederer", producer: "Louis Roederer", wine_name: null, type: "producer" },
  { display_name: "Billecart-Salmon", producer: "Billecart-Salmon", wine_name: null, type: "producer" },
  { display_name: "Gosset", producer: "Gosset", wine_name: null, type: "producer" },
  { display_name: "Henriot", producer: "Henriot", wine_name: null, type: "producer" },
  { display_name: "Veuve Clicquot", producer: "Veuve Clicquot", wine_name: null, type: "producer" },
  { display_name: "Moët & Chandon", producer: "Moët & Chandon", wine_name: null, type: "producer" },
  { display_name: "Laurent-Perrier", producer: "Laurent-Perrier", wine_name: null, type: "producer" },
  { display_name: "Taittinger", producer: "Taittinger", wine_name: null, type: "producer" },
  { display_name: "Bollinger", producer: "Bollinger", wine_name: null, type: "producer" },
  { display_name: "Deutz", producer: "Deutz", wine_name: null, type: "producer" },
  { display_name: "Salon", producer: "Salon", wine_name: null, type: "producer" },
  { display_name: "Delamotte", producer: "Delamotte", wine_name: null, type: "producer" },
  { display_name: "Ruinart", producer: "Ruinart", wine_name: null, type: "producer" },
  { display_name: "Perrier-Jouët", producer: "Perrier-Jouët", wine_name: null, type: "producer" },
  // Champagne specific wines
  { display_name: "Dom Pérignon", producer: "Moët & Chandon", wine_name: "Dom Pérignon", type: "wine" },
  { display_name: "Cristal", producer: "Louis Roederer", wine_name: "Cristal", type: "wine" },
  { display_name: "Clos Saint-Hilaire", producer: "Billecart-Salmon", wine_name: "Clos Saint-Hilaire", type: "wine" },
  { display_name: "Krug Grande Cuvée", producer: "Krug", wine_name: "Grande Cuvée", type: "wine" },
  { display_name: "Comtes de Champagne", producer: "Taittinger", wine_name: "Comtes de Champagne", type: "wine" },
  { display_name: "Blanc de Blancs", producer: null, wine_name: "Blanc de Blancs", type: "wine" },
  { display_name: "Blanc de Noirs", producer: null, wine_name: "Blanc de Noirs", type: "wine" },
  // Spain producers
  { display_name: "Vega Sicilia", producer: "Vega Sicilia", wine_name: null, type: "producer" },
  { display_name: "Álvaro Palacios", producer: "Álvaro Palacios", wine_name: null, type: "producer" },
  { display_name: "Marqués de Murrieta", producer: "Marqués de Murrieta", wine_name: null, type: "producer" },
  { display_name: "La Rioja Alta", producer: "La Rioja Alta", wine_name: null, type: "producer" },
  { display_name: "CVNE", producer: "CVNE", wine_name: null, type: "producer" },
  { display_name: "Muga", producer: "Muga", wine_name: null, type: "producer" },
  { display_name: "Bodegas Roda", producer: "Bodegas Roda", wine_name: null, type: "producer" },
  { display_name: "Pingus", producer: "Pingus", wine_name: null, type: "producer" },
  // Spain specific wines
  { display_name: "Vega Sicilia Único", producer: "Vega Sicilia", wine_name: "Único", type: "wine" },
  { display_name: "L'Ermita", producer: "Álvaro Palacios", wine_name: "L'Ermita", type: "wine" },
  { display_name: "Pingus", producer: "Pingus", wine_name: "Pingus", type: "wine" },
  // Rhône producers
  { display_name: "Château Rayas", producer: "Château Rayas", wine_name: null, type: "producer" },
  { display_name: "Château de Beaucastel", producer: "Château de Beaucastel", wine_name: null, type: "producer" },
  { display_name: "Guigal", producer: "Guigal", wine_name: null, type: "producer" },
  { display_name: "Delas Frères", producer: "Delas Frères", wine_name: null, type: "producer" },
  { display_name: "Paul Jaboulet Aîné", producer: "Paul Jaboulet Aîné", wine_name: null, type: "producer" },
  { display_name: "Chapoutier", producer: "Chapoutier", wine_name: null, type: "producer" },
  { display_name: "Jean-Louis Chave", producer: "Jean-Louis Chave", wine_name: null, type: "producer" },
  { display_name: "Henri Bonneau", producer: "Henri Bonneau", wine_name: null, type: "producer" },
  // Rhône specific wines
  { display_name: "Hermitage", producer: null, wine_name: "Hermitage", type: "wine" },
  { display_name: "Côte-Rôtie La Landonne", producer: "Guigal", wine_name: "La Landonne", type: "wine" },
  { display_name: "Côte-Rôtie La Mouline", producer: "Guigal", wine_name: "La Mouline", type: "wine" },
  { display_name: "Côte-Rôtie La Turque", producer: "Guigal", wine_name: "La Turque", type: "wine" },
  { display_name: "Châteauneuf-du-Pape", producer: null, wine_name: "Châteauneuf-du-Pape", type: "wine" },
  // Loire producers
  { display_name: "Foreau Clos Naudin", producer: "Foreau", wine_name: "Clos Naudin", type: "wine" },
  { display_name: "Nicolas Joly", producer: "Nicolas Joly", wine_name: null, type: "producer" },
  { display_name: "Henri Bourgeois", producer: "Henri Bourgeois", wine_name: null, type: "producer" },
  { display_name: "Didier Dagueneau", producer: "Didier Dagueneau", wine_name: null, type: "producer" },
  // Germany/Austria producers
  { display_name: "Egon Müller", producer: "Egon Müller", wine_name: null, type: "producer" },
  { display_name: "Dr. Loosen", producer: "Dr. Loosen", wine_name: null, type: "producer" },
  { display_name: "JJ Prüm", producer: "JJ Prüm", wine_name: null, type: "producer" },
  { display_name: "Dönnhoff", producer: "Dönnhoff", wine_name: null, type: "producer" },
  { display_name: "Selbach-Oster", producer: "Selbach-Oster", wine_name: null, type: "producer" },
  { display_name: "Knoll", producer: "Knoll", wine_name: null, type: "producer" },
  { display_name: "Prager", producer: "Prager", wine_name: null, type: "producer" },
  { display_name: "F.X. Pichler", producer: "F.X. Pichler", wine_name: null, type: "producer" },
  // Germany specific wines
  { display_name: "Scharzhofberger Auslese", producer: "Egon Müller", wine_name: "Scharzhofberger Auslese", type: "wine" },
  { display_name: "Scharzhofberger Trockenbeerenauslese", producer: "Egon Müller", wine_name: "Scharzhofberger Trockenbeerenauslese", type: "wine" },
  { display_name: "Wehlener Sonnenuhr", producer: null, wine_name: "Wehlener Sonnenuhr", type: "wine" },
  { display_name: "Bernkasteler Doctor", producer: null, wine_name: "Bernkasteler Doctor", type: "wine" },
  // California producers
  { display_name: "Opus One Winery", producer: "Opus One Winery", wine_name: null, type: "producer" },
  { display_name: "Ridge Vineyards", producer: "Ridge Vineyards", wine_name: null, type: "producer" },
  { display_name: "Caymus Vineyards", producer: "Caymus Vineyards", wine_name: null, type: "producer" },
  { display_name: "Silver Oak", producer: "Silver Oak", wine_name: null, type: "producer" },
  { display_name: "Stag's Leap Wine Cellars", producer: "Stag's Leap Wine Cellars", wine_name: null, type: "producer" },
  { display_name: "Dominus Estate", producer: "Dominus Estate", wine_name: null, type: "producer" },
  { display_name: "Jordan Vineyard & Winery", producer: "Jordan Vineyard & Winery", wine_name: null, type: "producer" },
  { display_name: "Shafer Vineyards", producer: "Shafer Vineyards", wine_name: null, type: "producer" },
  // California specific wines
  { display_name: "Opus One", producer: "Opus One Winery", wine_name: "Opus One", type: "wine" },
  { display_name: "Ridge Monte Bello", producer: "Ridge Vineyards", wine_name: "Monte Bello", type: "wine" },
  { display_name: "Dominus", producer: "Dominus Estate", wine_name: "Dominus", type: "wine" },
  // Australia producers
  { display_name: "Penfolds", producer: "Penfolds", wine_name: null, type: "producer" },
  { display_name: "Henschke", producer: "Henschke", wine_name: null, type: "producer" },
  { display_name: "Torbreck", producer: "Torbreck", wine_name: null, type: "producer" },
  { display_name: "Clarendon Hills", producer: "Clarendon Hills", wine_name: null, type: "producer" },
  { display_name: "Two Hands", producer: "Two Hands", wine_name: null, type: "producer" },
  { display_name: "Yering Station", producer: "Yering Station", wine_name: null, type: "producer" },
  // Australia specific wines
  { display_name: "Penfolds Grange", producer: "Penfolds", wine_name: "Grange", type: "wine" },
  { display_name: "Penfolds Bin 707", producer: "Penfolds", wine_name: "Bin 707", type: "wine" },
  { display_name: "Penfolds Bin 389", producer: "Penfolds", wine_name: "Bin 389", type: "wine" },
  { display_name: "Penfolds RWT", producer: "Penfolds", wine_name: "RWT", type: "wine" },
  { display_name: "Henschke Hill of Grace", producer: "Henschke", wine_name: "Hill of Grace", type: "wine" },
  { display_name: "Torbreck RunRig", producer: "Torbreck", wine_name: "RunRig", type: "wine" },
  // New Zealand
  { display_name: "Cloudy Bay", producer: "Cloudy Bay", wine_name: null, type: "producer" },
  { display_name: "Felton Road", producer: "Felton Road", wine_name: null, type: "producer" },
  { display_name: "Ata Rangi", producer: "Ata Rangi", wine_name: null, type: "producer" },
  { display_name: "Dry River", producer: "Dry River", wine_name: null, type: "producer" },
  { display_name: "Rippon", producer: "Rippon", wine_name: null, type: "producer" },
  // Argentina
  { display_name: "Achaval Ferrer", producer: "Achaval Ferrer", wine_name: null, type: "producer" },
  { display_name: "Catena Zapata", producer: "Catena Zapata", wine_name: null, type: "producer" },
  { display_name: "Zuccardi", producer: "Zuccardi", wine_name: null, type: "producer" },
  { display_name: "Clos de los Siete", producer: null, wine_name: "Clos de los Siete", type: "wine" },
  // Chile
  { display_name: "Almaviva", producer: "Almaviva", wine_name: "Almaviva", type: "wine" },
  { display_name: "Seña", producer: null, wine_name: "Seña", type: "wine" },
  { display_name: "Concha y Toro", producer: "Concha y Toro", wine_name: null, type: "producer" },
  { display_name: "Almaviva Winery", producer: "Almaviva Winery", wine_name: null, type: "producer" },
  // South Africa
  { display_name: "Kanonkop", producer: "Kanonkop", wine_name: null, type: "producer" },
  { display_name: "Meerlust", producer: "Meerlust", wine_name: null, type: "producer" },
  { display_name: "Boekenhoutskloof", producer: "Boekenhoutskloof", wine_name: null, type: "producer" },
  // Port
  { display_name: "Taylor Fladgate", producer: "Taylor Fladgate", wine_name: null, type: "producer" },
  { display_name: "Quinta do Noval", producer: "Quinta do Noval", wine_name: null, type: "producer" },
  { display_name: "Graham's", producer: "Graham's", wine_name: null, type: "producer" },
  { display_name: "Fonseca", producer: "Fonseca", wine_name: null, type: "producer" },
  { display_name: "Ramos Pinto", producer: "Ramos Pinto", wine_name: null, type: "producer" },
  { display_name: "Quinta do Crasto", producer: "Quinta do Crasto", wine_name: null, type: "producer" },
  { display_name: "Quinta do Vesuvio", producer: "Quinta do Vesuvio", wine_name: null, type: "producer" },
  { display_name: "Nacional", producer: "Quinta do Noval", wine_name: "Nacional", type: "wine" },
  { display_name: "Vintage Port", producer: null, wine_name: "Vintage Port", type: "wine" },
];

async function seedCurated() {
  const rows = CURATED.map((c) => ({ ...c, source: "curated" }));
  const n = await upsert(rows);
  console.log(`[curated] inserted/updated ${n} rows`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Seeding wine_suggestions...");
  await seedFromWines();
  await seedFromWatchlist();
  await seedCurated();

  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM wine_suggestions`
  );
  const total = (result as unknown as Array<{ count: string }>)[0]?.count ?? "?";
  console.log(`Done. Total rows in wine_suggestions: ${total}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
