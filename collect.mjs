// Collecte automatique : exécutée par GitHub Actions toutes les 6 heures.
// Réutilise les connecteurs de sources.js (une seule version du code) et ajoute
// les conférences. Écrit data/items.json, que le site lit directement.
import fs from "node:fs";
import vm from "node:vm";
import { DOMParser } from "@xmldom/xmldom";
import { load as loadYaml } from "js-yaml";
import { collectChallenges } from "./collect-challenges.mjs";
import { assignSectors } from "./collect-sectors.mjs";
import { collectJobs, refineJobs } from "./collect-jobs.mjs";
import { collectFeeds, translateItems, buildDigest, digestIntro, digestHtml } from "./collect-lib.mjs";

const root = new URL("./", import.meta.url);
const code = fs.readFileSync(new URL("sources.js", root), "utf8");
const context = vm.createContext({ fetch, DOMParser, AbortController, setTimeout, clearTimeout, URL, console });
const { loadAllSources, make, clean, fetchWithTimeout } = vm.runInContext(`${code}\n({ loadAllSources, make, clean, fetchWithTimeout });`, context);

const status = {};
const items = await loadAllSources((id, state, count, error) => {
  if (state !== "loading") status[id] = { status: state, count, error };
});

/* ---------- Conférences (liste ouverte ccf-deadlines + fichier manuel) ---------- */
const CONFERENCES = ["DB/sigmod", "DB/vldb", "DB/icde", "AI/icml", "AI/iclr", "AI/aaai", "AI/ijcai", "AI/aistats", "AI/uai", "AI/colt"];

function startDate(text, year) {
  const match = String(text || "").match(/([A-Za-z]+)\.?\s+(\d{1,2})/);
  const date = match && new Date(`${match[1]} ${match[2]}, ${year} 12:00:00 UTC`);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

async function collectEvents() {
  const now = new Date();
  const found = [];
  for (const path of CONFERENCES) {
    try {
      const text = await (await fetchWithTimeout(`https://raw.githubusercontent.com/ccfddl/ccf-deadlines/main/conference/${path}.yml`, 15000)).text();
      const entry = loadYaml(text)?.[0];
      for (const conf of entry?.confs || []) {
        const start = startDate(conf.date, conf.year);
        if (!start || start < now || !conf.link) continue;
        const deadlines = (conf.timeline || []).map((t) => new Date(`${String(t.deadline).replace(" ", "T")}Z`)).filter((d) => !Number.isNaN(d.getTime()) && d > now).sort((a, b) => a - b);
        found.push(make({
          id: `conf-${conf.id}`, type: "event", typeLabel: "Événement", topic: path.startsWith("DB") ? "data-engineering" : "data-science",
          date: start.toISOString(), source: `Conférence · ${entry.title}`, url: conf.link,
          title: `${entry.title} ${conf.year} : ${entry.description}`,
          summary: `${conf.date}${conf.place ? ` · ${conf.place}` : ""}.`,
          value: `Conférence de référence${entry.rank?.core ? ` (classement CORE ${entry.rank.core})` : ""}.${deadlines[0] ? ` Prochaine date limite de soumission : ${deadlines[0].toISOString().slice(0, 10)}.` : ""}`
        }));
      }
    } catch (error) {
      console.warn(`Conférence ${path} ignorée : ${error.message}`);
    }
  }
  try {
    const manual = JSON.parse(fs.readFileSync(new URL("manual-events.json", root), "utf8"));
    for (const [index, event] of manual.entries()) {
      if (event.type === "challenge" || event.type === "job") continue; /* traité par collect-challenges.mjs */
      found.push(make({
        id: `manual-${index}-${event.date}`, type: "event", typeLabel: "Événement", topic: event.topic || "data-science", language: event.language || "fr",
        date: event.date, source: event.source || "Ajout manuel", url: event.url, title: event.title,
        summary: event.summary || [event.place, event.date].filter(Boolean).join(" · "), value: event.value || "Événement ajouté par l’équipe du projet."
      }));
    }
  } catch { /* fichier absent ou vide */ }
  return found;
}

const events = await collectEvents();
status.events = events.length ? { status: "ok", count: events.length } : { status: "error", count: 0, error: "aucune conférence trouvée" };
items.push(...events);

/* ---------- Challenges, hackathons et compétitions en analyse de données ---------- */
let manualList = [];
try { manualList = JSON.parse(fs.readFileSync(new URL("manual-events.json", root), "utf8")); } catch { /* fichier absent ou vide */ }
const challenges = await collectChallenges({ make, clean, fetchJson: async (url) => (await fetchWithTimeout(url, 20000)).json(), env: process.env, manual: manualList });
challenges.errors.forEach((message) => console.warn(`Challenges ignorés : ${message}`));
status.challenges = challenges.live ? { status: "ok", count: challenges.items.length, error: challenges.errors.join(" | ") || undefined } : { status: "error", count: 0, error: challenges.errors.join(" | ") || "aucun challenge en cours trouvé" };
items.push(...challenges.items);

/* ---------- Emplois à distance (Himalayas, Jobicy) et ajouts manuels ---------- */
const jobs = await collectJobs({ make, clean, fetchJson: async (url) => (await fetchWithTimeout(url, 20000)).json(), manual: manualList });
jobs.errors.forEach((message) => console.warn(`Emplois ignorés : ${message}`));
status.jobs = jobs.items.length ? { status: "ok", count: jobs.items.length, error: jobs.errors.join(" | ") || undefined } : { status: "error", count: 0, error: jobs.errors.join(" | ") || "aucune offre trouvée" };
items.push(...jobs.items);

/* ---------- Sources locales (collector/feeds.json) ---------- */
const feeds = JSON.parse(fs.readFileSync(new URL("feeds.json", root), "utf8"));
const local = await collectFeeds(feeds, { make, clean, fetchText: async (url) => (await fetchWithTimeout(url, 15000)).text() });
local.errors.forEach((message) => console.warn(`Flux ignoré : ${message}`));
status.feeds = local.items.length ? { status: "ok", count: local.items.length, error: local.errors.join(" | ") || undefined } : { status: "error", count: 0, error: local.errors.join(" | ") || "aucun contenu récent" };
items.push(...local.items);
items.sort((a, b) => b.date.localeCompare(a.date));

/* ---------- Traduction en français (clé ANTHROPIC_API_KEY optionnelle) ---------- */
async function loadPrevious() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const site = process.env.SITE_URL || (owner ? `https://${owner.toLowerCase()}.github.io/${repo}` : "");
  try {
    const old = await (await fetchWithTimeout(`${site}/data/items.json`, 15000)).json();
    return new Map(old.items.map((item) => [item.id, item]));
  } catch { return new Map(); }
}
{ const refined = refineJobs(items); items.length = 0; items.push(...refined); } /* profils, lieu, score ; retire les offres sans rapport */
console.log(`Secteurs : ${assignSectors(items)} contenus classés.`);
const key = process.env.ANTHROPIC_API_KEY;
const translation = await translateItems(items, { key, previous: await loadPrevious() });
if (translation.skipped) console.warn("ANTHROPIC_API_KEY absente : contenus laissés dans leur langue d’origine.");

/* ---------- Résumé du jour ---------- */
const digest = buildDigest(items);
digest.intro = await digestIntro(digest, { key });
const siteUrl = process.env.SITE_URL || (process.env.GITHUB_REPOSITORY ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}/` : "");
fs.mkdirSync(new URL("data/", root), { recursive: true });
fs.writeFileSync(new URL("data/digest.html", root), digestHtml(digest, siteUrl));
const payload = JSON.stringify({ generatedAt: new Date().toISOString(), status, translation, digest, items });
fs.writeFileSync(new URL("data/items.json", root), payload);
fs.writeFileSync(new URL("data/items.js", root), `window.__RADAR__ = ${payload};\n`);
console.log(`${items.length} contenus collectés`, Object.fromEntries(Object.entries(status).map(([k, v]) => [k, v.status === "ok" ? v.count : "ÉCHEC"])), translation);
if (items.length < 5) { console.error("Collecte insuffisante : le site n’est pas mis à jour."); process.exit(1); }
