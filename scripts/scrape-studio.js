/**
 * Studio Cinemas Costa Rica Scraper
 * Scrapes showtimes from Studio Cinemas (City Place Santa Ana, San José)
 * Uses official Cineverse REST API (showtime.rdghub.com)
 * Enriched with TMDb movie details (poster, synopsis, runtime)
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

function normalizeTitleKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte|cine para todos)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Query TMDb Search & Movie Details API for poster, synopsis, and runtime
 */
async function fetchTmdbDetails(title, originalTitle) {
  if (!TMDB_TOKEN) return null;
  const queries = [title, originalTitle].filter(Boolean);
  for (const q of queries) {
    try {
      const cleanTitle = q
        .replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE|IMAX|CINE PARA TODOS)\b/gi, '')
        .replace(/[-:]/g, ' ')
        .trim();
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
        let duration = null;
        if (result.id) {
          try {
            const detailRes = await fetch(`https://api.themoviedb.org/3/movie/${result.id}?language=es-MX`, {
              headers: {
                'Authorization': `Bearer ${TMDB_TOKEN}`,
                'Accept': 'application/json'
              }
            });
            if (detailRes.ok) {
              const detail = await detailRes.json();
              if (detail.runtime && detail.runtime > 0) {
                duration = `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m`;
              }
            }
          } catch {
            // ignore detail error
          }
        }
        return {
          tmdbId: result.id,
          poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
          synopsis: result.overview ? result.overview.trim() : null,
          duration
        };
      }
    } catch {
      // shortcut: silent fallback on network/rate limit
    }
  }
  return null;
}

/**
 * Main scraper function for Studio Cinemas
 */
export async function scrapeStudio() {
  console.log('Scraping Studio Cinemas (City Place Santa Ana) showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/studio-data.json');

  try {
    const commonData = {
    token_access: '4jH6k-3m.b@s_T8',
    database: 'produccion',
    sqlQuery: '',
    type: ''
  };

  const moviesRes = await fetch('https://showtime.rdghub.com/api/v2/cineverse/getAllMoviesDataBaseCineverse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...commonData, getStatus: 'active' })
  });

  if (!moviesRes.ok) {
    throw new Error(`Failed to fetch Studio Cinemas movies: ${moviesRes.statusText}`);
  }

  const moviesJson = await moviesRes.json();
  const rawMovies = moviesJson.data || [];

  // Generate 7-day window
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const movies = [];

  for (const rawMovie of rawMovies) {
    const movieId = rawMovie.id_master_movie_tb;
    const title = rawMovie.name_master_movie_tb;

    // Aggregate shifts across all dates this week
    const allShifts = [];
    for (const dateStr of dates) {
      try {
        const shiftRes = await fetch('https://showtime.rdghub.com/api/v2/cineverse/getShiftsByMasterMovieIdAndDate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...commonData,
            fechaTanda: dateStr,
            horaEnvio: '00:00:00',
            activeMovieId: movieId
          })
        });
        if (shiftRes.ok) {
          const shiftJson = await shiftRes.json();
          if (Array.isArray(shiftJson.data)) {
            allShifts.push(...shiftJson.data);
          }
        }
      } catch (err) {
        console.warn(`Warning: failed to fetch shifts for movie ${movieId} on ${dateStr}:`, err.message);
      }
    }

    // Skip movies with 0 sessions this week (e.g. far future pre-sales like Avengers or Dune)
    if (allShifts.length === 0) continue;

    // Group showtimes by format and language
    const groupMap = new Map();

    for (const s of allShifts) {
      const format = (s.technology_name_shifts_bp || '2D').toUpperCase();
      const isSub = (s.voiceover_movie_bp || '').toUpperCase().includes('SUB') || (s.name_movie_bp || '').toUpperCase().includes('SUB');
      const language = isSub ? 'SUB' : 'DOB';
      const groupKey = `${format}-${language}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          format,
          language,
          times: []
        });
      }

      const dateStr = s.date_time_shifts_bp;
      const timeStr = (s.start_time_shifts_bp || '').slice(0, 5);

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

    // Extract fallback metadata from rawMovie
    let originalTitle = title;
    let fallbackDuration = 'N/A';
    let rating = 'TP';
    let synopsis = `Funciones de ${title} en Studio Cinemas City Place Santa Ana.`;

    // Try finding detail in types -> movies
    if (Array.isArray(rawMovie.types)) {
      for (const t of rawMovie.types) {
        if (Array.isArray(t.movies) && t.movies[0]) {
          const mInfo = t.movies[0];
          if (mInfo.original_title_info_movie_bp) originalTitle = mInfo.original_title_info_movie_bp;
          if (mInfo.duration_info_movie_bp) {
            const mins = parseInt(mInfo.duration_info_movie_bp, 10);
            if (!isNaN(mins) && mins > 0) {
              fallbackDuration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
            }
          }
          if (mInfo.classification_info_movie_bp) rating = mInfo.classification_info_movie_bp;
          break;
        }
      }
    }

    if (Array.isArray(rawMovie.contents)) {
      const descContent = rawMovie.contents.find(c => c.h1_description_content_tb && c.h1_description_content_tb.length > 20);
      if (descContent) synopsis = descContent.h1_description_content_tb;
    }

    const movie = {
      id: `studio-${normalizeTitleKey(title)}`,
      title,
      originalTitle,
      synopsis,
      poster: null,
      rating,
      duration: fallbackDuration,
      genres: ['Cine'],
      theaters: [
        {
          chainId: 'studio',
          chainName: 'Studio Cinemas',
          complexId: 'studio-santa-ana',
          complexName: 'Studio Cinemas (City Place)',
          province: 'San José',
          city: 'Santa Ana',
          address: 'City Place Santa Ana, Radial Santa Ana - San Antonio de Belén, San José',
          groups
        }
      ]
    };

    movies.push(movie);
  }

  // Enrich with TMDb details (poster, synopsis, runtime duration)
  console.log(`Enriching ${movies.length} Studio Cinemas movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
    if (tmdbData) {
      if (tmdbData.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis && (!movie.synopsis || movie.synopsis.startsWith('Funciones de'))) {
        movie.synopsis = tmdbData.synopsis;
      }
      if (tmdbData.duration) movie.duration = tmdbData.duration;
      console.log(`  ✓ TMDb: ${movie.title} (${movie.duration})`);
    } else {
      console.log(`  - Local Studio data: ${movie.title} (${movie.duration})`);
    }
  }

    const outDir = path.resolve(__dirname, '../src/data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'studio-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} Studio Cinemas movies to ${outFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: Studio Cinemas scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('scrape-studio.js')) {
  scrapeStudio()
    .then(movies => {
      console.log(`Done! Extracted ${movies.length} movies.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during scrapeStudio:', err);
      process.exit(1);
    });
}
