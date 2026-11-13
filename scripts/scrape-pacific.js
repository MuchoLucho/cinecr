/**
 * Pacific Cinemas Costa Rica Scraper
 * Scrapes showtimes from Pacific Cinemas (Paso Canoas, Puntarenas)
 * Source: https://pacificcinemas.com/cartelera.php
 * Enriched with TMDb movie details
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

function fetchWithCurl(url) {
  return execSync(
    `curl -sL "${url}" -H "User-Agent: ${USER_AGENT}" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
  ).toString();
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

const MONTH_MAP = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11
};

function parseDateToIso(dayDateStr) {
  const parts = dayDateStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const dayNum = parseInt(parts[0], 10);
  const mPrefix = parts[1].toLowerCase().slice(0, 3);
  const mIndex = MONTH_MAP[mPrefix];
  if (mIndex === undefined || isNaN(dayNum)) return null;

  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() === 11 && mIndex === 0) {
    year += 1;
  }
  return `${year}-${String(mIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

function parseRating(ratingRaw) {
  if (!ratingRaw) return 'TP';
  const r = ratingRaw.toUpperCase();
  if (r.includes('18')) return 'M18';
  if (r.includes('15')) return 'M15';
  if (r.includes('12')) return 'M12';
  return 'TP';
}

export async function scrapePacific() {
  console.log('Scraping Pacific Cinemas (Paso Canoas, Puntarenas)...');
  const cacheFile = path.resolve(__dirname, '../src/data/pacific-data.json');

  try {
    const html = fetchWithCurl('https://pacificcinemas.com/cartelera.php');
    if (!html || !html.includes('pc-movie-card')) {
      throw new Error('Pacific Cinemas response empty or missing movie cards');
    }

    const movieCards = html.split(/<article\s+class=[\x27"]pc-movie-card[\x27"]>/).slice(1).map(c => c.split('</article>')[0]);
    console.log(`Found ${movieCards.length} movie cards on Pacific Cinemas...`);

    const movies = [];

    for (const card of movieCards) {
      const titleMatch = card.match(/<h3\s+class=[\x27"]pc-movie-title[\x27"]><a[^>]*>([^<]+)<\/a>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim();

      const linkMatch = card.match(/<h3\s+class=[\x27"]pc-movie-title[\x27"]><a\s+href=[\x27"]([^\x27"]+)[\x27"]/i);
      const relativeLink = linkMatch ? linkMatch[1].trim() : 'cartelera.php';
      const movieUrl = relativeLink.startsWith('http') ? relativeLink : `https://pacificcinemas.com/${relativeLink}`;

      const ratingMatch = card.match(/<div\s+class=[\x27"]pc-badge\s+censura[\x27"][^>]*>([^<]+)<\/div>/i);
      const rating = parseRating(ratingMatch ? ratingMatch[1] : '');

      // Parse schedule days
      const days = [...card.matchAll(/<div\s+class=[\x27"]pc-day-card[\x27"]>(.*?)<div\s+class=[\x27"]pc-day-head[\x27"]>.*?<span\s+class=[\x27"]pc-day-date[\x27"]>([^<]+)<\/span><\/div>(.*?)(?=<div\s+class=[\x27"]pc-day-card[\x27"]>|$)/gis)];

      const groupMap = new Map(); // key: `${format}_${language}` -> times: [{ date, time }]

      for (const d of days) {
        const dateStr = parseDateToIso(d[2]);
        if (!dateStr) continue;

        const chips = [...d[3].matchAll(/<div\s+class=[\x27"]pc-time-chip[^\x27"]*[\x27"]>.*?<span\s+class=[\x27"]format[\x27"]>([^<]+)<\/span>.*?<span\s+class=[\x27"]lang[\x27"]>([^<]+)<\/span>.*?<span\s+class=[\x27"]hour[\x27"]>([^<]+)<\/span>/gis)];

        for (const chip of chips) {
          const rawFmt = chip[1].trim().toUpperCase();
          const rawLang = chip[2].trim().toUpperCase();
          const rawHour = chip[3].trim();

          const time = parseTime(rawHour);
          if (!time) continue;

          let format = '2D';
          if (rawFmt.includes('3D')) format = '3D';

          let language = 'DOB';
          if (rawLang.includes('SUB') || rawLang.includes('ING')) language = 'SUB';

          const groupKey = `${format}_${language}`;
          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, { format, language, times: [] });
          }
          groupMap.get(groupKey).times.push({ date: dateStr, time });
        }
      }

      const groups = Array.from(groupMap.values()).map(g => {
        // Deduplicate and sort chronologically
        const uniqueTimes = [];
        const seen = new Set();
        for (const t of g.times) {
          const k = `${t.date}_${t.time}`;
          if (!seen.has(k)) {
            seen.add(k);
            uniqueTimes.push(t);
          }
        }
        uniqueTimes.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        return {
          format: g.format,
          language: g.language,
          times: uniqueTimes
        };
      }).filter(g => g.times.length > 0);

      if (groups.length === 0) continue;

      const movie = {
        id: `pacific-${normalizeTitleKey(title)}`,
        title,
        originalTitle: title,
        synopsis: 'Sin sinopsis disponible.',
        poster: null,
        rating,
        duration: 'N/A',
        score: null,
        director: 'N/A',
        genres: ['Acción'],
        theaters: [
          {
            chainId: 'pacific',
            chainName: 'Pacific Cinemas',
            complexId: 'pacific-paso-canoas',
            complexName: 'Pacific Cinemas Paso Canoas',
            province: 'Puntarenas',
            city: 'Paso Canoas',
            address: 'Paso Canoas, Corredores, Puntarenas',
            locationDetail: 'Paso Canoas, Corredores',
            website: movieUrl,
            groups
          }
        ]
      };

      movies.push(movie);
    }

    // Enrich strictly with TMDb details
    console.log(`Enriching ${movies.length} Pacific Cinemas movies with TMDb details...`);
    for (const movie of movies) {
      const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
      if (tmdbData) {
        if (tmdbData.poster) movie.poster = tmdbData.poster;
        if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
        if (tmdbData.duration) movie.duration = tmdbData.duration;
        if (tmdbData.score) movie.score = tmdbData.score;
        if (tmdbData.director) movie.director = tmdbData.director;
        if (tmdbData.genres?.length) movie.genres = tmdbData.genres;
        console.log(`  ✓ TMDb: ${movie.title} (${movie.duration}, ★ ${movie.score || 'N/A'})`);
      } else {
        movie.poster = null;
        movie.synopsis = 'Sin sinopsis disponible.';
        movie.duration = 'N/A';
        movie.score = null;
        movie.director = 'N/A';
      }
    }

    if (movies.length > 0) {
      fs.writeFileSync(cacheFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Pacific Cinemas: Saved ${movies.length} movies to ${cacheFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`Pacific Cinemas scrape error: ${err.message}`);
    if (fs.existsSync(cacheFile)) {
      console.log(`Pacific Cinemas: Returning cached data from ${cacheFile}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    return [];
  }
}

// CLI test runner
if (process.argv[1] && process.argv[1].endsWith('scrape-pacific.js')) {
  scrapePacific().then(movies => {
    console.log(`Finished Pacific Cinemas scrape. Total movies: ${movies.length}`);
  });
}
