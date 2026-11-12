/**
 * Nova Cinemas Costa Rica Scraper
 * Uses official Nova Cinemas Vista endpoint (/wp-admin/admin-ajax.php?action=cinema_api_get_all_cinema_data)
 * Enriched with TMDb movie posters & synopses (with Wikipedia fallback)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function fetchTmdbDetails(title, originalTitle) {
  if (!TMDB_TOKEN) return null;
  const queries = [title, originalTitle].filter(Boolean);
  for (const q of queries) {
    try {
      const cleanTitle = q.replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE|IMAX)\b/gi, '').trim();
      const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&language=es-MX`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TMDB_TOKEN}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = (data.results || []).find(m => m.poster_path || m.overview);
      if (result) {
        return {
          tmdbId: result.id,
          poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
          synopsis: result.overview ? result.overview.trim() : null
        };
      }
    } catch {
      // shortcut: silent fallback on network/rate limit
    }
  }
  return null;
}

async function fetchWikipediaPoster(title) {
  try {
    const cleanTitle = title.replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE|IMAX)\b/gi, '').trim();
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(cleanTitle + ' film')}&gsrlimit=1&prop=pageimages&pithumbsize=500`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages || {};
    for (const pageId in pages) {
      if (pages[pageId]?.thumbnail?.source) {
        return pages[pageId].thumbnail.source;
      }
    }
  } catch {
    // shortcut: silent fallback
  }
  return null;
}

export async function scrapeNova() {
  console.log('Scraping Nova Cinemas Costa Rica showtimes...');
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
          score: '8.0',
          duration,
          director: 'N/A',
          genres: ['Cine'],
          poster: rawFilm.PosterImage || '',
          synopsis: (rawFilm.Synopsis || 'Sin sinopsis disponible.').trim(),
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

  // Enrich with TMDb posters and synopses
  console.log(`Enriching ${movies.length} Nova Cinemas movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
    if (tmdbData) {
      if (tmdbData.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis && (!movie.synopsis || movie.synopsis.startsWith('Sin sinopsis'))) {
        movie.synopsis = tmdbData.synopsis;
      }
      console.log(`  ✓ TMDb: ${movie.title}`);
    } else if (!movie.poster) {
      const wikiPoster = await fetchWikipediaPoster(movie.originalTitle || movie.title);
      if (wikiPoster) {
        movie.poster = wikiPoster;
        console.log(`  ✓ Wikipedia: ${movie.title}`);
      }
    }
  }

  const outDir = path.resolve(__dirname, '../src/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'nova-data.json');
  fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
  console.log(`Saved ${movies.length} Nova Cinemas movies to ${outFile}`);
  return movies;
}

if (process.argv[1] && process.argv[1].endsWith('scrape-nova.js')) {
  scrapeNova();
}
