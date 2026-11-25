/* Connecteurs de sources réelles. Toutes les APIs ci-dessous sont publiques,
   sans clé, et appelables depuis le navigateur (CORS). Chaque fiche garde un
   lien vers la source originale ; seuls titre, métadonnées et courte description
   fournie par la source sont affichés. */

const TOPIC_LABELS = {
  statistics: "Statistiques",
  "data-science": "Science des données",
  "data-engineering": "Ingénierie des données",
  it: "Informatique"
};

async function fetchWithTimeout(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json, application/atom+xml" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

const clean = (text, max = 240) => {
  const value = String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

function make(base) {
  return { language: "en", topicLabel: TOPIC_LABELS[base.topic], live: true, ...base, date: String(base.date).slice(0, 10) };
}

async function fromHackerNews() {
  const queries = [["statistics", "statistics"], ["machine learning", "data-science"], ["data engineering", "data-engineering"], ["programming", "it"]];
  const results = await Promise.all(queries.map(async ([query, topic]) => {
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(query)}&numericFilters=points%3E10&hitsPerPage=6`;
    const data = await (await fetchWithTimeout(url)).json();
    return data.hits.filter((hit) => hit.title).map((hit) => make({
      id: `hn-${hit.objectID}`, type: "news", typeLabel: "Article et actualité", topic,
      date: hit.created_at, source: "Hacker News",
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      title: hit.title,
      summary: `Discussion populaire de la communauté technique : ${hit.points} points et ${hit.num_comments || 0} commentaires.`,
      value: "Un signal de ce qui intéresse les praticiens en ce moment. Ouvrez la source pour lire l’article complet."
    }));
  }));
  return results.flat();
}

async function fromDevTo() {
  const tags = [["statistics", "statistics"], ["datascience", "data-science"], ["dataengineering", "data-engineering"], ["programming", "it"]];
  const results = await Promise.all(tags.map(async ([tag, topic]) => {
    const data = await (await fetchWithTimeout(`https://dev.to/api/articles?tag=${tag}&per_page=6&top=7`)).json();
    return data.map((article) => make({
      id: `devto-${article.id}`, type: "news", typeLabel: "Article et actualité", topic,
      date: article.published_at, source: `DEV · ${article.user?.name || "auteur"}`,
      url: article.url, title: article.title,
      summary: clean(article.description) || "Article publié sur DEV.",
      value: `Article populaire cette semaine sur DEV (${article.public_reactions_count || 0} réactions).`
    }));
  }));
  return results.flat();
}

async function fromGitHub() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const topics = [["statistics", "statistics"], ["data-science", "data-science"], ["data-engineering", "data-engineering"]];
  const results = await Promise.all(topics.map(async ([topic, area]) => {
    const url = `https://api.github.com/search/repositories?q=topic:${topic}+pushed:%3E${since}&sort=stars&order=desc&per_page=6`;
    const data = await (await fetchWithTimeout(url)).json();
    return data.items.map((repo) => make({
      id: `gh-${repo.id}`, type: "software", typeLabel: "Logiciel open source", topic: area,
      date: repo.pushed_at, source: `GitHub · ${repo.owner.login}`,
      url: repo.html_url, title: repo.full_name,
      summary: clean(repo.description) || "Projet open source sans description.",
      value: `Projet actif ce mois-ci, ${repo.stargazers_count.toLocaleString("fr-FR")} étoiles${repo.language ? `, écrit en ${repo.language}` : ""}.`
    }));
  }));
  return results.flat();
}

async function fromArxiv() {
  const query = encodeURIComponent("cat:stat.ME OR cat:cs.LG OR cat:cs.DB");
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=18`;
  const xml = new DOMParser().parseFromString(await (await fetchWithTimeout(url, 12000)).text(), "application/xml");
  const byCategory = (category) => category.startsWith("stat") ? "statistics" : category === "cs.DB" ? "data-engineering" : "data-science";
  return [...xml.getElementsByTagName("entry")].map((entry) => {
    const text = (tag) => entry.getElementsByTagName(tag)[0]?.textContent || "";
    const category = entry.getElementsByTagNameNS("*", "primary_category")[0]?.getAttribute("term") || "cs.LG";
    const link = text("id").trim();
    const authors = [...entry.getElementsByTagName("author")].map((a) => a.textContent.trim());
    return make({
      id: `arxiv-${link.split("/abs/")[1] || link}`, type: "research", typeLabel: "Publication", topic: byCategory(category),
      date: text("published"), source: `arXiv · ${category}`, url: link, title: clean(text("title"), 200),
      summary: clean(text("summary"), 260),
      value: `Prépublication récente (non relue par des pairs)${authors.length ? `, de ${authors[0]}${authors.length > 1 ? " et al." : ""}` : ""}.`
    });
  });
}

async function fromHuggingFace() {
  const data = await (await fetchWithTimeout("https://huggingface.co/api/datasets?sort=trendingScore&limit=14")).json();
  return data.map((set) => make({
    id: `hf-${set.id}`, type: "dataset", typeLabel: "Données et outils", topic: "data-science",
    date: set.createdAt || set.lastModified || new Date().toISOString(), source: `Hugging Face · ${set.author || set.id.split("/")[0]}`,
    url: `https://huggingface.co/datasets/${set.id}`, title: set.id,
    summary: `Jeu de données en tendance sur Hugging Face${set.tags?.length ? ` (${set.tags.filter((t) => !t.includes(":")).slice(0, 3).join(", ") || "usage général"})` : ""}.`,
    value: `${(set.downloads || 0).toLocaleString("fr-FR")} téléchargements récents et ${set.likes || 0} mentions « j’aime ». Consultez la fiche pour la licence et la documentation.`
  }));
}

async function fromPeerTube() {
  const searches = [["statistiques", "statistics", "fr"], ["science des données", "data-science", "fr"], ["programmation python", "it", "fr"], ["data engineering", "data-engineering", "en"]];
  const results = await Promise.all(searches.map(async ([query, topic, lang]) => {
    const url = `https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(query)}&sort=-publishedAt&count=6&languageOneOf=${lang}`;
    const data = await (await fetchWithTimeout(url)).json();
    return (data.data || []).map((video) => make({
      id: `pt-${video.uuid}`, type: "video", typeLabel: "Vidéo et tutoriel", topic, language: lang,
      date: video.publishedAt, source: `PeerTube · ${video.account?.displayName || video.channel?.displayName || "chaîne"}`,
      url: video.url, title: video.name,
      summary: clean(video.description) || "Vidéo publiée sur PeerTube.",
      value: `Vidéo récente${video.duration ? ` de ${Math.max(1, Math.round(video.duration / 60))} min` : ""}, trouvée via le moteur SepiaSearch.`
    }));
  }));
  return results.flat();
}

async function fromRemotive() {
  {
    const data = await (await fetchWithTimeout("https://remotive.com/api/remote-jobs?category=data&limit=15")).json();
    return (data.jobs || []).map((job) => make({
      id: `remotive-${job.id}`, type: "job", typeLabel: "Emploi", topic: "data-science",
      date: job.publication_date, source: `Remotive · ${job.company_name}`, url: job.url, title: job.title,
      summary: clean(job.description, 220),
      value: `Poste à distance${job.candidate_required_location ? ` (${job.candidate_required_location})` : ""}${job.job_type ? `, ${String(job.job_type).replace("_", " ")}` : ""}.`
    }));
  }
}

async function fromArbeitnow() {
  const data = await (await fetchWithTimeout("https://www.arbeitnow.com/api/job-board-api")).json();
  const wanted = /data|statist|analyst|machine learning|\bml\b|\bai\b|bi developer|etl|devops|python|sql/i;
  return (data.data || []).filter((job) => wanted.test(job.title)).slice(0, 14).map((job) => make({
    id: `arbeitnow-${job.slug}`, type: "job", typeLabel: "Emploi",
    topic: /engineer|etl|devops|pipeline/i.test(job.title) ? "data-engineering" : /statist/i.test(job.title) ? "statistics" : "data-science",
    date: new Date(job.created_at * 1000).toISOString(), source: `Arbeitnow · ${job.company_name}`, url: job.url, title: job.title,
    summary: clean(job.description, 220),
    value: `${job.remote ? "À distance" : job.location || "Sur site"}${job.job_types?.length ? `, ${job.job_types.join(", ")}` : ""}.`
  }));
}

const LIVE_SOURCES = [
  { id: "arxiv", name: "arXiv", load: fromArxiv },
  { id: "github", name: "GitHub", load: fromGitHub },
  { id: "devto", name: "DEV", load: fromDevTo },
  { id: "hn", name: "Hacker News", load: fromHackerNews },
  { id: "hf", name: "Hugging Face", load: fromHuggingFace },
  { id: "peertube", name: "PeerTube", load: fromPeerTube },
  { id: "remotive", name: "Remotive", load: fromRemotive },
  { id: "arbeitnow", name: "Arbeitnow", load: fromArbeitnow }
];

/* Charge toutes les sources en parallèle ; une source en échec n’empêche pas les autres. */
async function loadAllSources(onStatus) {
  const collected = [];
  await Promise.all(LIVE_SOURCES.map(async (source) => {
    onStatus(source.id, "loading");
    try {
      const list = await source.load();
      collected.push(...list);
      onStatus(source.id, "ok", list.length);
    } catch (error) {
      onStatus(source.id, "error", 0, error.message);
    }
  }));
  const seen = new Set();
  return collected.filter((item) => item.url && !seen.has(item.url) && seen.add(item.url));
}
