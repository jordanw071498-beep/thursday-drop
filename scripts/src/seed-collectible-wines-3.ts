/**
 * Supplemental seed batch 3 — user-requested names (de-duped against DB first).
 * Run: pnpm --filter @workspace/scripts run seed-collectible-wines-3
 *
 * Already in DB (skipped): Agrapart Minéral, Bâtard-Montrachet, Beaucastel Hommage,
 * Case Basse, CastelGiocondo, Castillo Ygay, Catena Zapata Adrianna River Stones,
 * Caymus Special Selection, Chevalier-Montrachet, Clos de la Roche, Clos de Tart,
 * Clos de Vougeot, Clos des Lambrays, Clos des Papes, Clos Rougeard (all three wines),
 * Clos Saint-Jacques, Corton-Charlemagne, Didier Dagueneau Silex, Dom Pérignon,
 * Dominus, Dönnhoff Hermannshöhle, Egly-Ouriet, Egon Müller Scharzhofberger,
 * Elio Altare Arborina, Faust The Pact, Guado al Tasso, La Chapelle (bare),
 * Le Dôme, Le Serre Nuove, Les Amoureuses, Les Suchots, Luciano Sandrone Aleste,
 * Marqués de Murrieta, Napanook, Opus One, Pegau Cuvée Réservée,
 * Poderi Aldo Conterno Cicala, Quintessa, Rayas, Richebourg, Ripe al Convento,
 * Silver Oak, Sir Winston Churchill, Soldera, Stella di Campalto,
 * Ulysse Collin Les Maillons, Ulysse Collin Les Roises, Viñedo Chadwick.
 * Also in DB: Bodega Noemía (accented), Clos Fourtet.
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

const w = (name: string): SuggestionInput => ({ display_name: name, wine_name: name, producer: null, type: "wine" });
const p = (name: string): SuggestionInput => ({ display_name: name, producer: name, wine_name: null, type: "producer" });

const ENTRIES: SuggestionInput[] = [
  // ── Stella di Campalto (Montalcino biodynamic) ────────────────────────
  p("Stella di Campalto"),
  w("Stella di Campalto Amore"),          // entry-level Brunello
  w("Stella di Campalto Riserva"),        // top Brunello Riserva

  // ── Piedmont additions ─────────────────────────────────────────────────
  w("Sandrone Aleste"),                   // short form of Luciano Sandrone Aleste (Cannubi Boschis renamed 2013)
  w("Vietti Scarrone"),                   // Vietti single-vineyard Barolo
  p("Produttori del Barbaresco"),
  w("Produttori del Barbaresco Asili Riserva"),
  w("Produttori del Barbaresco Montestefano Riserva"),
  p("Burlotto"),                          // G.B. Burlotto — Verduno Barolo specialist
  w("Burlotto Acclivi"),                  // Burlotto's top Barolo
  w("Burlotto Monvigliero"),              // top single-vineyard Barolo
  w("Burlotto Barolo"),
  w("Aldo Conterno Cicala"),              // short form of Poderi Aldo Conterno Cicala

  // ── Tuscany additions ──────────────────────────────────────────────────
  p("Pian delle Vigne"),                  // Antinori's Brunello di Montalcino estate
  w("Pian delle Vigne Brunello di Montalcino"),
  w("Pian delle Vigne Riserva"),
  p("Badia a Passignano"),                // Antinori Chianti Classico estate
  w("Badia a Passignano Gran Selezione"), // Chianti Classico Gran Selezione
  p("Bibi Graetz"),
  w("Testamatta"),                        // Bibi Graetz flagship Sangiovese IGT
  w("Bibi Graetz Testamatta"),
  w("Colore"),                            // Bibi Graetz's rarest wine
  w("Argiano Solengo"),                   // Super Tuscan (Cab/Merlot/Syrah/Petit Verdot)

  // ── California — Napa cult producers ──────────────────────────────────
  p("Continuum Estate"),
  w("Continuum"),                         // Tim Mondavi's Napa Proprietary Red
  w("Novicium"),                          // Continuum's second wine
  p("Carter Cellars"),
  w("Carter The Three Kings"),            // single-vineyard Napa Cabernet
  w("Carter The O.G."),                   // Carter Cellars flagship
  w("Carter Beckstoffer To Kalon"),
  w("Beckstoffer To Kalon"),              // vineyard name appearing on many cult labels
  w("Beckstoffer Georges III"),           // another Beckstoffer heritage vineyard
  p("Quilceda Creek"),                    // Washington State icon (Columbia Valley Cab)
  w("Quilceda Creek Cabernet Sauvignon"),
  p("La Jota Vineyard Co"),               // Howell Mountain Cabernet
  w("La Jota Cabernet Sauvignon"),
  w("La Jota Anniversary Release"),
  p("Seavey Vineyard"),                   // Conn Valley Napa Cabernet
  w("Seavey Cabernet Sauvignon"),
  p("Palmaz Vineyards"),                  // Napa Valley
  w("Palmaz Cabernet Sauvignon"),
  p("Far Niente"),                        // Oakville Napa
  w("Far Niente Cabernet Sauvignon"),
  w("Far Niente Chardonnay"),
  w("Opus One Overture"),                 // Opus One's non-vintage second wine
  w("Ulysses"),                           // Napa Valley Cabernet by Galerie / Julien Fayard
  w("Vine Hill Ranch"),                   // Napa estate (Oakville) — short form
  p("Blankiet Estate"),
  w("Blankiet Rive Droite"),              // Merlot-dominant cuvée named after Bordeaux right bank
  p("Château Musar"),                     // Lebanon — iconic red blend (Cinsault/Cab/Carignan)
  w("Château Musar Rouge"),
  w("Château Musar Blanc"),

  // ── Bordeaux — Right Bank additions ────────────────────────────────────
  w("Lafleur"),                           // Pomerol (Guinaudeau family)
  w("La Fleur-Pétrus"),                   // Pomerol (Moueix)
  w("La Conseillante"),                   // Pomerol (Nicolas family)
  w("Hosanna"),                           // Pomerol (Moueix) — former Certan-Giraud
  w("Gazin"),                             // Pomerol
  w("Clinet"),                            // Pomerol
  w("Canon-la-Gaffelière"),               // Saint-Émilion Grand Cru Classé A
  w("Pavie Macquin"),                     // Saint-Émilion Premier Grand Cru Classé B
  w("Larcis Ducasse"),                    // Saint-Émilion Premier Grand Cru Classé B
  w("Troplong Mondot"),                   // Saint-Émilion Premier Grand Cru Classé B

  // ── Bordeaux — Left Bank additions ─────────────────────────────────────
  w("Rauzan-Ségla"),                      // Margaux Deuxième Cru (owned by Chanel)
  w("Léoville Poyferré"),                 // Saint-Julien Deuxième Cru
  w("Léoville Barton"),                   // Saint-Julien Deuxième Cru
  w("Pichon Comtesse de Lalande"),        // Pauillac Deuxième Cru (same as Pichon Lalande)
  w("Smith Haut Lafitte"),                // Pessac-Léognan Cru Classé
  w("Haut-Bailly"),                       // Pessac-Léognan Cru Classé
  w("Pape Clément"),                      // Pessac-Léognan Cru Classé
  w("Canon"),                             // Saint-Émilion Premier Grand Cru Classé B (Chanel)

  // ── Burgundy — Grand Cru vineyard names (new) ─────────────────────────
  w("Charmes-Chambertin"),                // Gevrey Grand Cru
  w("Chapelle-Chambertin"),               // Gevrey Grand Cru
  w("Griotte-Chambertin"),                // Gevrey Grand Cru
  w("Clos de Bèze"),                      // short form (full: Chambertin Clos de Bèze)
  w("La Grande Rue"),                     // Vosne-Romanée Grand Cru monopole (Lamarche)
  w("Aux Brûlées"),                       // Vosne-Romanée 1er Cru
  w("Les Cazetiers"),                     // Gevrey-Chambertin 1er Cru
  w("Les Combottes"),                     // Gevrey-Chambertin 1er Cru (Ponsot, Dujac)

  // ── Burgundy — domaine-specific wines (new producers + wines) ──────────
  p("Méo-Camuzet"),
  w("Méo-Camuzet Cros Parantoux"),        // Henri Jayer's old vines Vosne 1er Cru
  w("Méo-Camuzet Aux Brûlées"),
  w("Méo-Camuzet Clos de Vougeot"),
  p("Ponsot"),
  w("Ponsot Clos de la Roche"),           // Ponsot's flagship (Clos Réserve)
  w("Ponsot Clos Saint-Denis"),
  p("Marquis d'Angerville"),
  w("Marquis d'Angerville Clos des Ducs"), // Volnay monopole 1er Cru
  w("Marquis d'Angerville Taillepieds"),  // Volnay 1er Cru
  w("Volnay Clos des Ducs"),              // bare vineyard reference
  w("Volnay Taillepieds"),
  w("Volnay Fremiets"),                   // Volnay 1er Cru
  p("Comte Armand"),
  w("Clos des Epeneaux"),                 // Pommard 1er Cru monopole (Comte Armand)
  w("Comte Armand Clos des Epeneaux"),
  p("Domaine de Montille"),
  w("Domaine de Montille Les Rugiens"),   // Pommard 1er Cru
  w("Domaine de Montille Les Pézerolles"),
  w("Domaine de Montille Corton-Pougets"),
  w("Roumier Les Amoureuses"),            // Chambolle-Musigny 1er Cru (most sought-after 1er Cru in Burgundy)
  w("Comte Georges de Vogüé Musigny"),    // flagship from the oldest Musigny owner
  p("Henri Boillot"),
  w("Henri Boillot Clos de la Mouchère"), // Puligny-Montrachet 1er Cru monopole
  w("Henri Boillot Corton-Charlemagne"),
  p("Vincent Dauvissat"),                 // top Chablis producer
  w("Vincent Dauvissat Les Preuses"),     // Chablis Grand Cru
  w("Vincent Dauvissat La Forest"),       // Chablis 1er Cru
  w("Ramonet Bâtard-Montrachet"),         // top white Burgundy from Ramonet
  w("Jean-Claude Ramonet Bâtard-Montrachet"),
  p("Bernard Dugat-Py"),
  w("Bernard Dugat-Py Coeur de Roy"),     // très vieilles vignes Gevrey 1er Cru
  w("Bernard Dugat-Py Champeaux"),        // Gevrey-Chambertin 1er Cru VV
  w("Bernard Dugat-Py Lavaux Saint-Jacques"), // Gevrey 1er Cru

  // ── Rhône additions ────────────────────────────────────────────────────
  w("Château d'Ampuis"),                  // Guigal's estate Côte-Rôtie (Mouline/Landonne/Turque blend)
  w("Chevalier de Sterimberg"),           // Jaboulet white Hermitage (Marsanne)
  w("Paul Jaboulet La Chapelle"),         // Jaboulet Hermitage (with producer prefix)
  w("Cornas La Geynale"),                 // Thierry Allemand top cuvée
  w("Cornas Reynard"),                    // Thierry Allemand other cuvée
  w("Cornas Renaissance"),                // Domaine Courbis / other Cornas producers
  w("Auguste Clape Cornas"),              // Auguste Clape's flagship
  w("Clape Cornas"),                      // short form
  w("Jean-Louis Chave Hermitage Blanc"),  // rare white Hermitage (Marsanne)
  w("René Rostaing Côte Blonde"),         // Côte-Rôtie lieu-dit (with full name)
  w("René Rostaing La Landonne"),         // Côte-Rôtie La Landonne (Rostaing)
  w("La Crau"),                           // Vieux Télégraphe lieu-dit (CdP)

  // ── Champagne additions ────────────────────────────────────────────────
  w("Krug Vintage"),                      // Krug's vintage prestige (vs Grande Cuvée MV)
  w("Dom Pérignon P2"),                   // second plénitude (long-aged release)
  w("Dom Pérignon Oenothèque"),           // former name for P2/P3 releases
  w("Dom Pérignon Rosé"),
  w("La Grande Dame"),                    // Veuve Clicquot prestige cuvée
  w("Grande Dame"),                       // common short reference
  w("Agrapert Avizoise"),                 // Blanc de Blancs from Avize Grand Cru
  w("Egly-Ouriet Rosé"),                  // Egly-Ouriet's Brut Rosé
  p("David Léclapart"),
  w("David Léclapart L'Artiste"),         // Blanc de Blancs Ambonnay
  w("Jacquesson Vauzelle Terme"),         // single-vineyard Dizy 1er Cru

  // ── Loire additions ────────────────────────────────────────────────────
  p("Clos Rougeard"),                     // producer entry (have individual wines)
  w("Château Rayas Réservé"),             // Rayas's second wine (Châteauneuf)

  // ── Germany / Alsace additions ────────────────────────────────────────
  w("Dönnhoff Oberhäuser Brücke"),        // top Nahe GG Riesling (alongside Hermannshöhle)
  w("Zind-Humbrecht Clos Jebsal"),        // Turckheim Alsace (Pinot Gris VT/SGN)
  w("Zind-Humbrecht Rangen de Thann"),    // Grand Cru Rangen (volcanic, Pinot Gris/Riesling)

  // ── Spain additions ────────────────────────────────────────────────────
  p("CVNE"),
  w("CVNE Imperial Gran Reserva"),        // Rioja flagship
  w("CVNE Viña Real Gran Reserva"),       // Rioja Alavesa
  p("Muga"),
  w("Muga Selección Especial"),           // Rioja Reserva flagship blend
  w("Muga Prado Enea"),                   // Muga Gran Reserva
  p("Pintia"),                            // Vega Sicilia's Toro estate
  w("Pintia Toro"),

  // ── South America additions ────────────────────────────────────────────
  w("Catena Zapata Adrianna Fortuna Terrae"), // Adrianna single-block Malbec
  w("Bodega Noemia"),                     // unaccented spelling variant (also in DB as Noemía)
  p("Bodega Chacra"),
  w("Bodega Chacra Treinta y Dos"),       // 1932-vine Patagonia Pinot Noir
  w("Chacra Treinta y Dos"),              // short form
  p("Comando G"),
  w("Comando G Rumbo al Norte"),          // old-vine Garnacha from Sierra de Gredos, Madrid
  w("Comando G Rozas"),                   // another Comando G cuvée
];

async function main() {
  console.log(`Seeding ${ENTRIES.length} entries…`);
  const n = await upsert(ENTRIES, "curated");
  console.log(`Done — ${n} unique entries upserted.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
