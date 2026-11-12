/**
 * CCM Cinemas Costa Rica Scraper
 * Uses CCM Cinemas official JSON endpoints (/Funciones/GetPeliculasPorComplejo & /Funciones/GetFunciones)
 * Enriched with TMDb movie posters & synopses (with Wikipedia fallback)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTmdbDetails } from './tmdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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





export async function scrapeCcm() {
  console.log('Scraping CCM Cinemas Costa Rica showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/ccm-data.json');

  try {
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

  // Enrich strictly with TMDb details (no proprietary cinema metadata)
  console.log(`Enriching ${movies.length} CCM movies strictly with TMDb details...`);
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

    const outFile = path.join(outDir, 'ccm-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} CCM movies to ${outFile}`);
    }
    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: CCM Cinemas scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

if (process.argv[1] && process.argv[1].endsWith('scrape-ccm.js')) {
  scrapeCcm();
}
