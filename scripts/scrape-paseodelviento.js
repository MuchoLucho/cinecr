/**
 * Cinema Paseo del Viento (Tilarán, Guanacaste) Scraper
 * Scrapes showtimes from Cinema Paseo del Viento
 * Source: https://paseodelvientocinema.com/Cartelera.aspx?complejo=460
 * Enriched with TMDb movie details
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchTmdbDetails } from './tmdb.js';

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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function normalizeTitleKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cleanMovieTitle(raw) {
  if (!raw) return '';
  let t = raw.trim()
    .replace(/\s+ENG[\/\s]+(?:W\/)?SUB\b/gi, '')
    .replace(/\s+W\/SUB\b/gi, '')
    .replace(/\s+SUB\b/gi, '')
    .replace(/\s+DOB\b/gi, '')
    .replace(/\s+3D\b/gi, '')
    .replace(/\s+2D\b/gi, '')
    .replace(/:\s*/g, ': ')
    .trim();
  if (t === t.toUpperCase()) {
    t = t.toLowerCase().replace(/(^|[:\s\-\(\)])([a-zñáéíóúü])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  }
  return t;
}

function parseRating(str) {
  if (!str) return 'TP';
  const r = str.toUpperCase();
  if (r.includes('18')) return 'M18';
  if (r.includes('15')) return 'M15';
  if (r.includes('12')) return 'M12';
  return 'TP';
}

function fetchWithCurl(url) {
  return execSync(
    `curl -sL "${url}" -H "User-Agent: ${USER_AGENT}" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
  ).toString();
}

/**
 * Calculates the exact ISO date (YYYY-MM-DD) for a cinema week day name (Jueves..Miércoles)
 * relative to the current America/Costa_Rica cinema programming week (Thursday to Wednesday).
 */
function getCinemaWeekDate(dayName) {
  if (!dayName) return null;
  const norm = dayName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const dayIndexMap = {
    jueves: 0,
    viernes: 1,
    sabado: 2,
    domingo: 3,
    lunes: 4,
    martes: 5,
    miercoles: 6
  };
  const targetDayIdx = dayIndexMap[norm];
  if (targetDayIdx === undefined) return null;

  const now = new Date();
  const crFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = crFormatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type)?.value;
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10) - 1;
  const day = parseInt(getPart('day'), 10);

  const crDate = new Date(Date.UTC(year, month, day));
  const dow = crDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat

  // Cinema programming week begins on Thursday (dow=4)
  const daysSinceThursday = (dow >= 4) ? (dow - 4) : (dow + 3);
  const thursDate = new Date(Date.UTC(year, month, day - daysSinceThursday));
  const targetDate = new Date(thursDate.getTime() + targetDayIdx * 24 * 60 * 60 * 1000);

  const tYear = targetDate.getUTCFullYear();
  const tMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const tDay = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${tYear}-${tMonth}-${tDay}`;
}

function isSubtitled(langText, title) {
  if (/INGL[EÉ]S/i.test(langText)) return true;
  if (/subtitulad[ao]/i.test(langText)) return true;
  if (/\bSUB\b/i.test(langText)) return true;
  if (/\b(SUB|W\/SUB|ENG[\/\s]+(?:W\/)?SUB)\b/i.test(title)) return true;
  return false;
}

export async function scrapePaseoDelViento() {
  console.log('Scraping Cinema Paseo del Viento (Tilarán, Guanacaste)...');
  const cacheFile = path.resolve(__dirname, '../src/data/paseodelviento-data.json');

  try {
    let html = '';
    const carteleraUrl = 'https://paseodelvientocinema.com/Cartelera.aspx?complejo=460';
    try {
      const res = await fetch(carteleraUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      // Fallback to curl
      html = fetchWithCurl(carteleraUrl);
    }

    if (!html || !html.includes('combopelicartelerasemana')) {
      throw new Error('Could not fetch cartelera HTML from Paseo del Viento');
    }

    const movieMap = new Map();
    const partsSemana = html.split(/class=\"[^\"]*combopelicartelerasemana\"/);

    for (let i = 1; i < partsSemana.length; i++) {
      const p = partsSemana[i].split('combopelicartelerasemana')[0];
      const h2 = ((p.match(/<h2>(.*?)<\/h2>/) || [])[1] || '').trim();
      const h3 = ((p.match(/<h3>(.*?)<\/h3>/) || [])[1] || '').trim();
      if (!h2) continue;

      const cleanTitle = cleanMovieTitle(h2);
      const normKey = normalizeTitleKey(cleanTitle);

      const langText = ((p.match(/<div class=\"icosdetalle\">[\s\S]*?<p>(.*?)<\/p>/) || [])[1] || '');
      const language = isSubtitled(langText, h2) ? 'SUB' : 'DOB';

      const ratingRaw = ((p.match(/<div class=\"icosdetalle\">[\s\S]*?<p>\s*(\+?\s*\d+|TP|MAYORES\s*\d+)\s*<\/p>/i) || [])[1] || '');
      const rating = parseRating(ratingRaw);

      let movie = movieMap.get(normKey);
      if (!movie) {
        movie = {
          id: `paseodelviento-${normKey}`,
          title: cleanTitle,
          originalTitle: h3 || cleanTitle,
          synopsis: 'Sin sinopsis disponible.',
          poster: null,
          rating,
          duration: 'N/A',
          score: null,
          director: 'N/A',
          genres: ['Acción'],
          theaters: [
            {
              chainId: 'paseodelviento',
              chainName: 'Paseo del Viento',
              complexId: 'paseodelviento-tilaran',
              complexName: 'Cinema Paseo del Viento',
              province: 'Guanacaste',
              city: 'Tilarán',
              address: 'Del Costado Norte del Parque central de Tilarán, 125 mts oeste. Guanacaste, Tilarán',
              locationDetail: 'Tilarán',
              website: 'https://paseodelvientocinema.com/Cartelera.aspx?complejo=460',
              groups: []
            }
          ]
        };
        movieMap.set(normKey, movie);
      }

      const theater = movie.theaters[0];
      const dayUls = [...p.matchAll(/<ul class=\"horarioscartelera\">([\s\S]*?)<\/ul>/g)].map(m => m[1]);

      for (const ul of dayUls) {
        const day = (ul.match(/<li class=\"dias\">([^<]+)<\/li>/) || [])[1] || '';
        const dateStr = getCinemaWeekDate(day);
        if (!dateStr) continue;

        const timeLis = [...ul.matchAll(/<li class=\"func-horario\"[^>]*>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
        for (const timeStr of timeLis) {
          const match = timeStr.match(/(\d{1,2}:\d{2})/);
          if (!match) continue;
          const time = match[1];
          const format = (timeStr.includes('3D') || h2.includes('3D')) ? '3D' : '2D';

          let group = theater.groups.find(g => g.format === format && g.language === language);
          if (!group) {
            group = { format, language, times: [] };
            theater.groups.push(group);
          }

          if (!group.times.some(t => t.date === dateStr && t.time === time)) {
            group.times.push({ date: dateStr, time });
          }
        }
      }
    }

    // Sort times chronologically
    for (const movie of movieMap.values()) {
      for (const group of movie.theaters[0].groups) {
        group.times.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      }
    }

    const movies = Array.from(movieMap.values()).filter(m => m.theaters[0].groups.some(g => g.times.length > 0));
    console.log(`Found ${movies.length} unique movies on Cinema Paseo del Viento...`);

    // Enrich strictly with TMDb details
    console.log(`Enriching ${movies.length} Paseo del Viento movies with TMDb details...`);
    for (const movie of movies) {
      const tmdbData = await fetchTmdbDetails(movie.title, movie.originalTitle);
      if (tmdbData) {
        if (tmdbData.poster) movie.poster = tmdbData.poster;
        if (tmdbData.synopsis) movie.synopsis = tmdbData.synopsis;
        if (tmdbData.duration) movie.duration = tmdbData.duration;
        if (tmdbData.score) movie.score = tmdbData.score;
        if (tmdbData.director) movie.director = tmdbData.director;
        if (tmdbData.genres?.length) movie.genres = tmdbData.genres;
        console.log(`  ✓ TMDb: ${movie.title} (${movie.duration}, ★ ${movie.score || 'N/A'})`);
      } else {
        movie.poster = null;
        movie.synopsis = 'Sin sinopsis disponible.';
        movie.duration = 'N/A';
        movie.score = null;
        movie.director = 'N/A';
      }
    }

    if (movies.length > 0) {
      fs.writeFileSync(cacheFile, JSON.stringify(movies, null, 2), 'utf-8');
      console.log(`Paseo del Viento: Saved ${movies.length} movies to ${cacheFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`Paseo del Viento scrape error: ${err.message}`);
    if (fs.existsSync(cacheFile)) {
      console.log(`Paseo del Viento: Returning cached data from ${cacheFile}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    return [];
  }
}

// CLI test runner
if (process.argv[1] && process.argv[1].endsWith('scrape-paseodelviento.js')) {
  scrapePaseoDelViento().then(movies => {
    console.log(`Finished Paseo del Viento scrape. Total movies: ${movies.length}`);
  });
}
