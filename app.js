
let items = [];
const PAGE_SIZE = 12;
const CACHE_KEY = "dr:cache-v7"; /* changer ce numéro vide la mémoire des contenus déjà récupérés */
const CACHE_TTL = 30 * 60 * 1000;
const store = {
  get(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } }
};

const ICONS = {
  heart: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/></svg>',
  heartFill: '<svg class="i fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/></svg>',
  moon: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  sun: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>'
};

const titleOf = (item) => item.titleFr || item.title;
const summaryOf = (item) => item.summaryFr || item.summary;

const typeNames = {
  research: "Publications",
  news: "Articles et actualités",
  software: "Logiciels open source",
  dataset: "Données et outils",
  video: "Vidéos et tutoriels",
  event: "Événements",
  job: "Emplois",
  tender: "Appels d’offres"
};

const languageNames = { fr: "Français", en: "Anglais", de: "Allemand" };
const feedGrid = document.querySelector("#feed-grid");
const emptyState = document.querySelector("#empty-state");
const filters = {
  search: document.querySelector("#search-input"),
  type: document.querySelector("#type-filter"),
  topic: document.querySelector("#topic-filter"),
  language: document.querySelector("#language-filter"),
  sort: document.querySelector("#sort-filter")
};
const state = {
  profileTopic: "all",
  profileLanguage: "all",
  favorites: new Set(),
  favMap: new Map(),
  why: new Map(),
  view: "feed",
  agenda: [],
  visible: PAGE_SIZE,
  digest: null,
  mode: "loading",
  favoritesOnly: false,
  activeDialogItem: null,
  toastTimeout: null
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

function formatDate(dateString) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${dateString}T12:00:00`));
}

/* À date égale, on mélange les sources au lieu de grouper toutes les offres d’un même site. */
const mixOrder = (id) => [...String(id)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

function getVisibleItems() {
  const search = filters.search.value.trim().toLocaleLowerCase("fr");
  const pool = state.favoritesOnly ? [...state.favMap.values()] : items;
  return pool.filter((item) => {
    const matchesProfile = (state.profileTopic === "all" || item.topic === state.profileTopic)
      && (state.profileLanguage === "all" || item.language === state.profileLanguage);
    const searchable = `${item.title} ${item.titleFr || ""} ${item.summary} ${item.summaryFr || ""} ${item.source} ${item.topicLabel}`.toLocaleLowerCase("fr");
    return matchesProfile
      && (!search || searchable.includes(search))
      && (filters.type.value === "all" || item.type === filters.type.value)
      && (filters.topic.value === "all" || item.topic === filters.topic.value)
      && (filters.language.value === "all" || item.language === filters.language.value)
      && (!state.favoritesOnly || state.favorites.has(item.id));
  }).sort((a, b) => {
    const comparison = a.date.localeCompare(b.date);
    if (comparison) return filters.sort.value === "oldest" ? comparison : -comparison;
    return mixOrder(a.id) - mixOrder(b.id);
  });
}

function renderCard(item) {
  const saved = state.favorites.has(item.id);
  return `
    <article class="feed-card">
      <div class="card-top">
        <div class="card-type-wrap">
          <span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(item.typeLabel)}</span>
          <span class="topic-tag">${escapeHtml(item.topicLabel)}</span>
        </div>
        <button class="save-button${saved ? " saved" : ""}" type="button" data-save="${escapeHtml(item.id)}"
          aria-label="${saved ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${saved}">${saved ? ICONS.heartFill : ICONS.heart}</button>
      </div>
      <h3>${escapeHtml(titleOf(item))}</h3>
      <p class="card-summary">${escapeHtml(summaryOf(item))}</p>
      ${state.why.get(item.id) ? `<p class="why">${escapeHtml(state.why.get(item.id))}</p>` : ""}
      <div class="card-footer">
        <span class="source-meta"><strong>${escapeHtml(item.source)}</strong> · ${formatDate(item.date)} · ${languageNames[item.language]}${item.titleFr ? " · traduit" : ""}</span>
        <span class="card-actions">${item.url ? `<a class="card-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}<button class="card-open" type="button" data-open="${escapeHtml(item.id)}">Détails</button></span>
      </div>
    </article>`;
}

function renderFeed() {
  if (state.view === "agenda" || state.view === "trends") return renderPanel();
  if (state.view !== "foryou") state.why.clear();
  const visibleItems = state.view === "foryou" ? getForYou() : getVisibleItems();
  feedGrid.innerHTML = visibleItems.slice(0, state.visible).map(renderCard).join("");
  const more = document.querySelector("#load-more");
  more.hidden = visibleItems.length <= state.visible;
  more.textContent = `Afficher plus (${visibleItems.length - state.visible} restants)`;
  feedGrid.hidden = visibleItems.length === 0;
  emptyState.hidden = visibleItems.length !== 0;
  if (!items.length && state.mode !== "loading") {
    emptyState.querySelector("h3").textContent = "Aucun contenu réel récupéré";
    emptyState.querySelector("p").textContent = "Les sources n’ont pas répondu. Aucun exemple fictif n’est affiché : voir le message en haut de page.";
  } else if (state.view === "foryou" && !state.follow.length && !state.favorites.size) {
    emptyState.querySelector("h3").textContent = "Dites-nous ce qui vous intéresse";
    emptyState.querySelector("p").textContent = "Suivez un sujet ci-dessus ou ajoutez des favoris : le fil se classera à votre mesure.";
  } else {
    emptyState.querySelector("h3").textContent = "Aucun contenu trouvé";
    emptyState.querySelector("p").textContent = "Essayez de modifier votre recherche ou vos filtres.";
  }
  document.querySelector("#feed-count").textContent = `${visibleItems.length} contenu${visibleItems.length === 1 ? "" : "s"}`;
  document.querySelector("#favorite-count").textContent = String(state.favorites.size);
  document.querySelector("#metric-items").textContent = String(items.length);
  document.querySelector("#metric-items-note").textContent = "contenus réels";
  document.querySelector("#metric-types").textContent = String(new Set(items.map((item) => item.type)).size);
  document.querySelector("#results-caption").textContent = state.view === "foryou" ? "Classé selon vos sujets suivis et vos favoris." : state.favoritesOnly
    ? "Vos contenus enregistrés."
    : state.mode === "live" ? "Contenus réels récupérés depuis les sources, filtrés selon vos préférences." : "Aucun contenu à afficher pour le moment.";
}

function refresh() { state.visible = PAGE_SIZE; renderFeed(); }

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(state.toastTimeout);
  state.toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function persistFavorites() { store.set("dr:favorites", [...state.favMap.values()]); }

function toggleFavorite(id) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    state.favMap.delete(id);
    showToast("Contenu retiré de vos favoris.");
  } else {
    const item = items.find((entry) => entry.id === id) || state.favMap.get(id);
    if (!item) return;
    state.favorites.add(id);
    state.favMap.set(id, item);
    showToast("Contenu ajouté à vos favoris.");
  }
  persistFavorites();
  renderFeed();
  if (state.activeDialogItem === id) updateDialogSaveButton();
}

function openDetails(id) {
  const item = items.find((entry) => entry.id === id) || state.favMap.get(id);
  if (!item) return;
  state.activeDialogItem = id;
  document.querySelector("#detail-type").className = `type-badge type-${item.type}`;
  document.querySelector("#detail-type").textContent = item.typeLabel;
  document.querySelector("#detail-language").textContent = `${item.topicLabel} · ${languageNames[item.language]} · ${formatDate(item.date)}`;
  document.querySelector("#detail-title").textContent = titleOf(item);
  document.querySelector("#detail-summary").textContent = summaryOf(item);
  document.querySelector("#detail-value").textContent = item.value;
  document.querySelector("#detail-source").textContent = item.source;
  document.querySelector("#detail-disclaimer").textContent = item.titleFr
      ? `Traduit automatiquement. Titre original : ${item.title}. Seule la page originale fait foi.`
      : "Résumé fourni par la source. Seule la page originale fait foi.";
  const link = document.querySelector("#detail-link");
  link.hidden = !item.url;
  if (item.url) link.href = item.url;
  updateDialogSaveButton();
  document.querySelector("#detail-dialog").showModal();
}

function updateDialogSaveButton() {
  const saved = state.favorites.has(state.activeDialogItem);
  document.querySelector("#dialog-save").textContent = saved ? "Retirer des favoris" : "Ajouter aux favoris";
}

document.querySelector("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.profileTopic = document.querySelector("#profile-topic").value;
  state.profileLanguage = document.querySelector("#profile-language").value;
  refresh();
  showToast("Vos préférences ont été appliquées.");
});

Object.values(filters).forEach((control) => {
  control.addEventListener(control === filters.search ? "input" : "change", refresh);
});

document.querySelector("#favorites-toggle").addEventListener("click", (event) => {
  state.favoritesOnly = !state.favoritesOnly;
  event.currentTarget.setAttribute("aria-pressed", String(state.favoritesOnly));
  event.currentTarget.innerHTML = `<span aria-hidden="true">${state.favoritesOnly ? ICONS.heartFill : ICONS.heart}</span> Mes favoris <span id="favorite-count" class="count-badge">${state.favorites.size}</span>`;
  refresh();
});

feedGrid.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save]");
  const openButton = event.target.closest("[data-open]");
  if (saveButton) toggleFavorite(saveButton.dataset.save);
  if (openButton) openDetails(openButton.dataset.open);
});

document.querySelector("#dialog-save").addEventListener("click", () => {
  if (state.activeDialogItem) toggleFavorite(state.activeDialogItem);
});

document.querySelector("#close-dialog").addEventListener("click", () => {
  document.querySelector("#detail-dialog").close();
});

document.querySelector("#detail-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector("#clear-filters").addEventListener("click", () => {
  filters.search.value = "";
  filters.type.value = "all";
  filters.topic.value = "all";
  filters.language.value = "all";
  filters.sort.value = "newest";
  state.profileTopic = "all";
  state.profileLanguage = "all";
  state.favoritesOnly = false;
  document.querySelector("#profile-topic").value = "all";
  document.querySelector("#profile-language").value = "all";
  const favoritesToggle = document.querySelector("#favorites-toggle");
  favoritesToggle.setAttribute("aria-pressed", "false");
  favoritesToggle.innerHTML = `<span aria-hidden="true">${ICONS.heart}</span> Mes favoris <span id="favorite-count" class="count-badge">${state.favorites.size}</span>`;
  refresh();
});

function openDigest() {
  const body = document.querySelector("#digest-body");
  const digest = state.digest;
  if (!digest || !digest.sections?.length) {
    body.innerHTML = "<p>Le résumé du jour est préparé par la collecte automatique. Il sera disponible dès la première publication du site.</p>";
  } else {
    const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${digest.date}T12:00:00`));
    body.innerHTML = `<div class="dialog-language">${escapeHtml(date)}</div>
      ${digest.intro ? `<p class="dialog-summary">${escapeHtml(digest.intro)}</p>` : ""}
      ${digest.sections.map((section) => `<h3 class="digest-heading">${escapeHtml(section.label)}</h3><ul class="digest-list">${section.items.map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.title)}</a><small>${escapeHtml(entry.source)}</small></li>`).join("")}</ul>`).join("")}`;
  }
  document.querySelector("#digest-dialog").showModal();
}
document.querySelector("#digest-button").addEventListener("click", openDigest);
document.querySelector("#close-digest").addEventListener("click", () => document.querySelector("#digest-dialog").close());
document.querySelector("#digest-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector("#load-more").addEventListener("click", () => {
  state.visible += PAGE_SIZE;
  renderFeed();
});

/* ---------- Thème ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-button").innerHTML = theme === "dark" ? ICONS.sun : ICONS.moon;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#111815" : "#f5f7f4");
}
applyTheme(store.get("dr:theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
document.querySelector("#theme-button").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  store.set("dr:theme", next);
  applyTheme(next);
});

/* ---------- Sources réelles ---------- */
const sourceStatus = {};
const SOURCE_NAMES = Object.fromEntries([...LIVE_SOURCES.map((source) => [source.id, source.name]), ["events", "Conférences"], ["feeds", "Sources locales"]]);
function renderSourceStatus() {
  const entries = Object.entries(sourceStatus).map(([id, info]) => ({ source: { name: SOURCE_NAMES[id] || id }, ...info }));
  document.querySelector("#source-chips").innerHTML = entries.map(({ source, status, count, error }) => {
    const label = status === "ok" ? `${count}` : status === "error" ? "indisponible" : "…";
    return `<span class="source-chip chip-${status || "loading"}" title="${escapeHtml(error || "")}">${escapeHtml(source.name)} · ${label}</span>`;
  }).join("");
  const okCount = entries.filter((entry) => entry.status === "ok").length;
  document.querySelector("#metric-sources").textContent = String(okCount);
  document.querySelector("#metric-sources-note").textContent = `sur ${entries.length || LIVE_SOURCES.length} sources`;
  document.querySelector("#sidebar-status").textContent = okCount ? `${okCount} source${okCount > 1 ? "s" : ""} connectée${okCount > 1 ? "s" : ""}` : "Aucune source connectée";
  document.querySelector("#sidebar-dot").className = `status-dot${okCount ? " dot-ok" : ""}`;
}

function setMode(mode, message) {
  state.mode = mode;
  document.querySelector("#mode-text").textContent = mode === "live" ? "EN DIRECT" : mode === "empty" ? "SANS DONNÉES" : "CHARGEMENT";
  document.querySelector("#mode-pill").className = `demo-pill mode-${mode}`;
  document.querySelector("#source-message").textContent = message;
}

async function loadCollected() {
  let data = window.__RADAR__;
  if (!data?.items?.length) {
    try {
      const response = await fetch(`data/items.json?t=${Math.floor(Date.now() / 600000)}`, { cache: "no-cache" });
      if (response.ok) data = await response.json();
    } catch { /* ouvert depuis un fichier : pas de serveur */ }
  }
  if (!data?.items?.length) return false;
  items = data.items;
  state.digest = data.digest || null;
  Object.keys(sourceStatus).forEach((key) => delete sourceStatus[key]);
  Object.assign(sourceStatus, data.status || {});
  renderSourceStatus();
  const when = new Date(data.generatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const translated = items.filter((item) => item.titleFr).length;
  setMode("live", `Collecte du ${when}, renouvelée toutes les 6 heures.${translated ? ` ${translated} contenu${translated > 1 ? "s" : ""} traduit${translated > 1 ? "s" : ""} en français.` : ""}`);
  refresh();
  return true;
}

async function loadLive(force = false) {
  const hasCollected = await loadCollected();
  if (hasCollected && location.protocol !== "file:") return;
  /* Pas de site publié (ouverture directe du fichier) : collecte depuis le navigateur, ajoutée à l’existant. */
  const button = document.querySelector("#refresh-button");
  button.disabled = true;
  if (!hasCollected) {
    setMode("loading", "Récupération des contenus depuis les sources…");
    feedGrid.hidden = false;
    feedGrid.innerHTML = Array.from({ length: 6 }, () => '<article class="feed-card skeleton"><i></i><i></i><i></i></article>').join("");
  }
  const record = (id, status, count, error) => {
    if (status !== "ok" && sourceStatus[id]?.status === "ok") return;
    sourceStatus[id] = { status, count, error };
    renderSourceStatus();
  };
  let loaded;
  const cached = store.get(CACHE_KEY, null);
  if (!force && cached && Date.now() - cached.time < CACHE_TTL && cached.items.length) {
    loaded = cached.items;
    Object.entries(cached.status).forEach(([id, info]) => record(id, info.status, info.count, info.error));
  } else {
    const live = {};
    loaded = await loadAllSources((id, status, count, error) => { record(id, status, count, error); live[id] = { status, count, error }; });
    if (loaded.length) store.set(CACHE_KEY, { time: Date.now(), items: loaded, status: live });
  }
  button.disabled = false;
  const seen = new Set(items.map((item) => item.url));
  items = [...items, ...loaded.filter((item) => !seen.has(item.url))].sort((a, b) => b.date.localeCompare(a.date));
  if (items.length) {
    setMode("live", hasCollected
      ? "Contenus réels : dernière collecte, complétée directement depuis votre navigateur."
      : "Contenus réels récupérés directement depuis les sources par votre navigateur.");
  } else {
    setMode("empty", "Aucune source n’a répondu (connexion, bloqueur de publicités ou accès refusé). Aucun exemple fictif n’est affiché. Publiez le site sur GitHub Pages pour une collecte automatique fiable.");
  }
  refresh();
}

document.querySelector("#refresh-button").addEventListener("click", () => loadLive(true));

/* ---------- Vues : Pour vous, Agenda, Tendances ---------- */
const STOP = new Set("data still just best guide tool tools senior junior engineer developer analyst consultant architect manager first make made show avec dans pour sans cette plus tout tous leur leurs very your that this from with have what when will about into over like more using used based use new les des une aux sur par est the and for are how why can not you our its their been than also was were comme entre vers chez dont donc mais ainsi cela celle ceux nous vous ils elles".split(" "));
const fold = (text) => String(text).toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const wordsOf = (text) => [...new Set(fold(text).split(/[^a-z0-9+#]+/).filter((word) => word.length >= 4 && !STOP.has(word)))];

state.follow = store.get("dr:follow", []);

function renderFollow() {
  document.querySelector("#follow-chips").innerHTML = state.follow
    .map((term, index) => `<button type="button" class="follow-chip" data-unfollow="${index}" aria-label="Ne plus suivre ${escapeHtml(term)}">${escapeHtml(term)} ×</button>`).join("");
}

function addFollow(value) {
  const term = String(value).trim().toLocaleLowerCase("fr").slice(0, 30);
  if (!term || state.follow.some((known) => fold(known) === fold(term))) return false;
  if (state.follow.length >= 20) { showToast("20 sujets suivis au maximum."); return false; }
  state.follow.push(term);
  store.set("dr:follow", state.follow);
  renderFollow();
  return true;
}

function getForYou() {
  const follow = state.follow.map(fold);
  const favs = [...state.favMap.values()];
  const freq = new Map();
  favs.forEach((fav) => wordsOf(`${titleOf(fav)} ${fav.summary}`).forEach((word) => freq.set(word, (freq.get(word) || 0) + 1)));
  const affinity = new Set(favs.length >= 2 ? [...freq].filter(([, count]) => count >= 2).map(([word]) => word) : []);
  const topicCount = {};
  favs.forEach((fav) => { topicCount[fav.topic] = (topicCount[fav.topic] || 0) + 1; });
  state.why.clear();
  return getVisibleItems().map((item) => {
    const haystack = fold(`${titleOf(item)} ${item.title} ${summaryOf(item)}`);
    const hits = state.follow.filter((term, index) => follow[index] && haystack.includes(follow[index]));
    const near = wordsOf(`${item.title} ${item.summary}`).filter((word) => affinity.has(word)).slice(0, 3);
    const share = favs.length ? (topicCount[item.topic] || 0) / favs.length : 0;
    const score = hits.length * 3 + near.length + share * 2;
    const reasons = [];
    if (hits.length) reasons.push(`Vous suivez : ${hits.join(", ")}`);
    if (near.length) reasons.push(`Proche de vos favoris : ${near.join(", ")}`);
    else if (share > 0 && !hits.length) reasons.push("Domaine que vous enregistrez souvent");
    if (score > 0) state.why.set(item.id, reasons.join(" · "));
    return { item, score };
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date)).map((entry) => entry.item);
}

/* Agenda : dates limites et événements à venir, avec export .ics */
function agendaEntries() {
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const item of items) {
    if (item.type !== "event") continue;
    const deadline = item.deadline || /date limite[^0-9]*(\d{4}-\d{2}-\d{2})/i.exec(item.value || "")?.[1];
    if (deadline && deadline >= today) out.push({ kind: "Date limite de soumission", date: deadline, item });
    if (item.date >= today) out.push({ kind: "Début de l’événement", date: item.date, item });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
}

function icsFor(entries) {
  const escape = (text) => String(text).replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Data Radar//FR", "CALSCALE:GREGORIAN"];
  for (const entry of entries) {
    const end = new Date(`${entry.date}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const label = entry.kind.startsWith("Date limite") ? `Date limite : ${titleOf(entry.item)}` : titleOf(entry.item);
    lines.push("BEGIN:VEVENT", `UID:${entry.item.id}-${entry.date}@dataradar`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${entry.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}`,
      `SUMMARY:${escape(label)}`, `URL:${entry.item.url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(entries, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([icsFor(entries)], { type: "text/calendar" }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function countdown(date) {
  const days = Math.round((new Date(`${date}T12:00:00`) - Date.now()) / 864e5);
  return { days, text: days <= 0 ? "aujourd’hui" : days === 1 ? "demain" : `dans ${days} j` };
}

/* Tendances : 7 derniers jours contre les 7 précédents, d'après les dates des contenus collectés */
const TREND_AXES = [["research", "Publications"], ["news", "Actualités"], ["software", "Logiciels"], ["dataset", "Données"], ["video", "Vidéos"], ["job", "Emplois"], ["tender", "Marchés"]];

function computeTrends() {
  const now = Date.now();
  const cur = new Map(), prev = new Map(), label = new Map(), typeCur = {}, typePrev = {};
  let inWindow = 0;
  for (const item of items) {
    const age = (now - new Date(`${item.date}T12:00:00`).getTime()) / 864e5;
    if (age < 0 || age > 14) continue;
    inWindow++;
    const isCurrent = age <= 7;
    const bucket = isCurrent ? typeCur : typePrev;
    bucket[item.type] = (bucket[item.type] || 0) + 1;
    if (item.type === "job" || item.type === "tender") continue; /* les titres d’offres (senior, engineer…) faussent les sujets */
    const target = isCurrent ? cur : prev;
    const seen = new Set();
    for (const raw of String(titleOf(item)).toLocaleLowerCase("fr").split(/[^\p{L}\p{N}+#]+/u)) {
      const key = fold(raw);
      if (raw.length < 4 || STOP.has(key) || seen.has(key) || /^\d+$/.test(key)) continue;
      seen.add(key);
      target.set(key, (target.get(key) || 0) + 1);
      if (!label.has(key)) label.set(key, raw);
    }
  }
  const terms = [...cur].filter(([, count]) => count >= 2)
    .map(([key, count]) => ({ term: label.get(key), count, before: prev.get(key) || 0 }))
    .sort((a, b) => (b.count - b.before) - (a.count - a.before) || b.count - a.count).slice(0, 8);
  return { inWindow, terms, now: TREND_AXES.map(([type]) => typeCur[type] || 0), before: TREND_AXES.map(([type]) => typePrev[type] || 0) };
}

function radarSvg(current, previous) {
  const max = Math.max(1, ...current, ...previous), cx = 160, cy = 150, radius = 95, count = TREND_AXES.length;
  const angle = (index) => -Math.PI / 2 + index * 2 * Math.PI / count;
  const point = (index, value) => [cx + Math.cos(angle(index)) * radius * value / max, cy + Math.sin(angle(index)) * radius * value / max];
  const polygon = (values) => values.map((value, index) => point(index, value).map((n) => n.toFixed(1)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon class="rg" points="${polygon(current.map(() => max * k))}"/>`).join("");
  const spokes = TREND_AXES.map((_, index) => { const [x, y] = point(index, max); return `<line class="rg" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("");
  const labels = TREND_AXES.map(([, name], index) => {
    const x = cx + Math.cos(angle(index)) * (radius + 16), y = cy + Math.sin(angle(index)) * (radius + 16), cos = Math.cos(angle(index));
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end"}" dominant-baseline="middle">${name} ${current[index]}</text>`;
  }).join("");
  return `<svg class="radar" viewBox="0 0 320 300" role="img" aria-label="Radar des formats : 7 derniers jours comparés aux 7 jours précédents">${rings}${spokes}<polygon class="rp" points="${polygon(previous)}"/><polygon class="rc" points="${polygon(current)}"/>${labels}</svg>`;
}

function renderPanel() {
  const panel = document.querySelector("#view-panel");
  const caption = document.querySelector("#results-caption");
  if (state.view === "agenda") {
    caption.textContent = "Dates limites et événements à venir, avec export vers votre calendrier.";
    state.agenda = agendaEntries();
    panel.innerHTML = state.agenda.length
      ? `<div class="panel-actions"><button class="button button-outline" type="button" data-ics-all>Tout ajouter au calendrier (.ics)</button></div>
        <ul class="agenda-list">${state.agenda.map((entry, index) => {
          const when = new Date(`${entry.date}T12:00:00`), left = countdown(entry.date);
          return `<li class="agenda-row"><div class="agenda-date"><strong>${when.getDate()}</strong><span>${escapeHtml(when.toLocaleDateString("fr-FR", { month: "short" }))}</span></div>
            <div class="agenda-main"><span class="agenda-kind">${escapeHtml(entry.kind)}</span><a href="${escapeHtml(entry.item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(titleOf(entry.item))}</a><small>${escapeHtml(entry.item.source)} · ${when.getFullYear()}</small></div>
            <span class="count-pill${left.days <= 14 ? " urgent" : ""}">${left.text}</span>
            <button class="button button-outline" type="button" data-ics="${index}">Ajouter</button></li>`;
        }).join("")}</ul>`
      : '<div class="trend-card"><h3>Aucune échéance à venir</h3><p>Les événements et dates limites collectés apparaîtront ici.</p></div>';
  } else {
    caption.textContent = "Ce qui monte cette semaine dans les contenus collectés.";
    const trends = computeTrends();
    panel.innerHTML = trends.inWindow < 8
      ? '<div class="trend-card"><h3>Pas encore assez de données</h3><p>Il faut quelques contenus datés des 14 derniers jours pour dégager des tendances. Elles apparaîtront après les prochaines collectes.</p></div>'
      : `<div class="trends-grid"><div class="trend-card"><h3>Radar des formats</h3>${radarSvg(trends.now, trends.before)}
          <p class="trend-legend"><span class="key-now"></span> 7 derniers jours <span class="key-prev"></span> 7 jours précédents</p></div>
        <div class="trend-card"><h3>Sujets en hausse</h3>${trends.terms.length ? `<ul class="trend-list">${trends.terms.map((entry) => `<li><button type="button" class="trend-term" data-term="${escapeHtml(entry.term)}">${escapeHtml(entry.term)}</button>
          <span class="trend-count">${entry.count} cette semaine ${entry.before ? `(avant : ${entry.before})` : "(nouveau)"}</span>
          <button type="button" class="button button-outline" data-follow-term="${escapeHtml(entry.term)}">Suivre</button></li>`).join("")}</ul>` : "<p>Aucun sujet ne ressort encore.</p>"}</div></div>`;
  }
}

function setView(view) {
  state.view = view;
  state.visible = PAGE_SIZE;
  document.querySelectorAll(".view-tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const isPanel = view === "agenda" || view === "trends";
  document.querySelector("#filters-form").hidden = isPanel;
  document.querySelector("#feed-meta").hidden = isPanel;
  document.querySelector("#follow-bar").hidden = view !== "foryou";
  document.querySelector("#view-panel").hidden = !isPanel;
  if (isPanel) { feedGrid.hidden = true; emptyState.hidden = true; document.querySelector("#load-more").hidden = true; }
  renderFeed();
}

document.querySelectorAll(".view-tab").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
document.querySelector("#follow-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#follow-input");
  if (addFollow(input.value)) renderFeed();
  input.value = "";
});
document.querySelector("#follow-chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-unfollow]");
  if (!chip) return;
  state.follow.splice(Number(chip.dataset.unfollow), 1);
  store.set("dr:follow", state.follow);
  renderFollow();
  renderFeed();
});
document.querySelector("#view-panel").addEventListener("click", (event) => {
  const one = event.target.closest("[data-ics]"), all = event.target.closest("[data-ics-all]");
  const follow = event.target.closest("[data-follow-term]"), term = event.target.closest("[data-term]");
  if (one) downloadICS([state.agenda[Number(one.dataset.ics)]], "data-radar-echeance.ics");
  if (all) downloadICS(state.agenda, "data-radar-agenda.ics");
  if (follow && addFollow(follow.dataset.followTerm)) showToast(`Sujet suivi : ${follow.dataset.followTerm}. Retrouvez-le dans « Pour vous ».`);
  if (term) { filters.search.value = term.dataset.term; setView("feed"); }
});
renderFollow();

/* ---------- Démarrage ---------- */
store.get("dr:favorites", []).forEach((item) => {
  if (item && item.id) { state.favorites.add(item.id); state.favMap.set(item.id, item); }
});
renderSourceStatus();
renderFeed();
loadLive();
