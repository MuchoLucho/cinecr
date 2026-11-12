import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCinemark } from './scrape-cinemark.js';
import { scrapeCinepolis } from './scrape-cinepolis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeTitleKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function mergeDatasets(cinemarkMovies, cinepolisMovies) {
  const mergedMap = new Map();

  // 1. Add all Cinemark movies
  for (const cm of cinemarkMovies) {
    const key = normalizeTitleKey(cm.title);
    mergedMap.set(key, {
      ...cm,
      normalizedKey: key,
      theaters: [...cm.theaters]
    });
  }

  // 2. Merge Cinépolis movies
  for (const cp of cinepolisMovies) {
    const key = normalizeTitleKey(cp.title);

    // Look for exact key match or substring match
    let existingKey = mergedMap.has(key) ? key : null;
    if (!existingKey) {
      for (const k of mergedMap.keys()) {
        if (k.length > 5 && key.length > 5 && (k.includes(key) || key.includes(k))) {
          existingKey = k;
          break;
        }
      }
    }

    if (existingKey) {
      const existing = mergedMap.get(existingKey);
      // Combine theaters
      for (const t of cp.theaters) {
        const found = existing.theaters.find(et => et.complexId === t.complexId);
        if (!found) {
          existing.theaters.push(t);
        }
      }

      // Upgrade poster if existing is placeholder/svg or missing and cp has a better one
      if ((!existing.poster || existing.poster.includes('data:image') || existing.poster.includes('poster-not-found')) && cp.poster) {
        existing.poster = cp.poster;
      }

      // Prefer TMDB synopsis if available
      if ((!existing.synopsis || existing.synopsis.startsWith('Sin sinopsis')) && cp.synopsis && !cp.synopsis.startsWith('Sin sinopsis')) {
        existing.synopsis = cp.synopsis;
      }

      // Union genres
      existing.genres = Array.from(new Set([...(existing.genres || []), ...(cp.genres || [])])).filter(Boolean);
      existing.studio = 'Cinemark / Cinépolis';
    } else {
      mergedMap.set(key, {
        ...cp,
        normalizedKey: key,
        theaters: [...cp.theaters]
      });
    }
  }

  const merged = Array.from(mergedMap.values());
  // Sort movies by title
  merged.sort((a, b) => a.title.localeCompare(b.title));

  return merged;
}

export async function scrapeAll() {
  console.log('=== Starting full CineCR scrape (Cinemark + Cinépolis) ===');
  const [cinemarkMovies, cinepolisMovies] = await Promise.all([
    scrapeCinemark(),
    scrapeCinepolis()
  ]);

  const merged = mergeDatasets(cinemarkMovies, cinepolisMovies);
  const outDir = path.resolve(__dirname, '../src/data');
  const outFile = path.join(outDir, 'movies-data.json');
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`=== Successfully merged ${merged.length} total movies saved to ${outFile} ===`);
  return merged;
}

if (process.argv[1] && process.argv[1].endsWith('scrape.js')) {
  // If arguments provide --merge-only, just merge existing json files
  if (process.argv.includes('--merge-only')) {
    const dataDir = path.resolve(__dirname, '../src/data');
    const cm = JSON.parse(fs.readFileSync(path.join(dataDir, 'cinemark-data.json'), 'utf8'));
    const cp = JSON.parse(fs.readFileSync(path.join(dataDir, 'cinepolis-data.json'), 'utf8'));
    const merged = mergeDatasets(cm, cp);
    fs.writeFileSync(path.join(dataDir, 'movies-data.json'), JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Merged ${merged.length} movies to movies-data.json`);
  } else {
    scrapeAll();
  }
}
