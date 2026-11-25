# Data Radar

Prototype d’une plateforme de veille pour les personnes intéressées par les statistiques, la science des données et l’informatique.

## Collecte automatique (sans rien à lancer)

Un robot GitHub Actions (`.github/workflows/collect.yml`) collecte toutes les sources **toutes les 6 heures**, écrit `data/items.json` et republie le site sur GitHub Pages. Il suffit ensuite d’ouvrir l’adresse du site. Si une source tombe en panne, les autres sont publiées quand même ; si presque tout échoue, l’ancienne version reste en ligne.

Mise en route (une seule fois) :
1. Créer un dépôt GitHub et y déposer tous les fichiers de ce dossier (branche `main`).
2. Dans **Settings → Pages**, choisir **Source : GitHub Actions**.
3. Dans l’onglet **Actions**, lancer « Collecte et publication » avec **Run workflow**. L’adresse du site s’affiche à la fin.

Les conférences viennent de la liste ouverte ccf-deadlines (SIGMOD, VLDB, ICDE, ICML, ICLR, AAAI, IJCAI, AISTATS, UAI, COLT). Pour ajouter des événements, formations ou rencontres (useR!, JSM, PyData, événements au Bénin…), remplir `collector/manual-events.json` :

```json
[{ "title": "Nom de l’événement", "url": "https://…", "date": "2027-03-15", "place": "Cotonou", "topic": "statistics", "language": "fr" }]
```

Ouvert directement depuis un fichier (`index.html` sans serveur), le site retombe sur la collecte dans le navigateur.

## Français, sources locales et résumé du matin

**Traduction.** Si le secret `ANTHROPIC_API_KEY` est défini, le robot traduit titres et résumés en français (modèle Claude Haiku). Les traductions déjà faites sont réutilisées d’une collecte à l’autre : seuls les nouveaux contenus sont traduits (150 au maximum par collecte). Sans clé, les contenus restent dans leur langue d’origine. Les fiches traduites sont signalées « traduit » et gardent le titre original.

**Sources locales (Bénin).** `collector/feeds.json` liste des flux RSS/Atom. Par défaut, trois recherches de presse béninoise (emplois, formations, marchés numériques). C’est un point de départ : pour de meilleurs résultats, ajoutez les flux des sites que vous utilisez vraiment (jobboards, écoles, universités, portail des marchés publics). Chaque entrée accepte `name`, `url`, `type` (job, event, tender, news…), `typeLabel`, `topic`, `language`, `include` (mots-clés), `maxAgeDays` et `max`.

**Résumé du jour.** Le bouton « Résumé du jour » ouvre l’essentiel (3 contenus par catégorie, plus une courte introduction si la clé Claude est définie). Pour le recevoir aussi par e-mail chaque matin vers 7 h (heure de Cotonou), ajoutez dans Settings → Secrets and variables → Actions : `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` et `DIGEST_TO` (votre adresse). Avec Gmail : `smtp.gmail.com`, port `465`, et un mot de passe d’application. Sans ces secrets, aucun e-mail n’est envoyé.

## Sources connectées

Huit sources publiques, plus les conférences,, sans clé d’API, sont appelées directement depuis le navigateur :

| Source | Contenu | Format |
|---|---|---|
| arXiv | prépublications en statistiques (stat.ME), apprentissage automatique (cs.LG) et bases de données (cs.DB) | Publications |
| GitHub | dépôts actifs sur les sujets statistics, data-science, data-engineering | Logiciels open source |
| DEV | articles populaires de la semaine | Articles et actualités |
| Hacker News | discussions populaires de la communauté technique | Articles et actualités |
| Hugging Face | jeux de données en tendance | Données et outils |
| PeerTube (SepiaSearch) | vidéos récentes, dont en français | Vidéos et tutoriels |
| Remotive, Arbeitnow | offres data et développement, à distance ou en Europe | Emplois |

Chaque fiche renvoie vers la source originale. Seuls le titre, les métadonnées et la courte description fournie par la source sont affichés. Si aucune source ne répond, l’application retombe sur les exemples fictifs.

## Fonctions

Recherche, filtres par format, domaine et langue, tri, pagination, favoris et préférences conservés dans le navigateur, mode sombre, cache de 30 minutes (pour respecter les limites des APIs), bouton Actualiser.

## Limites actuelles

- Sans clé `ANTHROPIC_API_KEY`, les contenus restent en anglais.
- Les formations et événements locaux passent par `collector/manual-events.json` ; YouTube et les offres d’emploi locales (Bénin, Afrique) demanderont un serveur et des clés d’API. Les exemples fictifs ne s’affichent que si tout échoue.
- Remotive demande de ne pas l’interroger trop souvent (quelques fois par jour) : le cache de 30 minutes aide, mais évitez de multiplier les « Actualiser ».
- GitHub limite les recherches sans authentification (environ 10 par minute) ; arXiv peut bloquer certains accès navigateur. Une source en échec est signalée sans bloquer les autres.
- Les flux locaux par défaut passent par la presse (Google Actualités) : ils relaient des offres, ils ne les remplacent pas.

## Prochaine étape recommandée

Ajouter un petit serveur (ou une fonction serverless) qui collecte, déduplique et met en cache les sources, résume en français et gère les clés d’API côté serveur.

## Lancer la démo

Ouvrir `index.html` dans un navigateur moderne. Aucun serveur ni dépendance n’est requis.
