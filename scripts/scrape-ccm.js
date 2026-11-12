/**
 * CCM Cinemas Costa Rica Scraper
 * Uses CCM Cinemas official JSON endpoints (/Funciones/GetPeliculasPorComplejo & /Funciones/GetFunciones)
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

const THEATERS = [
  { id: 401, complexId: 'ccm-plaza-mayor', name: 'CCM Plaza Mayor', province: 'San José', locationDetail: 'Rohrmoser, Plaza Mayor' },
  { id: 402, complexId: 'ccm-san-ramon', name: 'CCM San Ramón', province: 'Alajuela', locationDetail: 'San Ramón, Alajuela' },
  { id: 403, complexId: 'ccm-san-carlos', name: 'CCM San Carlos', province: 'Alajuela', locationDetail: 'Ciudad Quesada, San Carlos' }
];

const GENRE_MAP = {
  3: 'Acción',
  4: 'Comedia',
  5: 'Animación',
  6: 'Ciencia Ficción',
  7: 'Drama',
  8: 'Terror',
  17: 'Drama'
};

const RATING_MAP = {
  1: { label: 'TP', badge: 'badge-green' },
  2: { label: 'M12', badge: 'badge-amber' },
  3: { label: 'M15', badge: 'badge-orange' },
  4: { label: 'M18', badge: 'badge-red' },
  5: { label: 'TP', badge: 'badge-green' }
};

function parseVersion(copia) {
  const language = copia?.subtitulada ? 'SUB' : 'DOB';
  const rawTech = (copia?.cacheTecnologias?.nomTecnologia || '2D').toUpperCase();

  let format = '2D';
  if (rawTech.includes('4DX')) format = '4DX';
  else if (rawTech.includes('IMAX')) format = 'IMAX';
  else if (rawTech.includes('VIP')) format = 'VIP';
  else if (rawTech.includes('3D')) format = '3D';
  else if (rawTech.includes('DBOX') || rawTech.includes('D-BOX')) format = 'D-BOX';

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
      const cleanTitle = q.replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE)\b/gi, '').trim();
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

async function fetchWikipediaPoster(title) {
  try {
    const cleanTitle = title.replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE)\b/gi, '').trim();
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

export async function scrapeCcm() {
  console.log('Scraping CCM Cinemas Costa Rica showtimes...');
  const movieMap = new Map();

  // Current 7-day cinema week window
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999);

  for (const theater of THEATERS) {
    console.log(`Fetching ${theater.name} (ID: ${theater.id})...`);
    try {
      const listUrl = `https://www.ccmcinemas.com/Funciones/GetPeliculasPorComplejo?codComplejo=${theater.id}`;
      const listRes = await fetch(listUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (!listRes.ok) continue;
      const movieEntries = await listRes.json();
      if (!Array.isArray(movieEntries)) continue;

      const funcionesByMovie = await Promise.all(
        movieEntries.map(async entry => {
          const rawMovie = entry.cachePeliculas;
          if (!rawMovie?.codPelicula) return null;
          try {
            const fnUrl = `https://www.ccmcinemas.com/Funciones/GetFunciones?codComplejo=${theater.id}&idPelicula=${rawMovie.codPelicula}`;
            const fnRes = await fetch(fnUrl, { headers: { 'User-Agent': USER_AGENT } });
            if (!fnRes.ok) return null;
            const funciones = await fnRes.json();
            return { rawMovie, funciones: Array.isArray(funciones) ? funciones : [] };
          } catch {
            return null;
          }
        })
      );

      for (const item of funcionesByMovie) {
        if (!item) continue;
        const { rawMovie, funciones } = item;

        // Filter functions to current 7-day week
        const validFunciones = funciones.filter(fn => {
          if (!fn.fecha || !fn.horaComienzo) return false;
          const dateStr = fn.fecha.split('T')[0];
          const fnDate = new Date(`${dateStr}T00:00:00`);
          return fnDate >= today && fnDate <= maxDate;
        });

        if (validFunciones.length === 0) continue;

        const key = normalizeTitleKey(rawMovie.titulo);
        if (!key) continue;

        const ratingInfo = RATING_MAP[rawMovie.codClasificacion] || { label: 'TP', badge: 'badge-green' };
        const genre = GENRE_MAP[rawMovie.codGenero] || 'Cine';
        const mins = parseInt(rawMovie.duracion, 10);
        const duration = !isNaN(mins) && mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : 'N/A';

        if (!movieMap.has(key)) {
          movieMap.set(key, {
            id: `ccm-${rawMovie.codPelicula}`,
            normalizedKey: key,
            title: rawMovie.titulo.trim(),
            originalTitle: (rawMovie.tituloOriginal || rawMovie.titulo).trim(),
            studio: 'CCM Cinemas',
            rating: ratingInfo.label,
            ratingBadgeClass: ratingInfo.badge,
            score: '8.0',
            duration,
            director: 'N/A',
            genres: [genre],
            poster: rawMovie.filename ? `https://www.ccmcinemas.com/images/posters/${rawMovie.filename}` : '',
            synopsis: (rawMovie.sinopsis || 'Sin sinopsis disponible.').trim(),
            theaters: []
          });
        }

        const movie = movieMap.get(key);
        let complex = movie.theaters.find(t => t.complexId === theater.complexId);
        if (!complex) {
          complex = {
            complexId: theater.complexId,
            chainId: 'ccm',
            chainName: 'CCM Cinemas',
            complexName: theater.name,
            province: theater.province,
            locationDetail: theater.locationDetail,
            website: 'https://www.ccmcinemas.com',
            groups: []
          };
          movie.theaters.push(complex);
        }

        for (const fn of validFunciones) {
          const { format, language } = parseVersion(fn.cacheCopiasPelicula);
          const dateStr = fn.fecha.split('T')[0];
          const timeParts = (fn.horaComienzoAjustada || fn.horaComienzo).split(':');
          const sessionTime = `${timeParts[0].padStart(2, '0')}:${(timeParts[1] || '00').padStart(2, '0')}`;

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
    } catch (err) {
      console.error(`Error scraping ${theater.name}:`, err.message);
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
  console.log(`Enriching ${movies.length} CCM movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
    if (tmdbData) {
      if (tmdbData.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
      if (tmdbData.duration) movie.duration = tmdbData.duration;
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

  const outFile = path.join(outDir, 'ccm-data.json');
  fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
  console.log(`Saved ${movies.length} CCM movies to ${outFile}`);
  return movies;
}

if (process.argv[1] && process.argv[1].endsWith('scrape-ccm.js')) {
  scrapeCcm();
}
