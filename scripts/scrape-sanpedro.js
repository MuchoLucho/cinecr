/**
 * Cinema San Pedro Costa Rica Scraper
 * Scrapes showtimes from Cinema San Pedro (Mall San Pedro, Montes de Oca, San José)
 * Enriched with TMDb movie details (poster, synopsis, runtime)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
 * Fetch HTML using curl to cleanly pass Cloudflare verification
 */
function fetchWithCurl(url) {
  return execSync(
    `curl -sL "${url}" -H "User-Agent: ${USER_AGENT}" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
  ).toString();
}

/**
 * Main scraper function for Cinema San Pedro
 */
export async function scrapeSanPedro() {
  console.log('Scraping Cinema San Pedro (Mall San Pedro) showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/sanpedro-data.json');

  try {
    // 1. Fetch homepage to get all movie URLs
  const homeHtml = fetchWithCurl('https://cinemasanpedro.com/home');
  const movieLinks = [...new Set([...homeHtml.matchAll(/href="(\/boleteria\/pelicula\/[^"]+)"/g)].map(m => m[1]))];

  console.log(`Found ${movieLinks.length} movie URLs on Cinema San Pedro...`);

  // Window for current week
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 7);
  const maxStr = maxDate.toISOString().slice(0, 10);
  const minStr = today.toISOString().slice(0, 10);

  const movies = [];

  for (const link of movieLinks) {
    try {
      const pageHtml = fetchWithCurl(`https://cinemasanpedro.com${link}`);
      const ldMatches = [...pageHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];

      let movieItem = null;
      const rawEvents = [];

      for (const m of ldMatches) {
        try {
          const json = JSON.parse(m[1]);
          if (json['@graph']) {
            for (const item of json['@graph']) {
              if (item['@type'] === 'Movie') movieItem = item;
              if (item['@type'] === 'ScreeningEvent') rawEvents.push(item);
            }
          }
        } catch {}
      }

      if (!movieItem && rawEvents.length === 0) continue;

      // Filter events to current 7-day week
      const weekEvents = rawEvents.filter(e => {
        const d = (e.startDate || '').slice(0, 10);
        return d >= minStr && d <= maxStr;
      });

      // Skip movies with no current sessions this week (e.g. far pre-sales)
      if (weekEvents.length === 0) {
        console.log(`  Skipping pre-sale with 0 current week events: ${movieItem?.name || link}`);
        continue;
      }

      const title = movieItem?.name || link.split('/').pop().replace(/-/g, ' ');

      // Group showtimes by format and language
      const groupMap = new Map();

      for (const event of weekEvents) {
        const name = event.name || '';
        const match = name.match(/\((2D|3D)\s*(DOB|SUB)\)/i);
        const format = match ? match[1].toUpperCase() : (event.videoFormat || '2D');
        const language = match ? match[2].toUpperCase() : (event.inLanguage === 'en' ? 'SUB' : 'DOB');
        const groupKey = `${format}-${language}`;

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            format,
            language,
            times: []
          });
        }

        const dateStr = (event.startDate || '').slice(0, 10);
        const timeStr = (event.startDate || '').slice(11, 16);

        if (dateStr && timeStr) {
          groupMap.get(groupKey).times.push({
            time: timeStr,
            date: dateStr
          });
        }
      }

      const groups = Array.from(groupMap.values()).map(g => {
        g.times.sort((a, b) => {
          const cmp = a.date.localeCompare(b.date);
          return cmp !== 0 ? cmp : a.time.localeCompare(b.time);
        });
        return g;
      });

      const movie = {
        id: `sanpedro-${normalizeTitleKey(title)}`,
        title,
        originalTitle: title,
        synopsis: 'Sin sinopsis disponible.',
        poster: null,
        rating: movieItem?.contentRating || 'TP',
        duration: 'N/A',
        score: null,
        director: null,
        genres: ['Cine'],
        theaters: [
          {
            chainId: 'sanpedro',
            chainName: 'Cinema San Pedro',
            complexId: 'sanpedro-mall',
            complexName: 'Cinema San Pedro (Mall San Pedro)',
            province: 'San José',
            city: 'Montes de Oca',
            address: 'Condominio Mall San Pedro, pisos 3 y 5, San Pedro de Montes de Oca, San José',
            groups
          }
        ]
      };

      movies.push(movie);
    } catch (err) {
      console.warn(`Warning: failed to scrape Cinema San Pedro movie ${link}:`, err.message);
    }
  }

  // Enrich with TMDb details (poster, synopsis, runtime duration)
  console.log(`Enriching ${movies.length} Cinema San Pedro movies with TMDb details...`);
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
    const outFile = path.join(outDir, 'sanpedro-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} Cinema San Pedro movies to ${outFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: Cinema San Pedro scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('scrape-sanpedro.js')) {
  scrapeSanPedro()
    .then(movies => {
      console.log(`Done! Extracted ${movies.length} movies.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during scrapeSanPedro:', err);
      process.exit(1);
    });
}
