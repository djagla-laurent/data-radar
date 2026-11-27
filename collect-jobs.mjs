// Emplois pour profils statistiques et données, au Bénin ou à distance.
// 1) Sources : Himalayas (offres à distance ouvertes aux candidats du Bénin, country=BJ) et Jobicy,
//    en plus de Remotive, Arbeitnow (sources.js), de la presse béninoise (feeds.json) et des ajouts
//    manuels (manual-events.json, "type": "job").
// 2) Classement : chaque offre reçoit un ou deux profils (statisticien, data analyst…), un lieu
//    (Bénin, Afrique, à distance ouvert au monde, à distance limité, ailleurs) et un score de pertinence.

/* ---------- Profils ---------- */
export const PROFILES = [
  ["statisticien", "Statisticien", 10, ["statistic", "statistiq", "biostat", "survey (?:statistic|methodolog|analyst|data|manager|officer)", "enquêtes? (?:statist|ménage)", "census", "recensement", "demograph", "démograph", "sampling", "échantillonn", "sas programmer", "biometric"]],
  ["econometre", "Économiste / Économètre", 8, ["econometric", "économétr", "economist", "économiste", "actuar", "quantitative (?:analyst|researcher|economist)"]],
  ["suivi-eval", "Suivi-évaluation et études", 7, ["monitoring and evaluation", "monitoring & evaluation", "m&e\\b", "meal\\b", "suivi[- ]évaluation", "suivi et évaluation", "evaluation (?:officer|specialist|analyst)", "research (?:officer|analyst|assistant|associate)", "data collection", "collecte de données", "chargée? d.études", "impact evaluation", "epidemiolog", "épidémiolog", "information management", "gestion de l.information"]],
  ["analyste", "Data analyst / BI", 6, ["data analyst", "analyste (?:de )?données", "analyste data", "business intelligence", "bi (?:developer|analyst|engineer)", "power bi", "tableau", "reporting analyst", "analytics", "insight", "business analyst", "analyste"]],
  ["data-manager", "Data manager", 5, ["data manager", "gestionnaire de données", "data steward", "data governance", "chef de projet (?:data|numérique|données)", "data quality", "système d.information", "master data"]],
  ["scientist", "Data scientist / IA", 5, ["data scientist", "scientifique des données", "machine learning", "ml\\b", "ai (?:engineer|scientist|researcher|specialist|developer)", "ingénieur (?:ia|ai)", "chercheur (?:ia|ai)", "deep learning", "nlp\\b", "computer vision", "mlops", "intelligence artificielle", "artificial intelligence", "llm\\b"]],
  ["sig", "SIG et cartographie", 4, ["gis\\b", "geospatial", "géospatial", "géomatique", "geomatic", "cartograph", "remote sensing", "télédétection", "sig\\b"]],
  ["engineer", "Ingénieur données", 4, ["data engineer", "ingénieur (?:des )?données", "etl\\b", "data pipeline", "big data", "data platform", "data architect", "database", "base de données", "dataops", "data warehouse", "spark\\b", "dba\\b"]],
  ["dev", "Développement logiciel", 2, ["(?:software|python|full[- ]?stack|backend|back-end|frontend|front-end|web) (?:developer|engineer)", "développeu", "developer\\b", "ingénieur logiciel"]]
].map(([id, label, weight, words]) => ({ id, label, weight, regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})`, "giu") }));

const TOPIC_OF = { statisticien: "statistics", econometre: "statistics", "suivi-eval": "statistics", analyste: "data-science", "data-manager": "data-engineering", scientist: "data-science", sig: "data-science", engineer: "data-engineering", dev: "it" };
const TOPIC_LABELS = { statistics: "Statistiques", "data-science": "Science des données", "data-engineering": "Ingénierie des données", it: "Informatique" };

/* Un profil est retenu s’il apparaît dans le titre, ou au moins 2 fois dans le texte. Le titre compte triple. */
export function profilesOf(title, summary, max = 2) {
  const count = (text, regex) => (String(text).match(regex) || []).length;
  return PROFILES.map((profile, order) => {
    const inTitle = count(title, profile.regex), inText = count(summary, profile.regex);
    return { profile, order, inTitle, weighted: inTitle * 3 + inText, ok: inTitle > 0 || inText >= 2 };
  }).filter((entry) => entry.ok)
    .sort((a, b) => b.weighted - a.weighted || b.profile.weight - a.profile.weight || a.order - b.order)
    .slice(0, max);
}

/* ---------- Lieu ---------- */
const BENIN = /b[ée]nin|cotonou|porto[- ]novo|parakou|abomey|bohicon|ouidah|djougou|instad|insae/i;
const WORLD = /worldwide|anywhere|global|all countries|work from anywhere|international|monde entier/i;
const AFRICA_REGION = /africa|afrique|emea/i;
const AFRICAN_COUNTRY = /nigeria|ghana|s[ée]n[ée]gal|c[ôo]te d.ivoire|ivory coast|togo|burkina|mali\b|niger\b|cameroun|cameroon|kenya|rwanda|maroc|morocco|tunisi|alg[ée]ri|egypt|[ée]gypte|ethiopi|tanzani|ugand|congo|gabon|guin[ée]e|mauritani|madagascar|zambi|zimbabw|south africa|afrique du sud|angola|mozambi|namibi|botswana|dakar|abidjan|lagos|nairobi|accra/i;

export const PLACE_LABELS = { benin: "Bénin", africa: "Afrique", remote: "À distance · ouvert au monde", "remote-limited": "À distance · région limitée", abroad: "Sur place hors Afrique" };

export function placeOf(item) {
  if (item.place === "benin") {
    /* les flux presse « Bénin » peuvent ramener l’annonce d’un autre pays : le titre prime sur l’indication du flux */
    return !BENIN.test(item.title) && AFRICAN_COUNTRY.test(item.title) ? "africa" : "benin";
  }
  if (item.place && PLACE_LABELS[item.place]) return item.place; /* imposé par la source */
  const where = String(item.where || "").trim();
  /* offre à distance : le Bénin dans la liste des pays admis veut dire « ouvert au Bénin », pas « basé au Bénin » */
  if (item.remote) return !where || WORLD.test(where) || AFRICA_REGION.test(where) || BENIN.test(where) ? "remote" : "remote-limited";
  if (BENIN.test(where) || BENIN.test(item.title)) return "benin";
  if (AFRICA_REGION.test(where) || AFRICAN_COUNTRY.test(where)) return "africa";
  return where ? "abroad" : "";
}

const PLACE_BONUS = { benin: 10, africa: 4, remote: 6, "remote-limited": 0, abroad: -2 };

/* Classe les offres, calcule le score, et retire les offres sans rapport (Arbeitnow trop large). */
export function refineJobs(items) {
  const kept = [];
  for (const item of items) {
    if (item.type !== "job") { kept.push(item); continue; }
    const found = profilesOf(item.title, item.summary);
    if (!found.length && String(item.id).startsWith("arbeitnow-")) continue;
    item.profiles = found.map((e) => e.profile.id);
    item.profileLabels = found.map((e) => e.profile.label);
    item.place = placeOf(item) || undefined;
    const openToBenin = item.remote && item.place === "remote" && BENIN.test(String(item.where || ""));
    item.placeLabel = openToBenin ? "À distance · ouvert au Bénin" : item.place === "remote-limited" && item.where ? `À distance · ${String(item.where).slice(0, 28)}` : item.place === "abroad" && item.where ? `Sur place · ${String(item.where).slice(0, 24)}` : PLACE_LABELS[item.place];
    const best = found[0];
    item.score = (best ? best.profile.weight + Math.min(3, best.inTitle) : 0) + (PLACE_BONUS[item.place] ?? 0) + (openToBenin ? 2 : 0);
    if (best && TOPIC_OF[best.profile.id]) { item.topic = TOPIC_OF[best.profile.id]; item.topicLabel = TOPIC_LABELS[item.topic]; }
    kept.push(item);
  }
  return kept;
}

/* ---------- Sources ---------- */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function toIso(value) {
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/* Himalayas : offres à distance ouvertes aux candidats du Bénin (country=BJ, y compris « monde entier »). */
async function fromHimalayas({ make, clean, fetchJson }) {
  const queries = [["statistician", "statistics"], ["biostatistics", "statistics"], ["monitoring and evaluation", "statistics"], ["economist", "statistics"], ["data analyst", "data-science"], ["data scientist", "data-science"], ["data engineer", "data-engineering"]];
  const found = new Map(), errors = [];
  for (const [query, topic] of queries) {
    try {
      const params = new URLSearchParams({ q: query, country: "BJ", sort: "recent" });
      const data = await fetchJson(`https://himalayas.app/jobs/api/search?${params}`);
      for (const job of (data.jobs || []).slice(0, 15)) {
        const url = job.applicationLink || job.guid;
        if (!job.title || !url || found.has(url)) continue;
        const places = Array.isArray(job.locationRestrictions) ? job.locationRestrictions.filter(Boolean) : [];
        found.set(url, make({
          id: `himalayas-${Buffer.from(String(url)).toString("base64url").slice(-24)}`, type: "job", typeLabel: "Emploi", topic, language: "en",
          date: toIso(job.pubDate), source: `Himalayas${job.companyName ? ` · ${clean(job.companyName, 40)}` : ""}`, url, title: clean(job.title, 200),
          summary: clean(job.excerpt || job.description, 220) || "Offre à distance publiée sur Himalayas.",
          value: `Poste à distance${job.employmentType ? `, ${clean(job.employmentType, 30)}` : ""}${job.seniority ? `, niveau ${[].concat(job.seniority).join("/")}` : ""}. Trouvé avec le filtre « Bénin » de Himalayas : vérifiez le pays, le fuseau horaire et les conditions sur l’offre.`,
          remote: true, where: places.length ? places.join(", ") : "Worldwide"
        }));
      }
    } catch (error) { errors.push(`${query} : ${error.message}`); }
    await pause(500);
  }
  if (!found.size && errors.length) throw new Error(`Himalayas : ${[...new Set(errors)].slice(0, 2).join(" | ")}`);
  return [...found.values()];
}

/* Jobicy : offres à distance (API publique ; on garde le lien vers l’offre d’origine). */
async function fromJobicy({ make, clean, fetchJson }) {
  const found = new Map(), errors = [];
  for (const [tag, topic] of [["statistician", "statistics"], ["data analyst", "data-science"]]) {
    try {
      const data = await fetchJson(`https://jobicy.com/api/v2/remote-jobs?${new URLSearchParams({ count: "50", tag })}`);
      for (const job of data.jobs || []) {
        if (!job.jobTitle || !job.url || found.has(job.url)) continue;
        const geo = Array.isArray(job.jobGeo) ? job.jobGeo.join(", ") : String(job.jobGeo || "");
        found.set(job.url, make({
          id: `jobicy-${job.id}`, type: "job", typeLabel: "Emploi", topic, language: "en",
          date: toIso(job.pubDate), source: `Jobicy${job.companyName ? ` · ${clean(job.companyName, 40)}` : ""}`, url: job.url, title: clean(job.jobTitle, 200),
          summary: clean(job.jobExcerpt || job.jobDescription, 220) || "Offre à distance publiée sur Jobicy.",
          value: `Poste à distance${geo ? ` (${clean(geo, 40)})` : ""}${job.jobType ? `, ${clean([].concat(job.jobType).join(", "), 30)}` : ""}. Vérifiez que votre pays est admis sur l’offre.`,
          remote: true, where: geo
        }));
      }
    } catch (error) { errors.push(`${tag} : ${error.message}`); }
    await pause(500);
  }
  if (!found.size && errors.length) throw new Error(`Jobicy : ${[...new Set(errors)].slice(0, 2).join(" | ")}`);
  return [...found.values()];
}

/* ---------- Ajouts manuels (manual-events.json, "type": "job") ---------- */
export function manualJobs(list, { make }) {
  const today = new Date().toISOString().slice(0, 10);
  return (Array.isArray(list) ? list : []).filter((e) => e?.type === "job" && e.title && e.url).map((e, index) => make({
    id: `manual-job-${index}-${String(e.date || e.deadline || today).slice(0, 10)}`, type: "job", typeLabel: "Emploi",
    topic: e.topic || "statistics", language: e.language || "fr", date: String(e.date || today).slice(0, 10), deadline: e.deadline,
    source: e.source || "Ajout manuel", url: e.url, title: e.title,
    summary: e.summary || [e.where, e.deadline && `date limite : ${e.deadline}`].filter(Boolean).join(" · ") || "Offre ajoutée manuellement.",
    value: e.value || "Offre ajoutée par l’équipe du projet. Vérifiez la date limite et les conditions sur la page officielle.",
    remote: Boolean(e.remote), where: e.where || (e.remote ? "" : "Bénin"), place: e.place
  }));
}

export async function collectJobs({ make, clean, fetchJson, manual = [] }) {
  const items = [], errors = [];
  for (const [name, load] of [["Himalayas", fromHimalayas], ["Jobicy", fromJobicy]]) {
    try { items.push(...await load({ make, clean, fetchJson })); } catch (error) { errors.push(error.message || name); }
  }
  items.push(...manualJobs(manual, { make }));
  return { items, errors };
}
