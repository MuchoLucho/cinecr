import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let token = process.env.TMDB_READ_ACCESS_TOKEN;
if (!token && fs.existsSync(path.resolve(__dirname, '../.env'))) {
  const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  const m = env.match(/TMDB_READ_ACCESS_TOKEN=(.+)/);
  if (m) token = m[1].trim();
}
if (token && token.startsWith('"') && token.endsWith('"')) {
  token = token.slice(1, -1);
}

export const TCF_MAP = {
  'abandonado': 'En attendant la nuit',
  'el camino': 'Sur les chemins noirs',
  'el crimen del 3er piso': 'Le tableau volé',
  'el desconocido del gran arco': "L'inconnu de la Grande Arche",
  'me encontraste': 'Hors-saison',
  'solo una ilusion': 'Une vie rêvée',
  'sólo una ilusión': 'Une vie rêvée'
};

export const TITLE_ALIASES = {
  'ping pong: el triunfo': 'Ping Pong: The Triumph',
  'ping pong el triunfo': 'Ping Pong: The Triumph',
  'shrek 25 aniversario': 'Shrek'
};

function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a TMDb candidate based on title similarity, recency, and popularity.
 */
function scoreCandidate(candidate, query) {
  const normQ = normalizeText(query);
  const normTitle = normalizeText(candidate.title);
  const normOrig = normalizeText(candidate.original_title);

  let score = 0;

  // Exact title match gets highest priority
  if (normTitle === normQ) {
    score += 100;
  } else if (normOrig === normQ) {
    score += 95;
  } else {
    // Word overlap ratio
    const qWords = normQ.split(' ').filter(w => w.length > 2);
    const tWords = normTitle.split(' ');
    const oWords = normOrig.split(' ');
    const matched = qWords.filter(w => tWords.includes(w) || oWords.includes(w));
    if (qWords.length > 0) {
      score += (matched.length / qWords.length) * 60;
    }
  }

  // Recency bonus: Movies in active theaters are contemporary (current year ± 2 years)
  const currentYear = new Date().getFullYear();
  const year = parseInt((candidate.release_date || '').slice(0, 4), 10);
  if (!isNaN(year)) {
    if (year >= currentYear - 1 && year <= currentYear + 1) {
      score += 25;
    } else if (year >= currentYear - 3) {
      score += 10;
    }
  }

  // Popularity bonus (up to 20 points)
  if (candidate.popularity) {
    score += Math.min(candidate.popularity / 5, 20);
  }

  // Has visual assets
  if (candidate.poster_path) score += 5;
  if (candidate.overview) score += 5;

  return score;
}

/**
 * Clean cinema title by stripping technical projection tags (2D, 3D, DOB, etc.)
 */
export function cleanRawTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE|IMAX|Gratuito|CINE PARA TODOS)\b/gi, '')
    .replace(/[-:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate prioritized list of query strings to search in TMDb
 */
export function getSearchQueries(rawTitle, originalTitle) {
  const queries = [];
  const clean = cleanRawTitle(rawTitle);
  const lower = clean.toLowerCase();

  // 1. Direct clean cinema title
  if (clean) queries.push(clean);

  // 2. Festival translation if prefixed
  if (lower.startsWith('24tcf ')) {
    const sub = lower.replace('24tcf ', '').trim();
    if (TCF_MAP[sub]) queries.push(TCF_MAP[sub]);
  }

  // 3. Explicit alias if defined
  const rawLower = rawTitle.toLowerCase().trim();
  if (TITLE_ALIASES[rawLower]) queries.push(TITLE_ALIASES[rawLower]);
  if (TITLE_ALIASES[lower] && TITLE_ALIASES[lower] !== TITLE_ALIASES[rawLower]) {
    queries.push(TITLE_ALIASES[lower]);
  }

  // 4. Cinema original title if provided
  if (originalTitle) {
    const cleanOrig = cleanRawTitle(originalTitle);
    if (cleanOrig && !queries.includes(cleanOrig)) {
      queries.push(cleanOrig);
    }
  }

  return [...new Set(queries.filter(Boolean))];
}

/**
 * Fetch movie details strictly from TMDb API.
 * Never returns cinema-scraped proprietary content.
 */
export async function fetchTmdbDetails(title, originalTitle) {
  if (!token) return null;

  const queries = getSearchQueries(title, originalTitle);

  for (const q of queries) {
    try {
      const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&language=es-MX`;
      const res = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = (data.results || []).filter(r => r.id);
      if (results.length === 0) continue;

      // Score and rank candidates
      const ranked = results.map(r => ({
        candidate: r,
        score: scoreCandidate(r, q)
      })).sort((a, b) => b.score - a.score);

      const top = ranked[0];
      // Sanity threshold: reject candidates with no meaningful relevance (< 25)
      if (!top || top.score < 25) continue;

      const chosen = top.candidate;

      // Query detailed metadata with credits & translations
      const detailUrl = `https://api.themoviedb.org/3/movie/${chosen.id}?language=es-MX&append_to_response=credits,translations`;
      const detailRes = await fetch(detailUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      // Poster strictly from TMDb CDN
      const poster = detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : null;

      // Synopsis in Spanish (es-MX or any Spanish translation fallback)
      let synopsis = detail.overview ? detail.overview.trim() : null;
      if (!synopsis && detail.translations?.translations) {
        const esTrans = detail.translations.translations.find(t => t.iso_639_1 === 'es');
        if (esTrans?.data?.overview) {
          synopsis = esTrans.data.overview.trim();
        }
      }

      // Duration
      let duration = null;
      if (detail.runtime && detail.runtime > 0) {
        duration = `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m`;
      }

      // Real TMDb score (only if vote_count > 0)
      let score = null;
      if (detail.vote_average && detail.vote_average > 0 && detail.vote_count > 0) {
        score = detail.vote_average.toFixed(1);
      }

      // Director from credits
      let director = null;
      const directors = (detail.credits?.crew || [])
        .filter(c => c.job === 'Director')
        .map(c => c.name);
      if (directors.length > 0) {
        director = directors.join(', ');
      }

      // Genres
      const genres = (detail.genres || []).map(g => g.name);

      return {
        tmdbId: detail.id,
        poster,
        synopsis: synopsis || 'Sin sinopsis disponible.',
        duration: duration || 'N/A',
        score,
        director: director || 'N/A',
        genres
      };
    } catch {
      // ignore network errors
    }
  }

  return null;
}
