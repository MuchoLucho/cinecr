import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCinemark } from './scrape-cinemark.js';
import { scrapeCinepolis } from './scrape-cinepolis.js';
import { scrapeCcm } from './scrape-ccm.js';
import { scrapeNova } from './scrape-nova.js';
import { scrapeMagaly } from './scrape-magaly.js';
import { scrapeSanPedro } from './scrape-sanpedro.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeTitleKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
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

        // Union genres and chains
        existing.genres = Array.from(new Set([...(existing.genres || []), ...(incoming.genres || [])])).filter(Boolean);
        const chainNames = Array.from(new Set(existing.theaters.map(t => t.chainName)));
        existing.studio = chainNames.join(' / ');
      } else {
        mergedMap.set(key, {
          ...incoming,
          normalizedKey: key,
          theaters: [...incoming.theaters]
        });
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  merged.sort((a, b) => a.title.localeCompare(b.title));

  return merged;
}

export async function scrapeAll() {
  console.log('=== Starting full CineCR scrape (Cinemark + Cinépolis + CCM + Nova + Magaly + San Pedro) ===');
  const [cinemarkMovies, cinepolisMovies, ccmMovies, novaMovies, magalyMovies, sanPedroMovies] = await Promise.all([
    scrapeCinemark(),
    scrapeCinepolis(),
    scrapeCcm(),
    scrapeNova(),
    scrapeMagaly(),
    scrapeSanPedro()
  ]);

  const merged = mergeDatasets(cinemarkMovies, cinepolisMovies, ccmMovies, novaMovies, magalyMovies, sanPedroMovies);
  const outDir = path.resolve(__dirname, '../src/data');
  const outFile = path.join(outDir, 'movies-data.json');
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`=== Successfully merged ${merged.length} total movies saved to ${outFile} ===`);
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
    const merged = mergeDatasets(cm, cp, ccm, nova, magaly, sanpedro);
    fs.writeFileSync(path.join(dataDir, 'movies-data.json'), JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Merged ${merged.length} movies to movies-data.json`);
  } else {
    scrapeAll();
  }
}
