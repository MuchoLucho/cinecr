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
  'shrek 25 aniversario': 'Shrek',
  'yo soy rocky': 'I Play Rocky'
};

export function getCleanSearchTitle(rawTitle) {
  if (!rawTitle) return '';
  const lower = rawTitle.toLowerCase().trim();
  if (TITLE_ALIASES[lower] !== undefined) return TITLE_ALIASES[lower];
  if (lower.startsWith('24tcf - ')) {
    const sub = lower.replace('24tcf - ', '').trim();
    if (TCF_MAP[sub]) return TCF_MAP[sub];
    return sub;
  }
  return rawTitle
    .replace(/\b(2D|3D|XD|VIP|DOB|SUB|PRE|IMAX|Gratuito)\b/gi, '')
    .replace(/[-:]/g, ' ')
    .trim();
}

/**
 * Fetch movie details strictly from TMDb API.
 * Never returns cinema-scraped proprietary content.
 */
export async function fetchTmdbDetails(title, originalTitle) {
  if (!token) return null;

  const queries = [
    getCleanSearchTitle(title),
    originalTitle ? getCleanSearchTitle(originalTitle) : null
  ].filter(Boolean);

  for (const q of queries) {
    if (!q) continue;
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
      const first = (data.results || []).find(r => r.poster_path || r.overview);
      if (!first || !first.id) continue;

      // Query detailed metadata with credits & translations
      const detailUrl = `https://api.themoviedb.org/3/movie/${first.id}?language=es-MX&append_to_response=credits,translations`;
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
