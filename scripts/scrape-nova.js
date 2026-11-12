/**
 * Nova Cinemas Costa Rica Scraper
 * Uses official Nova Cinemas Vista endpoint (/wp-admin/admin-ajax.php?action=cinema_api_get_all_cinema_data)
 * Enriched with TMDb movie posters & synopses (with Wikipedia fallback)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTmdbDetails } from './tmdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const THEATERS_MAP = {
  '9999': {
    complexId: 'nova-escazu',
    name: 'Nova Cinemas Avenida Escazú',
    province: 'San José',
    locationDetail: 'Escazú, Avenida Escazú',
    website: 'https://www.novacinemas.cr/cartelera/avenida-escazu/'
  },
  '9996': {
    complexId: 'nova-curridabat',
    name: 'Nova Cinemas Ciudad del Este',
    province: 'San José',
    locationDetail: 'Curridabat, Ciudad del Este',
    website: 'https://www.novacinemas.cr/cartelera/ciudad-del-este-curridabat/'
  },
  '9998': {
    complexId: 'nova-alajuela',
    name: 'Nova Cinemas Plaza Real',
    province: 'Alajuela',
    locationDetail: 'Alajuela, Plaza Real',
    website: 'https://www.novacinemas.cr/cartelera/plaza-real-alajuela/'
  },
  '9995': {
    complexId: 'nova-limon',
    name: 'Nova Cinemas Plaza Moín',
    province: 'Limón',
    locationDetail: 'Limón, Plaza Moín',
    website: 'https://www.novacinemas.cr/cartelera/plaza-moin-limon/'
  },
  '9994': {
    complexId: 'nova-tamarindo',
    name: 'Nova Cinemas Tamarindo',
    province: 'Guanacaste',
    locationDetail: 'Tamarindo, Plaza Garden',
    website: 'https://www.novacinemas.cr/cartelera/nova-tamarindo-plaza-garden/'
  }
};

function parseVersion(session) {
  const attrs = (session.SessionAttributesNames || []).map(a => a.toUpperCase());
  const screen = (session.ScreenName || '').toUpperCase();

  const isSub = attrs.includes('SUB') || screen.includes('SUB');
  const language = isSub ? 'SUB' : 'DOB';

  let format = '2D';
  if (screen.includes('IMAX')) format = 'IMAX';
  else if (screen.includes('LASERMAX')) format = 'LASERMAX';
  else if (screen.includes('VIP')) format = 'VIP';
  else if (screen.includes('ONE')) format = 'ONE';
  else if (attrs.includes('3D') || screen.includes('3D')) format = '3D';
  else if (attrs.includes('4DX') || screen.includes('4DX')) format = '4DX';
  else if (attrs.includes('DBOX') || screen.includes('DBOX') || screen.includes('D-BOX')) format = 'D-BOX';

  return { format, language };
}

function normalizeTitleKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function scrapeNova() {
  console.log('Scraping Nova Cinemas Costa Rica showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/nova-data.json');

  try {
    const movieMap = new Map();

  // Current 7-day cinema week window
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999);

  const url = 'https://www.novacinemas.cr/wp-admin/admin-ajax.php?action=cinema_api_get_all_cinema_data';
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Nova Cinemas data: ${res.statusText}`);
  }

  const allData = await res.json();
  const scheduledFilms = allData.scheduledFilms || {};
  const filmSessions = allData.filmSessions || {};

  // Build a lookup map of raw scheduled films
  const rawFilmsMap = new Map();
  for (const cinemaId of Object.keys(scheduledFilms)) {
    for (const f of scheduledFilms[cinemaId]) {
      if (!rawFilmsMap.has(f.ScheduledFilmId)) {
        rawFilmsMap.set(f.ScheduledFilmId, f);
      }
    }
  }

  for (const [cinemaId, theaterInfo] of Object.entries(THEATERS_MAP)) {
    const sessions = filmSessions[cinemaId] || [];
    console.log(`Processing ${theaterInfo.name} (${sessions.length} total sessions)...`);

    for (const s of sessions) {
      if (!s.Showtime) continue;
      const sessionDateObj = new Date(s.Showtime);
      if (sessionDateObj < today || sessionDateObj > maxDate) continue;

      const rawFilm = rawFilmsMap.get(s.ScheduledFilmId) || {};
      const rawTitle = rawFilm.Title || s.ScheduledFilmId;
      const key = normalizeTitleKey(rawTitle);
      if (!key) continue;

      const dateStr = s.Showtime.split('T')[0];
      const timeParts = s.Showtime.split('T')[1].split(':');
      const sessionTime = `${timeParts[0]}:${timeParts[1]}`;

      const mins = parseInt(rawFilm.RunTime, 10);
      const duration = !isNaN(mins) && mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : 'N/A';
      const rawRating = (rawFilm.Rating || 'TP').trim();
      const rating = rawRating === 'S/C' ? 'TP' : rawRating;
      const ratingBadgeClass = rating.includes('18') ? 'badge-red' : rating.includes('15') ? 'badge-orange' : rating.includes('12') ? 'badge-amber' : 'badge-green';

      if (!movieMap.has(key)) {
        movieMap.set(key, {
          id: `nova-${s.ScheduledFilmId.toLowerCase()}`,
          normalizedKey: key,
          title: rawTitle.trim(),
          originalTitle: (rawFilm.TitleAlt || rawTitle).trim(),
          studio: 'Nova Cinemas',
          rating,
          ratingBadgeClass,
          score: null,
          duration: 'N/A',
          director: 'N/A',
          genres: [],
          poster: null,
          synopsis: 'Sin sinopsis disponible.',
          theaters: []
        });
      }

      const movie = movieMap.get(key);
      let complex = movie.theaters.find(t => t.complexId === theaterInfo.complexId);
      if (!complex) {
        complex = {
          complexId: theaterInfo.complexId,
          chainId: 'nova',
          chainName: 'Nova Cinemas',
          complexName: theaterInfo.name,
          province: theaterInfo.province,
          locationDetail: theaterInfo.locationDetail,
          website: theaterInfo.website,
          groups: []
        };
        movie.theaters.push(complex);
      }

      const { format, language } = parseVersion(s);
      let group = complex.groups.find(g => g.format === format && g.language === language);
      if (!group) {
        group = {
          format,
          language,
          times: []
        };
        complex.groups.push(group);
      }

      const exists = group.times.some(t => t.time === sessionTime && t.date === dateStr);
      if (!exists) {
        group.times.push({
          time: sessionTime,
          date: dateStr
        });
      }
    }
  }

  const movies = Array.from(movieMap.values()).filter(m => m.theaters.length > 0);

  // Sort showtimes chronologically within each group
  for (const movie of movies) {
    for (const theater of movie.theaters) {
      for (const group of theater.groups) {
        group.times.sort((a, b) => {
          const cmp = (a.date || '').localeCompare(b.date || '');
          return cmp !== 0 ? cmp : a.time.localeCompare(b.time);
        });
      }
    }
  }

  // Enrich strictly with TMDb details (no proprietary cinema metadata)
  console.log(`Enriching ${movies.length} Nova Cinemas movies strictly with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
    if (tmdbData) {
      movie.poster = tmdbData.poster;
      movie.synopsis = tmdbData.synopsis;
      movie.duration = tmdbData.duration;
      movie.score = tmdbData.score;
      movie.director = tmdbData.director;
      if (tmdbData.genres && tmdbData.genres.length > 0) movie.genres = tmdbData.genres;
      console.log(`  ✓ TMDb: ${movie.title} (${movie.duration}, score: ${movie.score})`);
    } else {
      movie.poster = null;
      movie.synopsis = 'Sin sinopsis disponible.';
      movie.duration = 'N/A';
      movie.score = null;
      movie.director = 'N/A';
      console.log(`  - No TMDb entry: ${movie.title}`);
    }
  }

    const outDir = path.resolve(__dirname, '../src/data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, 'nova-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} Nova Cinemas movies to ${outFile}`);
    }
    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: Nova Cinemas scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

if (process.argv[1] && process.argv[1].endsWith('scrape-nova.js')) {
  scrapeNova();
}
