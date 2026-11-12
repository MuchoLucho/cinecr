import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCinemark } from './scrape-cinemark.js';
import { scrapeCinepolis } from './scrape-cinepolis.js';
import { scrapeCcm } from './scrape-ccm.js';
import { scrapeNova } from './scrape-nova.js';
import { scrapeMagaly } from './scrape-magaly.js';
import { scrapeSanPedro } from './scrape-sanpedro.js';
import { scrapeStudio } from './scrape-studio.js';
import { scrapeCitiCinemas } from './scrape-citicinemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GENRE_CANONICAL_MAP = {
  // Animación
  'animacion': 'Animación',
  'animada': 'Animación',
  'animadas': 'Animación',
  'animado': 'Animación',
  'animados': 'Animación',
  'animation': 'Animación',
  'animated': 'Animación',

  // Acción
  'accion': 'Acción',
  'action': 'Acción',

  // Ciencia Ficción
  'ciencia ficcion': 'Ciencia Ficción',
  'scifi': 'Ciencia Ficción',
  'sci fi': 'Ciencia Ficción',

  // Fantasía
  'fantasia': 'Fantasía',
  'fantasy': 'Fantasía',

  // Suspenso / Thriller
  'suspenso': 'Suspenso',
  'suspense': 'Suspenso',
  'thriller': 'Suspenso',

  // Comedia
  'comedia': 'Comedia',
  'comedy': 'Comedia',

  // Drama
  'drama': 'Drama',

  // Terror
  'terror': 'Terror',
  'horror': 'Terror',

  // Aventura
  'aventura': 'Aventura',
  'aventuras': 'Aventura',
  'adventure': 'Aventura',

  // Familiar / Niños
  'ninos': 'Familiar',
  'niños': 'Familiar',
  'kids': 'Familiar',
  'infantil': 'Familiar',
  'familiar': 'Familiar',
  'family': 'Familiar',

  // Romance
  'romance': 'Romance',
  'romantica': 'Romance',
  'romantico': 'Romance',

  // Música
  'musical': 'Música',
  'musica': 'Música',
  'concierto': 'Música',

  // Documental
  'documental': 'Documental',
  'documentary': 'Documental',

  // Independiente
  'independiente': 'Independiente',
  'indie': 'Independiente',

  // Crimen / Policial
  'crimen': 'Crimen',
  'crime': 'Crimen',
  'policiaco': 'Crimen',
  'policial': 'Crimen',

  // Misterio
  'misterio': 'Misterio',
  'mystery': 'Misterio',

  // Bélica / Guerra
  'belica': 'Bélica',
  'guerra': 'Bélica',
  'war': 'Bélica',

  // Historia
  'historia': 'Historia',
  'historico': 'Historia',
  'history': 'Historia',

  // Western
  'western': 'Western'
};

const USELESS_GENRES = new Set([
  'cine',
  'pelicula',
  'película',
  'general',
  'todos',
  'n/a',
  'otro',
  'otros'
]);

const KNOWN_TITLE_GENRES = {
  'planchadespecho': ['Música'],
  'conciertoplanchadespecho': ['Música'],
  'odisea': ['Aventura', 'Acción', 'Fantasía'],
  'sensatezysentimientos': ['Drama', 'Romance'],
  'entregaallimite': ['Acción', 'Comedia', 'Suspenso']
};

function normalizeGenreKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cleanGenres(genresList, titleKey = '') {
  if (!Array.isArray(genresList)) genresList = [];
  const normalized = [];

  for (const raw of genresList) {
    if (!raw || typeof raw !== 'string') continue;
    const key = normalizeGenreKey(raw);
    if (!key || USELESS_GENRES.has(key)) continue;

    if (GENRE_CANONICAL_MAP[key]) {
      normalized.push(GENRE_CANONICAL_MAP[key]);
    } else {
      normalized.push(raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1));
    }
  }

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0 && titleKey && KNOWN_TITLE_GENRES[titleKey]) {
    return [...KNOWN_TITLE_GENRES[titleKey]];
  }
  return unique;
}

function normalizeTitleKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const CHAIN_WEBSITES = {
  cinemark: 'https://www.cinemarkca.com/costa-rica',
  cinepolis: 'https://cinepolis.co.cr',
  ccm: 'https://www.ccmcinemas.com',
  nova: 'https://www.novacinemas.cr',
  magaly: 'https://www.cinemagaly.com',
  sanpedro: 'https://cinemasanpedro.com',
  studio: 'https://www.studiocinemascr.com',
  citicinemas: 'https://www.citicinemascr.com'
};

function getRatingBadgeClass(ratingStr) {
  if (!ratingStr) return 'badge-green';
  const r = (ratingStr || '').toUpperCase();
  if (r.includes('18')) return 'badge-red';
  if (r.includes('15')) return 'badge-orange';
  if (r.includes('12')) return 'badge-amber';
  return 'badge-green';
}

export function mergeDatasets(...datasets) {
  const mergedMap = new Map();

  for (const movieList of datasets) {
    if (!Array.isArray(movieList)) continue;
    for (const incoming of movieList) {
      const key = normalizeTitleKey(incoming.title);
      if (!key) continue;

      let existingKey = mergedMap.has(key) ? key : null;

      // Match by identical TMDb poster, substring title key, or prefix
      if (!existingKey) {
        const incomingTmdbPoster = incoming.poster && incoming.poster.includes('image.tmdb.org') ? incoming.poster : null;
        for (const [k, existingMovie] of mergedMap.entries()) {
          if (incomingTmdbPoster && existingMovie.poster === incomingTmdbPoster) {
            existingKey = k;
            break;
          }
          if (k.length > 5 && key.length > 5 && (k.includes(key) || key.includes(k))) {
            existingKey = k;
            break;
          }
          if (k.length >= 8 && key.length >= 8 && k.slice(0, 8) === key.slice(0, 8)) {
            existingKey = k;
            break;
          }
        }
      }

      if (existingKey) {
        const existing = mergedMap.get(existingKey);
        for (const t of incoming.theaters) {
          const found = existing.theaters.find(et => et.complexId === t.complexId);
          if (!found) {
            existing.theaters.push(t);
          }
        }

        // Upgrade poster if existing is placeholder/svg or missing and incoming has a better one
        if ((!existing.poster || existing.poster.includes('data:image') || existing.poster.includes('poster-not-found') || !existing.poster.includes('image.tmdb.org')) && incoming.poster && incoming.poster.includes('image.tmdb.org')) {
          existing.poster = incoming.poster;
        } else if (!existing.poster && incoming.poster) {
          existing.poster = incoming.poster;
        }

        // Prefer richer synopsis
        if ((!existing.synopsis || existing.synopsis.startsWith('Sin sinopsis')) && incoming.synopsis && !incoming.synopsis.startsWith('Sin sinopsis')) {
          existing.synopsis = incoming.synopsis;
        }

        if ((existing.duration === 'N/A' || !existing.duration) && incoming.duration && incoming.duration !== 'N/A') {
          existing.duration = incoming.duration;
        }

        if ((existing.director === 'N/A' || !existing.director) && incoming.director && incoming.director !== 'N/A') {
          existing.director = incoming.director;
        }

        if ((!existing.rating || existing.rating === 'TP') && incoming.rating && incoming.rating !== 'TP') {
          existing.rating = incoming.rating;
        }
        existing.ratingBadgeClass = existing.ratingBadgeClass || getRatingBadgeClass(existing.rating);

        // Union genres and chains
        existing.genres = cleanGenres([...(existing.genres || []), ...(incoming.genres || [])], existingKey);
        const chainNames = Array.from(new Set(existing.theaters.map(t => t.chainName)));
        existing.studio = chainNames.join(' / ');
      } else {
        mergedMap.set(key, {
          ...incoming,
          ratingBadgeClass: incoming.ratingBadgeClass || getRatingBadgeClass(incoming.rating),
          genres: cleanGenres(incoming.genres, key),
          normalizedKey: key,
          theaters: [...incoming.theaters]
        });
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  merged.sort((a, b) => a.title.localeCompare(b.title));

  for (const movie of merged) {
    for (const t of movie.theaters || []) {
      if (!t.website) {
        t.website = CHAIN_WEBSITES[t.chainId] || 'https://cinecr.pages.dev';
      }
    }
  }

  return merged;
}

const STATUS_FILE = path.resolve(__dirname, '../src/data/scraping-status.json');

function loadStatus() {
  if (fs.existsSync(STATUS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    } catch {
      // ignore
    }
  }
  return { lastRun: new Date().toISOString(), chains: {} };
}

function countShowtimes(moviesList) {
  if (!Array.isArray(moviesList)) return 0;
  return moviesList.reduce((acc, m) =>
    acc + (m.theaters || []).reduce((tAcc, t) =>
      tAcc + (t.groups || []).reduce((gAcc, g) =>
        gAcc + (g.times || []).length, 0), 0), 0);
}

function getCacheFileMtimeIso(cacheFileName) {
  try {
    const p = path.resolve(__dirname, `../src/data/${cacheFileName}`);
    if (fs.existsSync(p)) {
      return fs.statSync(p).mtime.toISOString();
    }
  } catch {
    // ignore
  }
  return new Date().toISOString();
}

async function safeScrape(chainId, name, scraperFn, cacheFileName, statusData) {
  const existing = statusData.chains[chainId] || {};
  let fallbackMovies = [];

  try {
    const results = await scraperFn();
    if (Array.isArray(results) && results.length > 0) {
      statusData.chains[chainId] = {
        id: chainId,
        name,
        status: 'healthy',
        lastSuccess: new Date().toISOString(),
        moviesCount: results.length,
        showtimesCount: countShowtimes(results)
      };
      return results;
    }
  } catch (err) {
    console.warn(`⚠️ Warning: Scraping failed for ${name}: ${err.message}`);
  }

  // Graceful fallback to cached data file
  try {
    const cacheFile = path.resolve(__dirname, `../src/data/${cacheFileName}`);
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`ℹ️ [Fallback] Loaded ${cached.length} cached movies for ${name} from ${cacheFileName}`);
        fallbackMovies = cached;
      }
    }
  } catch (cacheErr) {
    console.warn(`Could not load cache for ${name}: ${cacheErr.message}`);
  }

  // Mark chain as warning with fallback data, retaining previous lastSuccess timestamp
  statusData.chains[chainId] = {
    ...existing,
    id: chainId,
    name,
    status: 'warning',
    note: 'Respaldo en uso (reintento pendiente)',
    lastSuccess: existing.lastSuccess || getCacheFileMtimeIso(cacheFileName),
    moviesCount: fallbackMovies.length,
    showtimesCount: countShowtimes(fallbackMovies)
  };

  return fallbackMovies;
}

export async function scrapeAll() {
  console.log('=== Starting full CineCR scrape (Cinemark + Cinépolis + CCM + Nova + Magaly + San Pedro + Studio + CitiCinemas) ===');
  const statusData = loadStatus();

  const [
    cinemarkMovies,
    cinepolisMovies,
    ccmMovies,
    novaMovies,
    magalyMovies,
    sanPedroMovies,
    studioMovies,
    citiMovies
  ] = await Promise.all([
    safeScrape('cinemark', 'Cinemark', scrapeCinemark, 'cinemark-data.json', statusData),
    safeScrape('cinepolis', 'Cinépolis', scrapeCinepolis, 'cinepolis-data.json', statusData),
    safeScrape('ccm', 'CCM Cinemas', scrapeCcm, 'ccm-data.json', statusData),
    safeScrape('nova', 'Nova Cinemas', scrapeNova, 'nova-data.json', statusData),
    safeScrape('magaly', 'Cine Magaly', scrapeMagaly, 'magaly-data.json', statusData),
    safeScrape('sanpedro', 'Cinema San Pedro', scrapeSanPedro, 'sanpedro-data.json', statusData),
    safeScrape('studio', 'Studio Cinemas', scrapeStudio, 'studio-data.json', statusData),
    safeScrape('citicinemas', 'CitiCinemas', scrapeCitiCinemas, 'citicinemas-data.json', statusData)
  ]);

  const merged = mergeDatasets(cinemarkMovies, cinepolisMovies, ccmMovies, novaMovies, magalyMovies, sanPedroMovies, studioMovies, citiMovies);
  const outDir = path.resolve(__dirname, '../src/data');
  const outFile = path.join(outDir, 'movies-data.json');
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`=== Successfully merged ${merged.length} total movies saved to ${outFile} ===`);

  statusData.lastRun = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf-8');
  console.log(`=== Scraping health status updated to ${STATUS_FILE} ===`);

  return merged;
}

if (process.argv[1] && process.argv[1].endsWith('scrape.js')) {
  if (process.argv.includes('--merge-only')) {
    const dataDir = path.resolve(__dirname, '../src/data');
    const cm = JSON.parse(fs.readFileSync(path.join(dataDir, 'cinemark-data.json'), 'utf8'));
    const cp = JSON.parse(fs.readFileSync(path.join(dataDir, 'cinepolis-data.json'), 'utf8'));
    const ccm = JSON.parse(fs.readFileSync(path.join(dataDir, 'ccm-data.json'), 'utf8'));
    const nova = JSON.parse(fs.readFileSync(path.join(dataDir, 'nova-data.json'), 'utf8'));
    const magaly = JSON.parse(fs.readFileSync(path.join(dataDir, 'magaly-data.json'), 'utf8'));
    const sanpedro = JSON.parse(fs.readFileSync(path.join(dataDir, 'sanpedro-data.json'), 'utf8'));
    const studio = JSON.parse(fs.readFileSync(path.join(dataDir, 'studio-data.json'), 'utf8'));
    const citicinemas = JSON.parse(fs.readFileSync(path.join(dataDir, 'citicinemas-data.json'), 'utf8'));
    const merged = mergeDatasets(cm, cp, ccm, nova, magaly, sanpedro, studio, citicinemas);
    fs.writeFileSync(path.join(dataDir, 'movies-data.json'), JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Merged ${merged.length} movies to movies-data.json`);

    const statusData = loadStatus();
    const chainDatasets = [
      { id: 'cinemark', name: 'Cinemark', file: 'cinemark-data.json', data: cm },
      { id: 'cinepolis', name: 'Cinépolis', file: 'cinepolis-data.json', data: cp },
      { id: 'ccm', name: 'CCM Cinemas', file: 'ccm-data.json', data: ccm },
      { id: 'nova', name: 'Nova Cinemas', file: 'nova-data.json', data: nova },
      { id: 'magaly', name: 'Cine Magaly', file: 'magaly-data.json', data: magaly },
      { id: 'sanpedro', name: 'Cinema San Pedro', file: 'sanpedro-data.json', data: sanpedro },
      { id: 'studio', name: 'Studio Cinemas', file: 'studio-data.json', data: studio },
      { id: 'citicinemas', name: 'CitiCinemas', file: 'citicinemas-data.json', data: citicinemas }
    ];
    for (const c of chainDatasets) {
      const existing = statusData.chains[c.id] || {};
      statusData.chains[c.id] = {
        id: c.id,
        name: c.name,
        status: existing.status || 'healthy',
        lastSuccess: existing.lastSuccess || getCacheFileMtimeIso(c.file),
        moviesCount: c.data.length,
        showtimesCount: countShowtimes(c.data)
      };
    }
    statusData.lastRun = new Date().toISOString();
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf8');
    console.log(`Scraping status updated to ${STATUS_FILE}`);
  } else {
    scrapeAll();
  }
}
