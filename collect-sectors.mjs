// Classement par secteur d'activité (agriculture, santé, finance…), en complément du « domaine »
// technique (statistiques, science des données…). Méthode : mots-clés français et anglais cherchés
// dans le titre et le résumé. Un contenu reçoit au plus 2 secteurs ; sans mot-clé, il n'en a aucun.
// Les mots sont des débuts de mots : « agricultur » reconnaît agriculture, agricultural, agricultures.
// Pour ajuster : modifiez les listes ci-dessous, puis relancez « Collecte automatique ».

export const SECTORS = [
  ["agriculture", "Agriculture", ["agricultur", "agricol", "agro", "farm", "crops?\\b", "livestock", "élevage", "irrigation", "harvest", "récolte", "food security", "sécurité alimentaire", "soil", "maize", "cassava", "cocoa", "cacao", "cotton", "coton", "paddy"]],
  ["sante", "Santé", ["health", "santé", "medic", "médic", "clinical", "clinique", "disease", "maladie", "covid", "patient", "hospital", "hôpital", "cancer", "malaria", "paludisme", "epidemi", "épidémi", "pharma", "genom", "génom", "vaccin", "nutrition", "radiolog"]],
  ["finance", "Finance", ["financ", "bank", "banque", "credit (?:scor|risk|card|default)", "crédit", "loan", "fraud", "insurance", "assurance", "fintech", "trading", "stock market", "bourse", "invest", "microfinance", "payment", "paiement", "mobile money", "cryptocurrenc", "bitcoin"]],
  ["economie", "Économie", ["econom", "économ", "gdp", "pib\\b", "inflation", "trade\\b", "labor market", "labour market", "marché du travail", "unemploy", "chômage", "employment", "tax\\b", "fiscal", "impôt"]],
  ["environnement", "Environnement et climat", ["climat", "climate", "environment", "environnement", "weather", "météo", "biodivers", "pollution", "deforest", "carbon", "carbone", "wildfire", "flood", "inondation", "ocean", "océan", "earth observation", "sustainab", "wildlife", "forest", "forêt", "water\\b", "eaux?\\b"]],
  ["energie", "Énergie", ["energ", "énerg", "solar", "solaire", "electricity", "électricité", "power grid", "smart grid", "renewable", "renouvelable", "oil and gas", "pétrole", "battery", "batterie", "nuclear", "nucléaire"]],
  ["education", "Éducation", ["education", "éducation", "school", "école", "scolaire", "pedagog", "pédagog", "teaching", "enseignement", "e-learning", "edtech", "literacy", "alphabétisation", "curriculum"]],
  ["transport", "Transport et logistique", ["transport", "traffic", "trafic", "mobility", "mobilité", "vehicle", "véhicule", "logistic", "logistiq", "aviation", "airline", "railway", "ferroviaire", "shipping", "maritime", "autonomous driving", "livraison"]],
  ["developpement", "Développement et impact social", ["poverty", "pauvreté", "humanitarian", "humanitaire", "refugee", "réfugié", "social impact", "impact social", "sdg\\b", "sustainable development", "développement durable", "gender", "inclusion", "inclusive", "ngo\\b", "nonprofit", "non-profit"]],
  ["gouvernance", "Administration publique", ["government", "gouvernement", "public sector", "secteur public", "census", "recensement", "election", "élection", "civic", "public polic", "politique publique", "smart city", "ville intelligente", "municipal", "administration publique"]],
  ["commerce", "Commerce et marketing", ["retail", "e-commerce", "ecommerce", "marketing", "customer", "clientèle", "sales\\b", "ventes", "supply chain", "chaîne d’approvisionnement", "consumer", "consommateur", "marketplace"]],
  ["immobilier", "Immobilier et logement", ["real estate", "immobilier", "housing", "logement"]],
  ["tourisme", "Tourisme", ["tourism", "tourisme", "hotel", "hôtel", "travel", "voyage"]],
  ["securite", "Cybersécurité", ["cyber", "malware", "phishing", "intrusion", "(?:information|network|app) security", "sécurité informatique"]],
  ["medias", "Médias et culture", ["media\\b", "médias", "journalis", "music", "musique", "film", "cinéma", "heritage", "patrimoine", "cultural", "culturel"]],
  ["sport", "Sport", ["sport", "football", "soccer", "basketball", "tennis", "olymp", "athlet"]],
  ["sciences", "Sciences", ["astronom", "physics", "physique", "chemistry", "chimie", "biolog", "telescope", "galax", "neuroscien", "quantum"]]
].map(([id, label, words]) => ({
  id, label,
  /* un mot-clé ne compte qu’au début d’un mot (pas dans « learning » ou « windows ») */
  regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})`, "giu")
}));

/* Types de contenus classés par secteur : projets, challenges, jeux de données, publications. */
const SECTOR_TYPES = new Set(["challenge", "analysis", "dataset", "research"]);

export function sectorsOf(text, max = 2) {
  const scored = SECTORS.map((sector, order) => ({ sector, order, hits: (String(text).match(sector.regex) || []).length }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.order - b.order);
  return scored.slice(0, max).map((entry) => entry.sector);
}

export function assignSectors(items) {
  let tagged = 0;
  for (const item of items) {
    if (!SECTOR_TYPES.has(item.type) || item.status === "platform") continue;
    const found = sectorsOf(`${item.title} ${item.summary}`);
    if (found.length) {
      item.sectors = found.map((sector) => sector.id);
      item.sectorLabels = found.map((sector) => sector.label);
      tagged++;
    } else {
      delete item.sectors;
      delete item.sectorLabels;
    }
  }
  return tagged;
}
