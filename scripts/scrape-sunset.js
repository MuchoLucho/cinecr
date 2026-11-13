/**
 * Sunset Cinema Jacó Costa Rica Scraper
 * Scrapes showtimes from Sunset Cinema (Plaza Coral, Jacó, Puntarenas)
 * Source: https://sunsetcinemajaco.com/cartelera/ & entradas.sunsetcinemajaco.com
 * Enriched with TMDb movie details
 */
import fs from 'node:fs';
import path from 'node:path';
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

function normalizeTitleKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(la|el|los|las|de|del|con|un|una|unos|unas|the|a|an|en|parte)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseRating(str) {
  if (!str) return 'TP';
  const r = str.toUpperCase();
  if (r.includes('18')) return 'M18';
  if (r.includes('15')) return 'M15';
  if (r.includes('12')) return 'M12';
  return 'TP';
}

function parseFormatLang(fmtStr) {
  const s = (fmtStr || '').toUpperCase();
  const format = s.includes('3D') ? '3D' : '2D';
  const language = (s.includes('SUB') || s.includes('ING')) ? 'SUB' : 'DOB';
  return { format, language };
}

function parseSpansFromHtml(html) {
  const sections = html.split(/<div\s+class=[\x27"]ListaTandasH3Calendario[\x27"]>/).slice(1);
  const results = [];

  for (const sec of sections) {
    const fmtMatch = sec.match(/<span\s+class=\s*[\x27"]ListatandasCalendario[\x27"]>([^<]+)<\/span>/i);
    const { format, language } = parseFormatLang(fmtMatch ? fmtMatch[1] : 'Dig 2D, Dob');

    const spanMatches = [...sec.matchAll(/spanClick\(\s*([\x27"]\d+[\x27"][^)]+)\)/gi)].map(m => m[1]);
    for (const spanArgs of spanMatches) {
      const parts = spanArgs.split(',').map(p => p.trim().replace(/^[\x27"]|[\x27"]$/g, ''));
      if (parts.length >= 10 && parts[2]?.length === 8) {
        const rawDate = parts[2]; // YYYYMMDD
        const isoDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
        const rawTime = parts[9]; // HH:mm:ss
        if (rawTime && rawTime.includes(':')) {
          const time = rawTime.slice(0, 5);
          results.push({ format, language, date: isoDate, time });
        }
      }
    }
  }

  return results;
}

export async function scrapeSunset() {
  console.log('Scraping Sunset Cinema (Jacó, Puntarenas)...');
  const cacheFile = path.resolve(__dirname, '../src/data/sunset-data.json');

  try {
    const cartRes = await fetch('https://entradas.sunsetcinemajaco.com/SitioWebJaco/WSCcmCompraLinea.asmx/getCartelera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'ID1=54&ID2=1'
    });

    if (!cartRes.ok) {
      throw new Error(`Failed to fetch Sunset Cinema cartelera: ${cartRes.statusText}`);
    }

    const rawMovies = await cartRes.json();
    if (!Array.isArray(rawMovies) || rawMovies.length === 0) {
      throw new Error('Sunset Cinema returned empty movies array');
    }

    console.log(`Found ${rawMovies.length} movies on Sunset Cinema Jacó...`);
    const movies = [];

    for (const raw of rawMovies) {
      const title = (raw.NombrePelicula || '').trim();
      const movieLink = raw.DataLink || 'https://sunsetcinemajaco.com/cartelera/';
      if (!title || !raw.DataLink) continue;

      let pageHtml = '';
      try {
        const pageRes = await fetch(raw.DataLink);
        if (pageRes.ok) {
          pageHtml = await pageRes.text();
        }
      } catch (pageErr) {
        console.warn(`Could not fetch showtime page for ${title}: ${pageErr.message}`);
        continue;
      }

      if (!pageHtml) continue;

      const ratingMatch = pageHtml.match(/id="ContentPlaceHolder1_lblCensura"[^>]*>([^<]+)<\/span>/i);
      const rating = parseRating(ratingMatch ? ratingMatch[1] : '');

      const vs = pageHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1] || '';
      const vsg = pageHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/)?.[1] || '';
      const ev = pageHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/)?.[1] || '';

      const dayOptions = [...pageHtml.matchAll(/<option(?: selected="selected")? value="(\d+)">([^<]+)<\/option>/g)].map(o => ({
        val: o[1],
        text: o[2]
      }));

      const allShows = [];
      // Day 1
      allShows.push(...parseSpansFromHtml(pageHtml));

      // Fetch other days (days 2..N)
      for (let i = 1; i < dayOptions.length; i++) {
        const opt = dayOptions[i];
        try {
          const params = new URLSearchParams();
          params.append('__VIEWSTATE', vs);
          params.append('__VIEWSTATEGENERATOR', vsg);
          params.append('__EVENTVALIDATION', ev);
          params.append('ctl00$ContentPlaceHolder1$DropDown_Dias_Esquema', opt.val);
          params.append('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$DropDown_Dias_Esquema');

          const postRes = await fetch(raw.DataLink, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          if (postRes.ok) {
            const postHtml = await postRes.text();
            allShows.push(...parseSpansFromHtml(postHtml));
          }
        } catch {
          // continue with remaining days
        }
      }

      // Group by format and language
      const groupMap = new Map();
      for (const s of allShows) {
        const k = `${s.format}_${s.language}`;
        if (!groupMap.has(k)) {
          groupMap.set(k, { format: s.format, language: s.language, times: [] });
        }
        groupMap.get(k).times.push({ date: s.date, time: s.time });
      }

      const groups = Array.from(groupMap.values()).map(g => {
        const seen = new Set();
        const uniqueTimes = [];
        for (const t of g.times) {
          const key = `${t.date}_${t.time}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueTimes.push(t);
          }
        }
        uniqueTimes.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        return {
          format: g.format,
          language: g.language,
          times: uniqueTimes
        };
      }).filter(g => g.times.length > 0);

      if (groups.length === 0) continue;

      const movie = {
        id: `sunset-${normalizeTitleKey(title)}`,
        title,
        originalTitle: title,
        synopsis: 'Sin sinopsis disponible.',
        poster: null,
        rating,
        duration: 'N/A',
        score: null,
        director: 'N/A',
        genres: ['Acción'],
        theaters: [
          {
            chainId: 'sunset',
            chainName: 'Sunset Cinema',
            complexId: 'sunset-jaco',
            complexName: 'Sunset Cinema Jacó',
            province: 'Puntarenas',
            city: 'Jacó',
            address: 'Plaza Coral, Jacó, Garabito, Puntarenas',
            locationDetail: 'Plaza Coral, Jacó',
            website: movieLink,
            groups
          }
        ]
      };

      movies.push(movie);
    }

    // Enrich strictly with TMDb details
    console.log(`Enriching ${movies.length} Sunset Cinema Jacó movies with TMDb details...`);
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
      console.log(`Sunset Cinema Jacó: Saved ${movies.length} movies to ${cacheFile}`);
    }

    return movies;
  } catch (err) {
    console.warn(`Sunset Cinema Jacó scrape error: ${err.message}`);
    if (fs.existsSync(cacheFile)) {
      console.log(`Sunset Cinema Jacó: Returning cached data from ${cacheFile}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    return [];
  }
}

// CLI test runner
if (process.argv[1] && process.argv[1].endsWith('scrape-sunset.js')) {
  scrapeSunset().then(movies => {
    console.log(`Finished Sunset Cinema Jacó scrape. Total movies: ${movies.length}`);
  });
}
