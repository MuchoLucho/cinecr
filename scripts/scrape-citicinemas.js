/**
 * CitiCinemas Costa Rica Scraper
 * Scrapes showtimes from CitiCinemas Plaza Grecia (Grecia, Alajuela)
 * Enriched with TMDb movie details (poster, synopsis, runtime)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTmdbDetails } from './tmdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env if present
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      const val = vals.join('=').replace(/^["']|["']$/g, '');
      process.env[key.trim()] = val.trim();
    }
  }
}

const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function normalizeTitleKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Main scraper function for CitiCinemas Plaza Grecia
 */
export async function scrapeCitiCinemas() {
  console.log('Scraping CitiCinemas (Plaza Grecia) showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/citicinemas-data.json');

  try {
    const res = await fetch('https://www.citicinemascr.com/cartelera/', {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!res.ok) {
      console.warn(`⚠️ CitiCinemas responded with HTTP ${res.status} (${res.statusText}).`);
      if (fs.existsSync(cacheFile)) {
        console.log('Falling back to cached citicinemas-data.json');
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
      return [];
    }

    const html = await res.text();

  // Tab mapping: e.g. <a href="#Wed">Miercoles 11</a>
  const tabMatches = [...html.matchAll(/<a[^>]+href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const tabMap = {};
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  for (const tm of tabMatches) {
    const tabId = tm[1];
    const label = tm[2].replace(/<[^>]+>/g, '').trim();
    const numMatch = label.match(/(\d+)/);
    if (numMatch) {
      const day = numMatch[1].padStart(2, '0');
      tabMap[tabId] = `${currentYear}-${currentMonth}-${day}`;
    }
  }

  console.log('Found CitiCinemas schedule tabs:', tabMap);

  const moviesMap = new Map();

  for (const [tabId, dateStr] of Object.entries(tabMap)) {
    const startIdx = html.indexOf(`id="${tabId}"`);
    if (startIdx === -1) continue;

    let endIdx = html.length;
    for (const otherTab of Object.keys(tabMap)) {
      if (otherTab === tabId) continue;
      const otherIdx = html.indexOf(`id="${otherTab}"`, startIdx + 10);
      if (otherIdx !== -1 && otherIdx < endIdx) {
        endIdx = otherIdx;
      }
    }

    const tabHtml = html.slice(startIdx, endIdx);
    const movieBlocks = tabHtml.split(/<div class="row movie-tabs">/);

    for (let i = 1; i < movieBlocks.length; i++) {
      const mb = movieBlocks[i];
      const titleMatch = mb.match(/<h3[^>]*class="no-underline">([\s\S]*?)<\/h3>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      if (!title) continue;

      const timeRegex = /<span class="time[^"]*">\s*([\d:]+\s*(?:AM|PM))\s*<\/span>\s*<span class="threeD[^"]*">\s*([^<]+)\s*<\/span>/gi;
      const timeMatches = [...mb.matchAll(timeRegex)];

      const key = normalizeTitleKey(title);
      if (!moviesMap.has(key)) {
        moviesMap.set(key, {
          title,
          originalTitle: title,
          poster: null,
          synopsis: 'Sin sinopsis disponible.',
          sessions: []
        });
      }

      for (const tm of timeMatches) {
        const rawTime = tm[1].trim();
        const rawFormat = tm[2].trim();

        const format = rawFormat.toUpperCase().includes('3D') ? '3D' : '2D';
        const language = rawFormat.toUpperCase().includes('SUB') ? 'SUB' : 'DOB';

        const tMatch = rawTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        let timeStr = rawTime;
        if (tMatch) {
          let h = parseInt(tMatch[1], 10);
          const m = parseInt(tMatch[2], 10);
          if (tMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (tMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
          timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        moviesMap.get(key).sessions.push({
          date: dateStr,
          time: timeStr,
          format,
          language
        });
      }
    }
  }

  // Format into final unified schema
  const movies = [];
  for (const [key, item] of moviesMap.entries()) {
    // Group by format and language
    const groupMap = new Map();

    for (const s of item.sessions) {
      const groupKey = `${s.format}-${s.language}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          format: s.format,
          language: s.language,
          times: []
        });
      }
      groupMap.get(groupKey).times.push({
        time: s.time,
        date: s.date
      });
    }

    const groups = Array.from(groupMap.values()).map(g => {
      g.times.sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        return cmp !== 0 ? cmp : a.time.localeCompare(b.time);
      });
      return g;
    });

    const movie = {
      id: `citicinemas-${key}`,
      title: item.title,
      originalTitle: item.originalTitle,
      synopsis: item.synopsis,
      poster: item.poster,
      rating: 'TP',
      duration: 'N/A',
      score: null,
      director: null,
      genres: ['Cine'],
      theaters: [
        {
          chainId: 'citicinemas',
          chainName: 'CitiCinemas',
          complexId: 'citicinemas-grecia',
          complexName: 'CitiCinemas Plaza Grecia',
          province: 'Alajuela',
          city: 'Grecia',
          address: 'Plaza El Ingenio (Plaza Grecia), Ruta 118, Grecia, Alajuela',
          groups
        }
      ]
    };

    movies.push(movie);
  }

  // Enrich with TMDb details (poster, synopsis, runtime duration)
  console.log(`Enriching ${movies.length} CitiCinemas movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title);
    if (tmdbData) {
      if (tmdbData.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
      if (tmdbData.duration) movie.duration = tmdbData.duration;
      if (tmdbData.score) movie.score = tmdbData.score;
      if (tmdbData.director) movie.director = tmdbData.director;
      if (tmdbData.genres?.length) movie.genres = tmdbData.genres;
      console.log(`  ✓ TMDb: ${movie.title} (${movie.duration}, ★ ${movie.score || 'N/A'})`);
    } else {
      console.log(`  - No TMDb found: ${movie.title} (using placeholder artwork and no cinema text)`);
    }
  }

    const outDir = path.resolve(__dirname, '../src/data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'citicinemas-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} CitiCinemas movies to ${outFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: CitiCinemas scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('scrape-citicinemas.js')) {
  scrapeCitiCinemas()
    .then(movies => {
      console.log(`Done! Extracted ${movies.length} movies.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during scrapeCitiCinemas:', err);
      process.exit(1);
    });
}
