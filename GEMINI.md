# GEMINI.md — Instructions for Gemini & Antigravity Agents

This file provides context and strict guidelines for Google Gemini and Antigravity AI coding agents working on **CineCR**.

> For detailed architectural rules and scraper guidelines, read [AGENTS.md](./AGENTS.md).

---

## Key Directives for Gemini

1. **Simplicity First (Ponytail Philosophy)**:
   - Make the smallest change that fully solves the user request.
   - Do NOT add marketing fluff, exaggerated slogans ("100% real", "en vivo"), or redundant headings.
   - Do NOT add unnecessary dialogs or modals.

2. **UX Conventions**:
   - Theater accordions are closed by default.
   - Date filter defaults to "today".
   - Showtimes link directly to the cinema's booking URL (`complex.website`).

3. **Data Integrity**:
   - Test data with `node tests/verify-data.test.js` after scraper or merge modifications.
   - Verify Vue compilation with `npm run build`.

4. **Git & CI/CD**:
   - Do not configure CI to commit scraped JSON back to the repository. Fresh data is bundled directly into `dist/` on GitHub Actions and deployed to GitHub Pages.
