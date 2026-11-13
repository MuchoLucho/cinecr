/**
 * Bistro Cinema Hermosa Costa Rica Scraper
 * Scrapes showtimes from Bistro Cinema (Playa Hermosa, Carrillo, Guanacaste)
 * Source: https://bistrocinemahermosa.com/
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
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  ene: 0, abr: 3, ago: 7, set: 8, dic: 11
};

function parseDate(dayStr) {
  if (!dayStr) return null;
  const m = dayStr.match(/([a-zA-Z]+)\s+(\d{1,2})/);
  if (!m) return null;
  const mPrefix = m[1].toLowerCase().slice(0, 3);
  const mIndex = MONTH_MAP[mPrefix];
  const dayNum = parseInt(m[2], 10);
  if (mIndex === undefined || isNaN(dayNum)) return null;

  const now = new Date();
  let year = now.getFullYear();
  if (now.getMonth() === 11 && mIndex === 0) year += 1;
  return `${year}-${String(mIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

export async function scrapeBistro() {
  console.log('Scraping Bistro Cinema Hermosa (Guanacaste)...');
  const cacheFile = path.resolve(__dirname, '../src/data/bistro-data.json');

  try {
    const html = fetchWithCurl('https://bistrocinemahermosa.com/');
    if (!html || !html.includes('id="cartelera"')) {
      throw new Error('Bistro Cinema response empty or missing cartelera section');
    }

    const carteleraPart = html.split('id="cartelera"')[1] || '';
    const items = carteleraPart.split(/class=[\x27"]jet-listing-grid__item\s+/).slice(1);
    console.log(`Found ${items.length} movie cards on Bistro Cinema Hermosa...`);

    const movies = [];

    for (const item of items) {
      const titleEs = item.match(/movie-title-es[^"]*"[^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]+)<\/div>/i)?.[1]?.trim();
      const titleEn = item.match(/movie-title-en[^"]*"[^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]+)<\/div>/i)?.[1]?.trim();
      const title = titleEs || titleEn;
      if (!title) continue;

      const waLink = item.match(/href=[\x27"](https:\/\/api\.whatsapp\.com\/[^\x27"]+)[\x27"]/i)?.[1]?.replace(/&#038;/g, '&') || 'https://bistrocinemahermosa.com/';

      const chips = [...item.matchAll(/<span\s+class=[\x27"]st-chip[\x27"]>([\s\S]*?)<\/span>\s*<\/div>/gis)];

      const groupMap = new Map();

      for (const c of chips) {
        const dayEs = c[1].match(/class=[\x27"][^\x27"]*st-day-es[^\x27"]*[\x27"]>([^<]+)</i)?.[1]?.trim() || '';
        const dayEn = c[1].match(/class=[\x27"][^\x27"]*st-day-en[^\x27"]*[\x27"]>([^<]+)</i)?.[1]?.trim() || '';
        const dateStr = parseDate(dayEs) || parseDate(dayEn);
        const rawTime = c[1].match(/class=[\x27"][^\x27"]*st-time[^\x27"]*[\x27"]>([^<]+)</i)?.[1]?.trim();
        const time = parseTime(rawTime);
        const rawLang = (c[1].match(/class=[\x27"][^\x27"]*st-lang[^\x27"]*[\x27"][^>]*>([^<]+)</i)?.[1] || '').toLowerCase();

        const language = rawLang.includes('spanish') ? 'DOB' : 'SUB';
        const format = '2D';

        if (dateStr && time) {
          const groupKey = `${format}_${language}`;
          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, { format, language, times: [] });
          }
          groupMap.get(groupKey).times.push({ date: dateStr, time });
        }
      }

      const groups = Array.from(groupMap.values()).map(g => {
        const seen = new Set();
        const uniqueTimes = [];
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

      let defaultRating = 'TP';
      const normT = title.toLowerCase();
      if (normT.includes('godzilla')) defaultRating = 'M12';
      else if (normT.includes('ebenezer') || normT.includes('ebenizer')) defaultRating = 'M12';

      const movie = {
        id: `bistro-${normalizeTitleKey(title)}`,
        title,
        originalTitle: title,
        synopsis: 'Sin sinopsis disponible.',
        poster: null,
        rating: defaultRating,
        duration: 'N/A',
        score: null,
        director: 'N/A',
        genres: ['Cine'],
        theaters: [
          {
            chainId: 'bistro',
            chainName: 'Bistro Cinema',
            complexId: 'bistro-hermosa',
            complexName: 'Bistro Cinema Hermosa',
            province: 'Guanacaste',
            city: 'Playa Hermosa',
            address: 'Hermosa Heights Local #10, Playa Hermosa, Carrillo, Guanacaste',
            locationDetail: 'Hermosa Heights, Playa Hermosa',
            website: waLink,
            groups
          }
        ]
      };

      movies.push(movie);
    }

    // Enrich strictly with TMDb details
    console.log(`Enriching ${movies.length} Bistro Cinema movies with TMDb details...`);
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
      console.log(`Bistro Cinema: Saved ${movies.length} movies to ${cacheFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`Bistro Cinema scrape error: ${err.message}`);
    if (fs.existsSync(cacheFile)) {
      console.log(`Bistro Cinema: Returning cached data from ${cacheFile}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    return [];
  }
}

// CLI test runner
if (process.argv[1] && process.argv[1].endsWith('scrape-bistro.js')) {
  scrapeBistro().then(movies => {
    console.log(`Finished Bistro Cinema scrape. Total movies: ${movies.length}`);
  });
}
