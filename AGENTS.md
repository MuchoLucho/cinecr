# AGENTS.md — Development & Architectural Guidelines for CineCR

This document defines the architecture, design principles, conventions, and operational rules for any AI agent or human contributor working on the **CineCR** codebase.

---

## 1. Project Overview & Architecture

- **Framework**: Vue 3 (Composition API with `<script setup>`).
- **Bundler**: Vite.
- **Styling**: Native CSS tokens and Material Design 3 inspired tokens in `src/style.css`.
- **Fonts**: Google Sans, Roboto, and Material Symbols Outlined (via Google Fonts in `index.html`).
- **Scraping Architecture**: Node.js scripts in `scripts/` fetching data directly from Costa Rica cinema APIs/endpoints, enriched with The Movie Database (TMDb) for posters, runtimes, and synopses.
- **Unified Data**: Merged dataset stored in `src/data/movies-data.json`.

---

## 2. Core UI & UX Rules (Enforced)

### Rule 2.1: Minimalist, "No-Bluff" UI
- **No promotional fluff**: Never introduce boastful phrases like *"Cartelera en tiempo real • Datos 100% reales"*, *"La cartelera más completa"*, or marketing copy.
- **No redundant headings**: Avoid subtitles that repeat the movie title (e.g. do NOT use *"Cartelera disponible — [Película]"* when the title is already right next to it).
- **No clutter legends**: Avoid repeated legends on every card (e.g., do NOT repeat `SUB = Subtitulada DOB = Doblada` on each movie).

### Rule 2.2: Closed Accordions by Default
- In the movie view, all theater accordions (`.md-expansion-panel`) **must start collapsed/closed** by default (`expandedPanels = ref(new Set())`). This ensures users can scan through many movies and theaters quickly on mobile and desktop without endless scrolling.

### Rule 2.3: Date Filter Defaults to "Today"
- `selectedDate` defaults to `'today'`.
- The date bar must offer individual days (Hoy, Mañana, Días de la semana) plus an option for `"Toda la semana"` (`'all'`).

### Rule 2.4: Zero Useless Pop-ups / Modals
- Clicking on a showtime button (`.showtime-btn`) must directly open the cinema's official page in a new tab (`target="_blank" rel="noopener"`). Do NOT create intermediate dialogs that simply parrot the movie title and time.

---

## 3. Scraper & Data Rules

### Rule 3.1: Scraper Resilience & Silent Fallback
- Scrapers in `scripts/` must wrap network calls and parsing in `try/catch`. If a cinema endpoint changes, is blocked, or times out, the scraper must fail gracefully and return cached data from `src/data/<chain>-data.json` rather than throwing and breaking the whole build.

### Rule 3.2: Title Normalization & Merging
- Always use `normalizeTitleKey(title)` to deduplicate movies across cinema chains. The function strips accents, punctuation, and Spanish/English stopwords (`el`, `la`, `de`, `un`, `the`, `a`, etc.).
- When merging datasets in `scripts/scrape.js`, prefer higher-quality TMDb posters (`image.tmdb.org`), richer non-empty synopses, and valid runtimes (`Xh Ym`).

### Rule 3.3: TMDb Enrichment & Translation Fallbacks
- Movie details (posters, synopses, durations) should be retrieved from TMDb using `TMDB_READ_ACCESS_TOKEN`.
- For festival or non-standard titles (e.g., *Tour de Cine Francés / 24TCF*), maintain translation maps (like `TCF_MAP`) to resolve the original French/international title.
- If the Spanish overview (`language=es-MX`) is empty, query `/movie/{id}/translations` to find any Spanish overview (`iso_639_1: 'es'`) or English fallback.

### Rule 3.4: Genre Normalization & Deduplication
- Genres/tags must always be cleaned via `cleanGenres()`.
- Filter out useless/redundant tags like `"Cine"`, `"Película"`, `"General"`, `"Todos"`.
- Canonicalize variations to their standard accented Spanish title:
  - `animada`, `animado`, `animadas`, `animación` → `Animación`
  - `accion`, `acción` → `Acción`
  - `fantasia`, `fantasía` → `Fantasía`
  - `ciencia ficcion`, `ciencia ficción` → `Ciencia Ficción`
  - `thriller`, `suspenso` → `Suspenso`
  - `niños`, `infantil`, `familiar` → `Familiar`
- Ensure all tags are unique and deduplicated.

---

## 4. GitHub Actions & Deployment Rules

### Rule 4.1: Automated Scraping without Git Pollution
- The GitHub Actions workflow (`.github/workflows/deploy.yml`) is triggered on push and twice daily via cron (`0 6,18 * * *`).
- **Do NOT commit JSON files back to the git repository** inside GitHub Actions. `npm run scrape` runs in the runner and `npm run build` bundles the fresh data directly into `dist/`, which is deployed to GitHub Pages.
- The `movies-data.json` in git serves as an initial seed for local development.

### Rule 4.2: Local Commits Only — Do Not Auto-Push
- Do NOT push to `origin` automatically after each commit. Keep changes in local commits and only push when explicitly requested by the user.

---

## 5. Verification Checklist

Before committing any change:
1. Run data integrity test: `node tests/verify-data.test.js`
2. Run build verification: `npm run build`
3. Ensure git status only includes intended file changes.
