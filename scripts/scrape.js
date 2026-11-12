import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCinemark } from './scrape-cinemark.js';
import { scrapeCinepolis } from './scrape-cinepolis.js';
import { scrapeCcm } from './scrape-ccm.js';

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

      // Match by identical TMDb poster or substring title key
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
  console.log('=== Starting full CineCR scrape (Cinemark + Cinépolis + CCM Cinemas) ===');
  const [cinemarkMovies, cinepolisMovies, ccmMovies] = await Promise.all([
    scrapeCinemark(),
    scrapeCinepolis(),
    scrapeCcm()
  ]);

  const merged = mergeDatasets(cinemarkMovies, cinepolisMovies, ccmMovies);
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
    const merged = mergeDatasets(cm, cp, ccm);
    fs.writeFileSync(path.join(dataDir, 'movies-data.json'), JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Merged ${merged.length} movies to movies-data.json`);
  } else {
    scrapeAll();
  }
}
