/**
 * Cinemark Costa Rica Scraper
 * Uses Cinemark Central America's official Vista REST API
 * Enriched with TMDb movie posters (with Wikipedia fallback)
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

// Cinemark theaters in Costa Rica
const THEATERS = [
  { id: '2204', name: 'City Mall Alajuela', province: 'Alajuela', locationDetail: 'Alajuela, Radial' },
  { id: '773', name: 'Multiplaza Curridabat', province: 'San José', locationDetail: 'Curridabat, Multiplaza del Este' },
  { id: '770', name: 'Multiplaza Escazú', province: 'San José', locationDetail: 'Escazú, Multiplaza' },
  { id: '2210', name: 'Playground Oxígeno', province: 'Heredia', locationDetail: 'San Francisco de Heredia' }
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function parseVersion(title) {
  const upper = title.toUpperCase();
  const isSub = upper.includes('SUB');
  const language = isSub ? 'SUB' : 'DOB';

  let format = '2D';
  if (upper.includes('4DX')) format = '4DX';
  else if (upper.includes('IMAX')) format = 'IMAX';
  else if (upper.includes('XD')) format = 'XD';
  else if (upper.includes('DBOX') || upper.includes('D-BOX')) format = 'D-BOX';
  else if (upper.includes('3D')) format = '3D';
  else if (upper.includes('PRE') || upper.includes('VIP')) format = 'VIP';

  return { format, language };
}

async function fetchBillboard(theaterId) {
  const url = `https://api.cinemarkca.com/api/vista/data/billboard?cinema_id=${theaterId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch theater ${theaterId}: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Query TMDb Search API for poster and synopsis
 */
async function fetchTmdbDetails(title) {
  if (!TMDB_TOKEN) return null;
  try {
    const cleanTitle = title.replace(/\b(2D|3D|XD|DOB|SUB|PRE|IV|-CR)\b/gi, '').trim();
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&language=es-MX`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TMDB_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = (data.results || []).find(m => m.poster_path || m.overview);
    if (result) {
      return {
        poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
        synopsis: result.overview ? result.overview.trim() : null
      };
    }
  } catch (err) {
    // shortcut: silent fallback on network/rate limit
  }
  return null;
}

/**
 * Wikipedia API Fallback
 */
async function fetchWikipediaPoster(title) {
  try {
    const cleanTitle = title.replace(/\b(2D|3D|XD|DOB|SUB|PRE|IV|-CR)\b/gi, '').trim();
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
  } catch (err) {
    // shortcut: silent fallback
  }
  return null;
}

export async function scrapeCinemark() {
  console.log('Scraping Cinemark Costa Rica showtimes...');
  const movieMap = new Map();

  // Filter window: today through next 7 days (current cinema week)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999);

  for (const theater of THEATERS) {
    console.log(`Fetching ${theater.name} (ID: ${theater.id})...`);
    try {
      const datesData = await fetchBillboard(theater.id);
      if (!Array.isArray(datesData)) continue;

      for (const dayEntry of datesData) {
        const dateStr = dayEntry.date;
        const entryDate = new Date(`${dateStr}T00:00:00`);
        // Skip dates beyond 7 days (presales, next month releases)
        if (entryDate < today || entryDate > maxDate) continue;

        const rawMovies = dayEntry.movies || [];

        for (const rawMovie of rawMovies) {
          // Group by corporate_film_id (same movie across regular/VIP complexes)
          const movieId = rawMovie.corporate_film_id || rawMovie.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
          
          if (!movieMap.has(movieId)) {
            movieMap.set(movieId, {
              id: movieId,
              title: rawMovie.title,
              originalTitle: rawMovie.synopsis_alt || rawMovie.title,
              studio: 'Cinemark',
              rating: rawMovie.rating || 'TP',
              ratingBadgeClass: (rawMovie.rating && rawMovie.rating.includes('18')) ? 'badge-red' : (rawMovie.rating && rawMovie.rating.includes('15')) ? 'badge-orange' : 'badge-green',
              score: '8.0',
              duration: rawMovie.runtime ? `${Math.floor(rawMovie.runtime / 60)}h ${rawMovie.runtime % 60}m` : 'N/A',
              director: (rawMovie.cast || []).find(c => c.PersonType === 'Director') ? `${(rawMovie.cast.find(c => c.PersonType === 'Director').FirstName || '')} ${(rawMovie.cast.find(c => c.PersonType === 'Director').LastName || '')}`.trim() : 'N/A',
              genres: [rawMovie.genre, rawMovie.genre2, rawMovie.genre3].filter(Boolean),
              poster: rawMovie.graphic_url || '',
              synopsis: rawMovie.synopsis || 'Sin sinopsis disponible.',
              theaters: []
            });
          }

          const movie = movieMap.get(movieId);
          let complex = movie.theaters.find(t => t.complexId === `cmk-${theater.id}`);

          if (!complex) {
            complex = {
              complexId: `cmk-${theater.id}`,
              chainId: 'cinemark',
              chainName: 'Cinemark',
              complexName: theater.name,
              province: theater.province,
              locationDetail: theater.locationDetail,
              website: 'https://www.cinemarkca.com/costa-rica',
              groups: []
            };
            movie.theaters.push(complex);
          }

          for (const version of rawMovie.movie_versions || []) {
            const { format, language } = parseVersion(version.title);
            const sessions = (version.sessions || []).map(s => {
              const timeParts = s.hour ? s.hour.split(':') : (s.showtime ? s.showtime.split('T')[1].split(':') : ['00', '00']);
              return {
                time: `${timeParts[0]}:${timeParts[1]}`,
                date: s.day || dateStr
              };
            }).filter(s => {
              const sDate = new Date(`${s.date}T00:00:00`);
              return sDate >= today && sDate <= maxDate;
            });

            if (sessions.length > 0) {
              // Group into existing section if same format and language already exists for this complex
              let group = complex.groups.find(g => g.format === format && g.language === language);
              if (!group) {
                group = {
                  format,
                  language,
                  times: []
                };
                complex.groups.push(group);
              }
              group.times.push(...sessions);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error scraping theater ${theater.name}:`, err.message);
    }
  }

  const movies = Array.from(movieMap.values()).filter(m => m.theaters.length > 0);

  // Sort showtimes chronologically within each format/language group
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

  // Enrich with TMDb posters and synopsis (Wikipedia fallback for poster)
  console.log(`Enriching ${movies.length} movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.originalTitle || movie.title);
    if (tmdbData) {
      if (tmdbData.poster && !movie.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
      console.log(`  ✓ TMDb (poster & synopsis): ${movie.title}`);
    } else {
      if (!movie.poster) {
        const wikiPoster = await fetchWikipediaPoster(movie.originalTitle || movie.title);
        if (wikiPoster) {
          movie.poster = wikiPoster;
          console.log(`  ✓ Wikipedia (poster): ${movie.title}`);
        } else {
          console.log(`  - Fallback SVG: ${movie.title}`);
        }
      }
    }
  }

  const outDir = path.resolve(__dirname, '../src/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'cinemark-data.json');
  fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
  console.log(`Saved ${movies.length} movies to ${outFile}`);
  return movies;
}

if (process.argv[1] && process.argv[1].endsWith('scrape-cinemark.js')) {
  scrapeCinemark();
}
