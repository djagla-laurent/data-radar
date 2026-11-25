const demoItems = [
  {
    id: "research-01",
    type: "research",
    typeLabel: "Publication",
    topic: "statistics",
    topicLabel: "Statistiques",
    language: "fr",
    date: "2026-11-23",
    source: "Revue de démonstration",
    title: "Mieux mesurer l’incertitude dans les enquêtes à petits échantillons",
    summary: "Un exemple fictif de résumé de publication sur les méthodes d’estimation et la qualité des données d’enquête.",
    value: "Aider les analystes à repérer les limites d’une estimation avant de communiquer un résultat."
  },
  {
    id: "news-01",
    type: "news",
    typeLabel: "Article et actualité",
    topic: "data-science",
    topicLabel: "Science des données",
    language: "en",
    date: "2026-11-22",
    source: "Blog de démonstration",
    title: "A practical guide to evaluating machine learning datasets",
    summary: "A fictional editorial brief about dataset coverage, documentation, and responsible model evaluation.",
    value: "Donner aux équipes une grille simple pour examiner les données avant de lancer un modèle."
  },
  {
    id: "software-01",
    type: "software",
    typeLabel: "Logiciel open source",
    topic: "data-engineering",
    topicLabel: "Ingénierie des données",
    language: "en",
    date: "2026-11-20",
    source: "Projet logiciel fictif",
    title: "Une nouvelle version d’un outil de validation de pipelines",
    summary: "Exemple fictif de mise à jour logicielle avec contrôles de schéma et rapports d’erreurs améliorés.",
    value: "Suivre les évolutions d’outils utiles pour fiabiliser les traitements de données."
  },
  {
    id: "dataset-01",
    type: "dataset",
    typeLabel: "Données et outils",
    topic: "statistics",
    topicLabel: "Statistiques",
    language: "fr",
    date: "2026-11-18",
    source: "Catalogue de démonstration",
    title: "Un jeu de données fictif pour pratiquer les séries temporelles",
    summary: "Exemple inventé de données mensuelles avec documentation, dictionnaire de variables et notes de qualité.",
    value: "Permettre aux étudiants et praticiens d’essayer des méthodes statistiques sur un jeu documenté."
  },
  {
    id: "video-01",
    type: "video",
    typeLabel: "Vidéo et tutoriel",
    topic: "data-science",
    topicLabel: "Science des données",
    language: "fr",
    date: "2026-11-16",
    source: "Chaîne vidéo fictive",
    title: "Tutoriel : préparer un jeu de données avec Python, étape par étape",
    summary: "Exemple fictif de tutoriel sur le nettoyage, les valeurs manquantes et la préparation d’un jeu d’analyse.",
    value: "Découvrir rapidement une méthode pratique et reproductible sans devoir parcourir de longues ressources."
  },
  {
    id: "event-01",
    type: "event",
    typeLabel: "Événement",
    topic: "it",
    topicLabel: "Informatique",
    language: "fr",
    date: "2026-11-14",
    source: "Organisateur de démonstration",
    title: "Rencontre fictive autour des données ouvertes et de l’IA",
    summary: "Exemple d’événement en ligne réunissant des professionnels, chercheurs et étudiants francophones.",
    value: "Repérer des occasions d’apprendre, de présenter un projet ou de rencontrer la communauté."
  },
  {
    id: "job-01",
    type: "job",
    typeLabel: "Emploi",
    topic: "data-science",
    topicLabel: "Science des données",
    language: "en",
    date: "2026-11-12",
    source: "Employeur fictif",
    title: "Junior data analyst, remote",
    summary: "Exemple fictif d’offre destinée à une personne qui débute en analyse, visualisation et communication des données.",
    value: "Faire remonter des opportunités professionnelles ciblées plutôt que des offres informatiques généralistes."
  },
  {
    id: "tender-01",
    type: "tender",
    typeLabel: "Appel d’offres",
    topic: "it",
    topicLabel: "Informatique",
    language: "fr",
    date: "2026-11-10",
    source: "Administration fictive",
    title: "Exemple fictif : fourniture d’outils de traitement statistique",
    summary: "Modèle de notice d’achat portant sur des logiciels de données. Il ne s’agit pas d’une opportunité réelle.",
    value: "Conserver les appels d’offres liés aux données et au numérique sans noyer le fil dans les marchés sans rapport."
  }
];

demoItems.forEach((item) => { item.demo = true; });
let items = demoItems;
const PAGE_SIZE = 12;
const CACHE_KEY = "dr:cache2";
const CACHE_TTL = 30 * 60 * 1000;
const store = {
  get(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } }
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

const languageNames = { fr: "Français", en: "Anglais" };
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
    return filters.sort.value === "oldest" ? comparison : -comparison;
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
          aria-label="${saved ? "Retirer des" : "Ajouter aux"} favoris" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
      </div>
      <h3>${escapeHtml(titleOf(item))}</h3>
      <p class="card-summary">${escapeHtml(summaryOf(item))}</p>
      <div class="card-footer">
        <span class="source-meta"><strong>${escapeHtml(item.source)}</strong> · ${formatDate(item.date)} · ${languageNames[item.language]}${item.titleFr ? " · traduit" : ""}</span>
        <span class="card-actions">${item.url ? `<a class="card-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}<button class="card-open" type="button" data-open="${escapeHtml(item.id)}">Détails</button></span>
      </div>
    </article>`;
}

function renderFeed() {
  const visibleItems = getVisibleItems();
  feedGrid.innerHTML = visibleItems.slice(0, state.visible).map(renderCard).join("");
  const more = document.querySelector("#load-more");
  more.hidden = visibleItems.length <= state.visible;
  more.textContent = `Afficher plus (${visibleItems.length - state.visible} restants)`;
  feedGrid.hidden = visibleItems.length === 0;
  emptyState.hidden = visibleItems.length !== 0;
  document.querySelector("#feed-count").textContent = `${visibleItems.length} contenu${visibleItems.length === 1 ? "" : "s"}`;
  document.querySelector("#favorite-count").textContent = String(state.favorites.size);
  document.querySelector("#metric-items").textContent = String(items.length);
  document.querySelector("#metric-items-note").textContent = state.mode === "live" ? "contenus réels" : "exemples fictifs";
  document.querySelector("#metric-types").textContent = String(new Set(items.map((item) => item.type)).size);
  document.querySelector("#results-caption").textContent = state.favoritesOnly
    ? "Vos contenus enregistrés."
    : state.mode === "live" ? "Contenus réels récupérés depuis les sources, filtrés selon vos préférences." : "Exemples fictifs filtrés selon vos préférences.";
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
  document.querySelector("#detail-disclaimer").textContent = item.demo
    ? "Exemple fictif, sans lien vers une publication réelle."
    : item.titleFr
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
  event.currentTarget.innerHTML = `<span aria-hidden="true">${state.favoritesOnly ? "♥" : "♡"}</span> Mes favoris <span id="favorite-count" class="count-badge">${state.favorites.size}</span>`;
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
  favoritesToggle.innerHTML = `<span aria-hidden="true">♡</span> Mes favoris <span id="favorite-count" class="count-badge">${state.favorites.size}</span>`;
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
  document.querySelector("#theme-button").textContent = theme === "dark" ? "☀" : "☾";
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
  document.querySelector("#mode-text").textContent = mode === "live" ? "EN DIRECT" : mode === "demo" ? "DÉMO" : "CHARGEMENT";
  document.querySelector("#mode-pill").className = `demo-pill mode-${mode}`;
  document.querySelector("#source-message").textContent = message;
}

async function loadCollected() {
  try {
    const response = await fetch(`data/items.json?t=${Math.floor(Date.now() / 600000)}`, { cache: "no-cache" });
    if (!response.ok) return false;
    const data = await response.json();
    if (!data.items?.length) return false;
    items = data.items;
    state.digest = data.digest || null;
    Object.keys(sourceStatus).forEach((key) => delete sourceStatus[key]);
    Object.assign(sourceStatus, data.status);
    renderSourceStatus();
    const when = new Date(data.generatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
    const translated = items.filter((item) => item.titleFr).length;
    setMode("live", `Collecte automatique du ${when}, renouvelée toutes les 6 heures.${translated ? ` ${translated} contenu${translated > 1 ? "s" : ""} traduit${translated > 1 ? "s" : ""} en français.` : ""}`);
    refresh();
    return true;
  } catch { return false; }
}

async function loadLive(force = false) {
  if (await loadCollected()) return;
  const cached = store.get(CACHE_KEY, null);
  if (!force && cached && Date.now() - cached.time < CACHE_TTL && cached.items.length) {
    items = cached.items;
    LIVE_SOURCES.forEach((source) => { sourceStatus[source.id] = cached.status[source.id]; });
    renderSourceStatus();
    setMode("live", `Contenus réels, mis à jour à ${new Date(cached.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Cliquez sur Actualiser pour recharger.`);
    return refresh();
  }
  const button = document.querySelector("#refresh-button");
  button.disabled = true;
  setMode("loading", "Récupération des contenus depuis les sources…");
  feedGrid.hidden = false;
  feedGrid.innerHTML = Array.from({ length: 6 }, () => '<article class="feed-card skeleton"><i></i><i></i><i></i></article>').join("");
  const loaded = await loadAllSources((id, status, count, error) => {
    sourceStatus[id] = { status, count, error };
    renderSourceStatus();
  });
  button.disabled = false;
  if (loaded.length) {
    items = loaded;
    store.set(CACHE_KEY, { time: Date.now(), items, status: sourceStatus });
    setMode("live", "Contenus réels récupérés directement depuis les sources. Une partie des contenus est en anglais ; les conférences et événements ne sont pas encore couverts.");
  } else {
    items = demoItems;
    setMode("demo", "Aucune source n’a répondu (hors ligne ou accès bloqué). Les exemples fictifs sont affichés à la place.");
  }
  refresh();
}

document.querySelector("#refresh-button").addEventListener("click", () => loadLive(true));

/* ---------- Démarrage ---------- */
store.get("dr:favorites", []).forEach((item) => {
  if (item && item.id) { state.favorites.add(item.id); state.favMap.set(item.id, item); }
});
renderSourceStatus();
renderFeed();
loadLive();
