/**
 * Cinépolis Costa Rica Scraper
 * Uses official Cinépolis Costa Rica CinemaWorld REST API
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

// Theaters mapping in Costa Rica (consolidating regular + VIP complexes in same mall)
const THEATERS = [
  { id: 1625, complexId: 'cpl-lincoln', name: 'Cinépolis Lincoln', province: 'San José', locationDetail: 'Moravia, Plaza Lincoln' },
  { id: 1626, complexId: 'cpl-lincoln', name: 'Cinépolis Lincoln', province: 'San José', locationDetail: 'Moravia, Plaza Lincoln' },
  { id: 1622, complexId: 'cpl-multicentro', name: 'Cinépolis Multicentro', province: 'San José', locationDetail: 'Desamparados, Multicentro' },
  { id: 1623, complexId: 'cpl-paseo-flores', name: 'Cinépolis Paseo De Las Flores', province: 'Heredia', locationDetail: 'Heredia, Paseo de las Flores' },
  { id: 1621, complexId: 'cpl-paseo-metropoli', name: 'Cinépolis Paseo Metrópoli', province: 'Cartago', locationDetail: 'Cartago, Paseo Metrópoli' },
  { id: 1627, complexId: 'cpl-terramall', name: 'Cinépolis TerraMall', province: 'Cartago', locationDetail: 'Tres Ríos, TerraMall' },
  { id: 1628, complexId: 'cpl-terramall', name: 'Cinépolis TerraMall', province: 'Cartago', locationDetail: 'Tres Ríos, TerraMall' },
  { id: 1624, complexId: 'cpl-terrazas-lindora', name: 'Cinépolis Terrazas Lindora VIP', province: 'San José', locationDetail: 'Santa Ana, Terrazas Lindora' }
];

function parseVersion(formatRaw) {
  const upper = (formatRaw || '').toUpperCase();
  const isSub = upper.includes('SUB');
  const language = isSub ? 'SUB' : 'DOB';

  let format = '2D';
  if (upper.includes('4DX')) format = '4DX';
  else if (upper.includes('IMAX')) format = 'IMAX';
  else if (upper.includes('XE') || upper.includes('MACRO')) format = 'MACRO XE';
  else if (upper.includes('VIP')) format = 'VIP';
  else if (upper.includes('3D')) format = '3D';
  else if (upper.includes('JUNIOR')) format = 'JUNIOR';

  return { format, language };
}

function normalizeTitleKey(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const TCF_MAP = {
  'soloilusion': 'Juste une illusion',
  'abandonado': "L'Abandon",
  'crimen3erpiso': 'Le crime du 3e étage',
  'desconocidogranarco': "L'inconnu de la Grande Arche",
  'meencontraste': "L'âme idéale",
  'camino': 'Compostelle'
};

/**
 * Query TMDb Search API for poster, synopsis, and runtime
 */
async function fetchTmdbDetails(title) {
  if (!TMDB_TOKEN) return null;
  try {
    const cleanTitle = title.replace(/\b(2D|3D|XD|XE|VIP|DOB|SUB|PRE|IV|-CR|24TCF)\b/gi, '').replace(/[-:]/g, ' ').trim();
    const normKey = normalizeTitleKey(cleanTitle);
    const queries = [cleanTitle];
    if (TCF_MAP[normKey]) {
      queries.unshift(TCF_MAP[normKey]);
    }

    for (const q of queries) {
      const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&language=es-MX`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TMDB_TOKEN}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = (data.results || []).find(m => m.poster_path || m.overview || m.id);
      if (result) {
        let duration = null;
        let synopsis = result.overview ? result.overview.trim() : null;
        let poster = result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;

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
              if (detail.overview) synopsis = detail.overview.trim();
              if (detail.poster_path) poster = `https://image.tmdb.org/t/p/w500${detail.poster_path}`;
            }

            // Fallback: check translations if synopsis is empty
            if (!synopsis) {
              const transRes = await fetch(`https://api.themoviedb.org/3/movie/${result.id}/translations`, {
                headers: {
                  'Authorization': `Bearer ${TMDB_TOKEN}`,
                  'Accept': 'application/json'
                }
              });
              if (transRes.ok) {
                const transData = await transRes.json();
                const esTrans = (transData.translations || []).find(t => t.iso_639_1 === 'es' && t.data && t.data.overview);
                if (esTrans) {
                  synopsis = esTrans.data.overview.trim();
                } else {
                  const enTrans = (transData.translations || []).find(t => t.iso_639_1 === 'en' && t.data && t.data.overview);
                  if (enTrans) synopsis = enTrans.data.overview.trim();
                }
              }
            }
          } catch {
            // ignore detail error
          }
        }
        return {
          tmdbId: result.id,
          poster,
          synopsis,
          duration
        };
      }
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
    const cleanTitle = title.replace(/\b(2D|3D|XD|XE|VIP|DOB|SUB|PRE|IV|-CR|24TCF)\b/gi, '').trim();
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

export async function scrapeCinepolis() {
  console.log('Scraping Cinépolis Costa Rica showtimes...');
  const cacheFile = path.resolve(__dirname, '../src/data/cinepolis-data.json');

  try {
    const movieMap = new Map();

  // Load sites-data catalog for genres and additional metadata
  let catalogMovies = [];
  try {
    const sitesRes = await fetch('https://cinepolis.co.cr/wp-json/mapi/v1/sites-data', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (sitesRes.ok) {
      const sitesData = await sitesRes.json();
      catalogMovies = sitesData.movies || [];
    }
  } catch (err) {
    console.warn('Warning: could not fetch Cinépolis catalog metadata:', err.message);
  }

  // Current cinema week: today through next 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  for (const theater of THEATERS) {
    console.log(`Fetching ${theater.name} (Site ${theater.id})...`);
    for (const dateStr of dates) {
      try {
        const url = `https://cinepolis.co.cr/wp-json/cw/v1/movie/events-options?cinema=${theater.id}&events_date=${dateStr}&current_edi=&view_options=&page_experience=&post_type=&is_test=false`;
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT }
        });
        if (!res.ok) continue;
        const html = await res.json();
        if (typeof html !== 'string') continue;

        // Split by movie block
        const blocks = html.split(/<div class="movie-projection /);
        for (let b = 1; b < blocks.length; b++) {
          const block = blocks[b];
          const titleMatch = block.match(/<h2>([^<]+)<\/h2>/);
          if (!titleMatch) continue;
          const rawTitle = titleMatch[1].trim();

          // Normalization key for title
          const key = normalizeTitleKey(rawTitle);
          if (!key) continue;

          // Poster from Cinépolis CDN
          const posterMatch = block.match(/<div class="poster-wrapper">\s*<img[^>]+src="([^"]+)"/);
          const rawPoster = posterMatch ? posterMatch[1] : '';

          // Meta text (rating and duration)
          const metaMatch = block.match(/<span class="movie-projection__inner--meta">([\s\S]*?)<\/span>/);
          const metaText = metaMatch ? metaMatch[1].trim() : '';
          const metaParts = metaText.split('|').map(s => s.trim());
          const rating = metaParts[0] || 'TP';
          const runtimeStr = metaParts.find(p => /minutes/i.test(p));
          let duration = 'N/A';
          if (runtimeStr) {
            const mins = parseInt(runtimeStr, 10);
            if (!isNaN(mins)) duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
          }

          // Catalog metadata lookup
          const catMovie = catalogMovies.find(m => normalizeTitleKey(m.webName) === key);
          const genres = (catMovie && catMovie.cats && catMovie.cats.length > 0)
            ? catMovie.cats
            : ['Cine'];

          if (!movieMap.has(key)) {
            movieMap.set(key, {
              id: `cpl-${key}`,
              normalizedKey: key,
              title: rawTitle,
              originalTitle: rawTitle,
              studio: 'Cinépolis',
              rating,
              ratingBadgeClass: rating.includes('18') ? 'badge-red' : rating.includes('15') ? 'badge-orange' : rating.includes('12') ? 'badge-amber' : 'badge-green',
              score: '8.0',
              duration,
              director: 'N/A',
              genres,
              poster: rawPoster,
              synopsis: 'Sin sinopsis disponible.',
              theaters: []
            });
          }

          const movie = movieMap.get(key);
          let complex = movie.theaters.find(t => t.complexId === theater.complexId);
          if (!complex) {
            complex = {
              complexId: theater.complexId,
              chainId: 'cinepolis',
              chainName: 'Cinépolis',
              complexName: theater.name,
              province: theater.province,
              locationDetail: theater.locationDetail,
              website: 'https://cinepolis.co.cr',
              groups: []
            };
            movie.theaters.push(complex);
          }

          // Parse showtime input sessions
          const inputMatches = [...block.matchAll(/<input[^>]+data-format="([^"]+)"[^>]+data-room="([^"]+)"[^>]+data-show-date="([^"]+)"[^>]+data-show-time="([^"]+)"/g)];
          for (const m of inputMatches) {
            const formatRaw = m[1];
            const sessionDate = m[3] || dateStr;
            const sessionTime = m[4];

            const { format, language } = parseVersion(formatRaw);

            let group = complex.groups.find(g => g.format === format && g.language === language);
            if (!group) {
              group = {
                format,
                language,
                times: []
              };
              complex.groups.push(group);
            }

            const exists = group.times.some(t => t.time === sessionTime && t.date === sessionDate);
            if (!exists) {
              group.times.push({
                time: sessionTime,
                date: sessionDate
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching ${theater.name} on ${dateStr}:`, err.message);
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
  console.log(`Enriching ${movies.length} Cinépolis movies with TMDb details...`);
  for (const movie of movies) {
    const tmdbData = await fetchTmdbDetails(movie.title);
    if (tmdbData) {
      if (tmdbData.poster) movie.poster = tmdbData.poster;
      if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
      if (tmdbData.duration) movie.duration = tmdbData.duration;
      console.log(`  ✓ TMDb: ${movie.title}`);
    } else {
      if (!movie.poster) {
        const wikiPoster = await fetchWikipediaPoster(movie.title);
        if (wikiPoster) {
          movie.poster = wikiPoster;
          console.log(`  ✓ Wikipedia: ${movie.title}`);
        }
      }
    }
  }

    const outDir = path.resolve(__dirname, '../src/data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, 'cinepolis-data.json');
    if (movies.length > 0) {
      fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Saved ${movies.length} Cinépolis movies to ${outFile}`);
    }
    return movies;
  } catch (err) {
    console.warn(`⚠️ Warning: Cinépolis scrape error (${err.message}). Falling back to cached data.`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    return [];
  }
}

if (process.argv[1] && process.argv[1].endsWith('scrape-cinepolis.js')) {
  scrapeCinepolis();
}
