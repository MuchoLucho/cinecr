/**
 * Cine Magaly Costa Rica Scraper
 * Scrapes showtimes from Cine Magaly (Barrio La California, San José)
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
 * Main scraper function for Cine Magaly
 */
export async function scrapeMagaly() {
  console.log('Scraping Cine Magaly Costa Rica showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/magaly-data.json');

  try {
    // 1. Fetch main programming page to get available dates
    const progRes = await fetch('https://www.cinemagaly.com/programacion', {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    if (!progRes.ok) {
      console.warn(`⚠️ Cine Magaly responded with HTTP ${progRes.status} (${progRes.statusText}).`);
      if (fs.existsSync(cacheFile)) {
        console.log('Falling back to cached magaly-data.json');
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
      return [];
    }
    const progHtml = await progRes.text();

  const dateMatches = [...progHtml.matchAll(/<option\s+value="(\d{4}-\d{2}-\d{2})"/g)];
  const allDates = [...new Set(dateMatches.map(m => m[1]))];

  // Strictly filter to the current 7-day week
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 7);
  const maxStr = maxDate.toISOString().slice(0, 10);
  const weekDates = allDates.filter(d => d <= maxStr);

  console.log(`Fetching ${weekDates.length} days of programming for Cine Magaly...`);

  // Map of normalized title -> movie object
  const moviesMap = new Map();

  for (const dateStr of weekDates) {
    try {
      const dayRes = await fetch(`https://www.cinemagaly.com/programacion?date=${dateStr}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (!dayRes.ok) continue;

      const dayData = await dayRes.json();
      const html = dayData.html || '';
      const cards = html.split(/<div class="text-primary-emphasis bg-warning-subtle3/);

      for (let i = 1; i < cards.length; i++) {
        const card = cards[i];

        // Title
        const titleMatch = card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        if (!titleMatch) continue;
        const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        const title = rawTitle.split('\n')[0].trim();
        if (!title) continue;

        // Metadata spans: [Rating, Duration, Language]
        const metaBlock = card.match(/<div class="fs-5c mb-0 opacity-75[^>]*>([\s\S]*?)<\/div>/);
        const spans = metaBlock
          ? [...metaBlock[1].matchAll(/<span[^>]*class="fw-medium">([\s\S]*?)<\/span>/g)].map(m => m[1].trim())
          : [];

        const rating = spans[0] || 'TP';
        const langStr = spans[2] || 'Subtitulada';
        const language = langStr.toLowerCase().includes('doblada') ? 'DOB' : 'SUB';

        // Showtimes
        const funcMatches = [...card.matchAll(/<a[^>]+class="btn-warning2[^>]*>([\s\S]*?)<\/a>/g)];
        const showtimes = [];

        for (const fm of funcMatches) {
          const text = fm[1].replace(/<[^>]+>/g, '').trim();
          const tm = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (tm) {
            let h = parseInt(tm[1], 10);
            const m = parseInt(tm[2], 10);
            if (tm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
            if (tm[3].toUpperCase() === 'AM' && h === 12) h = 0;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            showtimes.push({ time: timeStr, date: dateStr });
          }
        }

        if (showtimes.length === 0) continue;

        const key = normalizeTitleKey(title);
        if (!moviesMap.has(key)) {
          moviesMap.set(key, {
            id: `magaly-${key}`,
            title,
            originalTitle: title,
            poster: null,
            rating,
            duration: 'N/A',
            score: null,
            director: null,
            language,
            synopsis: 'Sin sinopsis disponible.',
            showtimes: []
          });
        }

        moviesMap.get(key).showtimes.push(...showtimes);
      }
    } catch (err) {
      console.warn(`Warning: failed to scrape Cine Magaly for ${dateStr}:`, err.message);
    }
  }

  // Format into final unified schema
  const movies = [];
  for (const [key, item] of moviesMap.entries()) {
    // Sort showtimes chronologically
    item.showtimes.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return cmp !== 0 ? cmp : a.time.localeCompare(b.time);
    });

    const movie = {
      id: item.id,
      title: item.title,
      originalTitle: item.originalTitle,
      synopsis: item.synopsis,
      poster: item.poster,
      rating: item.rating,
      duration: item.duration,
      score: item.score,
      director: item.director,
      genres: ['Cine', 'Independiente'],
      theaters: [
        {
          chainId: 'magaly',
          chainName: 'Cine Magaly',
          complexId: 'magaly-california',
          complexName: 'Cine Magaly',
          province: 'San José',
          city: 'San José',
          address: 'Barrio La California, San José',
          groups: [
            {
              format: '2D',
              language: item.language,
              times: item.showtimes
            }
          ]
        }
      ]
    };

    movies.push(movie);
  }

  // Enrich with TMDb details (poster, synopsis, runtime duration)
  console.log(`Enriching ${movies.length} Cine Magaly movies with TMDb details...`);
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
    const outFile = path.join(outDir, 'magaly-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} Cine Magaly movies to ${outFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: Cine Magaly scraping error: ${err.message}. Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('scrape-magaly.js')) {
  scrapeMagaly()
    .then(movies => {
      console.log(`Done! Extracted ${movies.length} movies.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during scrapeMagaly:', err);
      process.exit(1);
    });
}
