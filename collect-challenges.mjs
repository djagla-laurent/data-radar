// Challenges, hackathons et compétitions en analyse de données, dans le monde.
// Sources : API publique de Devpost, API Kaggle (facultative, avec clé), plateformes
// permanentes (Zindi, DrivenData…) et ajouts manuels (manual-events.json, type "challenge").
// Chaque fiche porte un statut : "open" (en cours), "upcoming" (à venir), "ended" (terminé
// récemment) ou "platform" (plateforme permanente), et une date limite (deadline) si connue.

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const iso = (year, month, day) => new Date(Date.UTC(year, month, day, 12)).toISOString().slice(0, 10);
const monthOf = (word) => MONTHS[String(word).slice(0, 3).toLowerCase()];

/* "Nov 03 - Dec 15, 2026", "Dec 01, 2026 - Jan 15, 2027", "Nov 03 - 10, 2026" → { start, end } (AAAA-MM-JJ) */
export function parseDevpostDates(text, now = new Date()) {
  const s = String(text || "");
  const same = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})/);
  if (same && monthOf(same[1]) !== undefined) {
    const m = monthOf(same[1]), y = Number(same[4]);
    return { start: iso(y, m, Number(same[2])), end: iso(y, m, Number(same[3])) };
  }
  const tokens = [...s.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/g)].filter((t) => monthOf(t[1]) !== undefined);
  if (!tokens.length) return null;
  const last = tokens[tokens.length - 1], first = tokens[0];
  const endYear = Number(last[3] || now.getUTCFullYear());
  const end = iso(endYear, monthOf(last[1]), Number(last[2]));
  if (tokens.length === 1) return { start: end, end };
  const startYear = Number(first[3] || (monthOf(first[1]) > monthOf(last[1]) ? endYear - 1 : endYear));
  return { start: iso(startYear, monthOf(first[1]), Number(first[2])), end };
}

const frDate = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const base = { type: "challenge", typeLabel: "Challenge et hackathon" };

/* ---------- Devpost (API publique utilisée par le site lui-même) ---------- */
const DEVPOST_QUERIES = ["data analysis", "data science", "statistics", "open data", "data visualization"];

export function devpostItem(h, { make, clean, today }) {
  const dates = parseDevpostDates(h.submission_period_dates);
  const status = ["open", "upcoming", "ended"].includes(h.open_state) ? h.open_state : "open";
  if (status === "ended") {
    const limit = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
    if (!dates || dates.end < limit) return null; /* terminé depuis trop longtemps */
  }
  if (!h.title || !h.url) return null;
  const org = clean(h.organization_name || "", 40);
  const noOrg = !org || /^(n\/?a|none|-+)$/i.test(org);
  if (noOrg && /\btest(s|ing)?\b/i.test(h.title)) return null; /* fiche de test */
  if (status === "upcoming" && dates && dates.start > new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10)) return null; /* trop lointain */
  const prize = clean(h.prize_amount || "", 30).replace(/([$€£])\s+/g, "$1");
  const themes = (h.themes || []).map((t) => t.name).filter(Boolean).slice(0, 3);
  const place = h.displayed_location?.location;
  const when = dates ? `Du ${frDate(dates.start)} au ${frDate(dates.end)}` : (h.submission_period_dates || "Dates à confirmer");
  return make({
    ...base, id: `devpost-${h.id}`, topic: "data-science", language: "en", status, prize: prize && !/^[$€£]?0$/.test(prize) ? prize : undefined,
    date: dates ? dates.start : today, deadline: status === "ended" ? undefined : dates?.end,
    source: `Devpost${noOrg ? "" : ` · ${org}`}`, url: h.url, title: clean(h.title, 200),
    summary: `${when}${place ? ` · ${place}` : ""}${themes.length ? ` · ${themes.join(", ")}` : ""}.`,
    value: `${status === "open" ? "Hackathon en cours" : status === "upcoming" ? "Hackathon à venir" : "Hackathon récemment terminé"}${prize && !/^\$?0$/.test(prize) ? `, dotation : ${prize}` : ""}. Vérifiez les règles et les conditions de participation sur la page officielle.`
  });
}

async function fromDevpost({ make, clean, fetchJson, today }) {
  const found = new Map();
  const run = async (query, statuses, page) => {
    const params = new URLSearchParams({ search: query, order_by: "recently-added", page: String(page) });
    statuses.forEach((s) => params.append("status[]", s));
    const data = await fetchJson(`https://devpost.com/api/hackathons?${params}`);
    for (const h of data.hackathons || []) {
      const item = devpostItem(h, { make, clean, today });
      if (item && !found.has(item.id)) found.set(item.id, item);
    }
    await new Promise((resolve) => setTimeout(resolve, 300)); /* ménager l’API */
  };
  for (const query of DEVPOST_QUERIES) for (const page of [1, 2]) await run(query, ["open", "upcoming"], page);
  for (const query of ["data analysis", "data science"]) await run(query, ["ended"], 1);
  return [...found.values()];
}

/* ---------- Kaggle (facultatif : secrets KAGGLE_USERNAME et KAGGLE_KEY) ---------- */
async function fromKaggle({ make, clean, env, today }) {
  if (!env.KAGGLE_USERNAME || !env.KAGGLE_KEY) return null;
  const auth = Buffer.from(`${env.KAGGLE_USERNAME}:${env.KAGGLE_KEY}`).toString("base64");
  const response = await fetch("https://www.kaggle.com/api/v1/competitions/list?sortBy=latestDeadline&group=general&category=all&page=1", {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Kaggle HTTP ${response.status}`);
  const list = await response.json();
  const now = new Date().toISOString();
  return (Array.isArray(list) ? list : []).filter((c) => c.deadline && String(c.deadline) > now && c.title).slice(0, 25).map((c) => {
    const slug = String(c.ref || c.url || c.title).split("/").filter(Boolean).pop();
    const reward = clean(c.reward || "", 30);
    return make({
      ...base, id: `kaggle-${slug}`, topic: "data-science", language: "en", status: "open", prize: /\d/.test(reward) ? reward : undefined,
      date: String(c.enabledDate || c.dateEnabled || today).slice(0, 10), deadline: String(c.deadline).slice(0, 10),
      source: "Kaggle", url: String(c.url || "").startsWith("http") ? c.url : `https://www.kaggle.com/competitions/${slug}`,
      title: clean(c.title, 200), summary: clean(c.description, 240) || "Compétition de data science sur Kaggle.",
      value: `Compétition en cours, date limite le ${frDate(String(c.deadline).slice(0, 10))}${reward ? `, récompense : ${reward}` : ""}${c.teamCount ? `, ${c.teamCount} équipes` : ""}.`
    });
  });
}

/* ---------- Plateformes permanentes : où trouver de nouveaux challenges ---------- */
const PLATFORMS = [
  ["zindi", "Zindi", "https://zindi.africa/competitions", "Plateforme de challenges de data science centrée sur l’Afrique, avec des compétitions régulières ouvertes aux data scientists africains."],
  ["kaggle", "Kaggle", "https://www.kaggle.com/competitions", "Plateforme de référence pour les compétitions de data science et d’apprentissage automatique, avec jeux de données et notebooks publics."],
  ["drivendata", "DrivenData", "https://www.drivendata.org/competitions/", "Compétitions de data science à impact social : santé, environnement, éducation."],
  ["aicrowd", "AIcrowd", "https://www.aicrowd.com/challenges", "Challenges ouverts d’intelligence artificielle et de science des données, proposés par des laboratoires et des entreprises."],
  ["codabench", "Codabench", "https://www.codabench.org/competitions/", "Plateforme open source de compétitions et de benchmarks, successeur de CodaLab."],
  ["devpost", "Devpost", "https://devpost.com/hackathons", "Annuaire mondial de hackathons en ligne et sur place, filtrable par thème et par statut."]
];

const platformItems = ({ make, today }) => PLATFORMS.map(([id, name, url, summary]) => make({
  ...base, id: `platform-${id}`, topic: "data-science", language: "fr", status: "platform", date: today,
  source: `Plateforme · ${name}`, url, title: `${name} : challenges et compétitions en données`, summary,
  value: "Plateforme permanente : de nouveaux challenges y sont publiés régulièrement. Consultez la page pour voir ceux qui sont ouverts."
}));

/* ---------- Ajouts manuels (manual-events.json, "type": "challenge") ---------- */
export function manualChallenges(list, { make, today }) {
  return (Array.isArray(list) ? list : []).filter((e) => e?.type === "challenge" && e.title && e.url).map((e, index) => make({
    ...base, id: `manual-challenge-${index}-${String(e.date || e.deadline || today).slice(0, 10)}`, topic: e.topic || "data-science", language: e.language || "fr",
    status: ["open", "upcoming", "ended"].includes(e.status) ? e.status : "open", date: String(e.date || today).slice(0, 10), deadline: e.deadline, prize: e.prize,
    source: e.source || "Ajout manuel", url: e.url, title: e.title,
    summary: e.summary || [e.place, e.deadline && `date limite : ${e.deadline}`].filter(Boolean).join(" · ") || "Challenge ajouté manuellement.",
    value: e.value || "Challenge ajouté par l’équipe du projet. Vérifiez les conditions sur la page officielle."
  }));
}

export async function collectChallenges({ make, clean, fetchJson, env = {}, manual = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  const errors = [];
  const ctx = { make, clean, fetchJson, env, today };
  for (const [name, load] of [["Devpost", fromDevpost], ["Kaggle", fromKaggle]]) {
    try { items.push(...((await load(ctx)) || [])); } catch (error) { errors.push(`${name} : ${error.message}`); }
  }
  items.push(...platformItems(ctx), ...manualChallenges(manual, ctx));
  return { items, errors, live: items.filter((i) => i.status !== "platform").length };
}
