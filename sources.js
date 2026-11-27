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

const NAMED = "agrave à aacute á acirc â atilde ã auml ä aring å aelig æ ccedil ç egrave è eacute é ecirc ê euml ë igrave ì iacute í icirc î iuml ï ntilde ñ ograve ò oacute ó ocirc ô otilde õ ouml ö oslash ø ugrave ù uacute ú ucirc û uuml ü yacute ý yuml ÿ oelig œ";
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", szlig: "ß", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", bdquo: "„", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", bull: "•", middot: "·", times: "×", deg: "°", plusmn: "±", euro: "€", copy: "©", reg: "®", trade: "™", micro: "µ", ensp: " ", emsp: " ", thinsp: " " };
NAMED.split(" ").forEach((value, index, list) => { if (index % 2 === 0) { ENTITIES[value] = list[index + 1]; ENTITIES[value[0].toUpperCase() + value.slice(1)] = list[index + 1].toUpperCase(); } });
const decode = (text) => String(text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
  if (code[0] === "#") {
    const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
  }
  return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match;
});

const clean = (text, max = 240) => {
  const value = decode(decode(text || "").replace(/<[^>]*>/g, " ")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

/* Lance plusieurs requêtes : celles qui réussissent sont gardées ; la source n’échoue que si toutes échouent. */
async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  const ok = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
  const failed = results.find((r) => r.status === "rejected");
  if (!ok.length && failed) throw failed.reason;
  return ok;
}

function make(base) {
  return { language: "en", topicLabel: TOPIC_LABELS[base.topic], live: true, ...base, date: String(base.date).slice(0, 10) };
}

async function fromHackerNews() {
  const queries = [["statistics", "statistics"], ["machine learning", "data-science"], ["data engineering", "data-engineering"], ["programming", "it"]];
  const results = await settleAll(queries.map(async ([query, topic]) => {
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
  const results = await settleAll(tags.map(async ([tag, topic]) => {
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
  const results = await settleAll(topics.map(async ([topic, area]) => {
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
  const results = await settleAll(searches.map(async ([query, topic, lang]) => {
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
    language: /\b(und|der|die|das|wir|für|mit|sie)\b/i.test(String(job.description).slice(0, 500)) ? "de" : "en",
    topic: /engineer|etl|devops|pipeline/i.test(job.title) ? "data-engineering" : /statist/i.test(job.title) ? "statistics" : "data-science",
    date: new Date(job.created_at * 1000).toISOString(), source: `Arbeitnow · ${job.company_name}`, url: job.url, title: job.title,
    summary: clean(job.description, 220),
    value: `${job.remote ? "À distance" : job.location || "Sur site"}${job.job_types?.length ? `, ${job.job_types.join(", ")}` : ""}.`
  }));
}

/* Analyses et études statistiques publiées (rapports, articles, notes méthodologiques) avec leurs données,
   déposées en accès libre sur Zenodo (API publique, sans clé). */
async function fromZenodo() {
  const searches = [
    ['"statistical analysis"', "statistics", "en"],
    ['"data analysis"', "data-science", "en"],
    ['"analyse statistique" OR "analyse de données"', "statistics", "fr"],
    ['Benin AND (statistics OR "data analysis")', "statistics", "en"],
    ['Bénin AND (statistiques OR "analyse de données")', "statistics", "fr"]
  ];
  const found = [], errors = [];
  /* Requêtes une par une : une requête refusée n’annule pas les autres. */
  for (const [query, topic, lang] of searches) {
    try {
      const url = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}&type=publication&access_status=open&sort=mostrecent&size=6`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "DataRadar/1.0 (+https://github.com/djagla-laurent/data-radar)" } });
      } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const record of data.hits?.hits || []) {
        const meta = record.metadata || {};
        const authors = (meta.creators || []).map((c) => c.name).filter(Boolean);
        const kind = meta.resource_type?.title || "Publication";
        if (!meta.title) continue;
        found.push(make({
          id: `zenodo-${record.id}`, type: "analysis", typeLabel: "Projet d’analyse", topic, language: lang,
          date: meta.publication_date || record.created || new Date().toISOString(), source: `Zenodo${authors[0] ? ` · ${authors[0]}${authors.length > 1 ? " et al." : ""}` : ""}`,
          url: record.links?.self_html || `https://zenodo.org/records/${record.id}`, title: clean(meta.title, 200),
          summary: clean(meta.description, 260) || "Étude déposée sur Zenodo.",
          value: `${kind} publié en accès libre sur Zenodo, souvent accompagné de ses données ou de son code. Vérifiez la licence et la méthode sur la fiche.`
        }));
      }
    } catch (error) {
      errors.push(error.name === "AbortError" ? "délai dépassé" : error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!found.length) throw new Error(`Zenodo : ${[...new Set(errors)].join(", ") || "aucun résultat"}`);
  return found;
}

const LIVE_SOURCES = [
  { id: "arxiv", name: "arXiv", load: fromArxiv },
  { id: "github", name: "GitHub", load: fromGitHub },
  { id: "devto", name: "DEV", load: fromDevTo },
  { id: "hn", name: "Hacker News", load: fromHackerNews },
  { id: "hf", name: "Hugging Face", load: fromHuggingFace },
  { id: "peertube", name: "PeerTube", load: fromPeerTube },
  { id: "remotive", name: "Remotive", load: fromRemotive },
  { id: "arbeitnow", name: "Arbeitnow", load: fromArbeitnow },
  { id: "zenodo", name: "Zenodo", load: fromZenodo }
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
