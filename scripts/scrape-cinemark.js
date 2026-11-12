/**
 * Cinemark Costa Rica Scraper
 * Uses Cinemark Central America's official Vista REST API
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cinemark theaters in Costa Rica (from https://cinemarkmedia.modyocdn.com/ca/api/theatres.json)
const THEATERS = [
  { id: '2204', name: 'City Mall Alajuela', province: 'Alajuela', locationDetail: 'Alajuela, Radial' },
  { id: '773', name: 'Multiplaza Curridabat', province: 'San José', locationDetail: 'Curridabat, Multiplaza del Este' },
  { id: '770', name: 'Multiplaza Escazú', province: 'San José', locationDetail: 'Escazú, Multiplaza' },
  { id: '2210', name: 'Playground Oxígeno', province: 'Heredia', locationDetail: 'San Francisco de Heredia' }
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function parseVersion(title) {
  const upper = title.toUpperCase();
  const isSub = upper.includes('SUB');
  const language = isSub ? 'SUB' : 'DOB';

  let format = '2D';
  if (upper.includes('4DX')) format = '4DX';
  else if (upper.includes('IMAX')) format = 'IMAX';
  else if (upper.includes('XD')) format = 'XD';
  else if (upper.includes('DBOX') || upper.includes('D-BOX')) format = 'D-BOX';
  else if (upper.includes('3D')) format = '3D';
  else if (upper.includes('PRE') || upper.includes('VIP')) format = 'VIP';

  return { format, language };
}

async function fetchBillboard(theaterId) {
  const url = `https://api.cinemarkca.com/api/vista/data/billboard?cinema_id=${theaterId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch theater ${theaterId}: ${res.statusText}`);
  }

  return await res.json();
}

export async function scrapeCinemark() {
  console.log('Scraping Cinemark Costa Rica showtimes...');
  const movieMap = new Map();

  for (const theater of THEATERS) {
    console.log(`Fetching ${theater.name} (ID: ${theater.id})...`);
    try {
      const datesData = await fetchBillboard(theater.id);
      if (!Array.isArray(datesData)) continue;

      for (const dayEntry of datesData) {
        const date = dayEntry.date;
        const rawMovies = dayEntry.movies || [];

        for (const rawMovie of rawMovies) {
          // Group by corporate_film_id (same movie across regular/VIP complexes) or fallback to normalized title
          const movieId = rawMovie.corporate_film_id || rawMovie.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
          
          if (!movieMap.has(movieId)) {
            movieMap.set(movieId, {
              id: movieId,
              title: rawMovie.title,
              originalTitle: rawMovie.synopsis_alt || rawMovie.title,
              studio: 'Cinemark',
              rating: rawMovie.rating || 'TP',
              ratingBadgeClass: (rawMovie.rating && rawMovie.rating.includes('18')) ? 'badge-red' : (rawMovie.rating && rawMovie.rating.includes('15')) ? 'badge-orange' : 'badge-green',
              score: '8.0',
              duration: rawMovie.runtime ? `${Math.floor(rawMovie.runtime / 60)}h ${rawMovie.runtime % 60}m` : 'N/A',
              director: (rawMovie.cast || []).find(c => c.PersonType === 'Director') ? `${(rawMovie.cast.find(c => c.PersonType === 'Director').FirstName || '')} ${(rawMovie.cast.find(c => c.PersonType === 'Director').LastName || '')}`.trim() : 'N/A',
              genres: [rawMovie.genre, rawMovie.genre2, rawMovie.genre3].filter(Boolean),
              poster: rawMovie.graphic_url || '',
              synopsis: rawMovie.synopsis || 'Sin sinopsis disponible.',
              theaters: []
            });
          }

          const movie = movieMap.get(movieId);
          let complex = movie.theaters.find(t => t.complexId === `cmk-${theater.id}`);

          if (!complex) {
            complex = {
              complexId: `cmk-${theater.id}`,
              chainId: 'cinemark',
              chainName: 'Cinemark',
              complexName: theater.name,
              province: theater.province,
              locationDetail: theater.locationDetail,
              website: 'https://www.cinemarkca.com/costa-rica',
              groups: []
            };
            movie.theaters.push(complex);
          }

          for (const version of rawMovie.movie_versions || []) {
            const { format, language } = parseVersion(version.title);
            const sessions = (version.sessions || []).map(s => {
              const timeParts = s.hour ? s.hour.split(':') : (s.showtime ? s.showtime.split('T')[1].split(':') : ['00', '00']);
              return {
                time: `${timeParts[0]}:${timeParts[1]}`,
                occupancy: (s.seats_available < 30) ? 'Alta' : (s.seats_available < 80) ? 'Media' : 'Baja',
                date: s.day || date
              };
            });

            if (sessions.length > 0) {
              complex.groups.push({
                format,
                language,
                auditorium: version.film_HOPK || '1',
                times: sessions
              });
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error scraping theater ${theater.name}:`, err.message);
    }
  }

  const movies = Array.from(movieMap.values()).filter(m => m.theaters.length > 0);
  const outDir = path.resolve(__dirname, '../src/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'cinemark-data.json');
  fs.writeFileSync(outFile, JSON.stringify(movies, null, 2), 'utf-8');
  console.log(`Saved ${movies.length} movies to ${outFile}`);
  return movies;
}

// shortcut: self-executing if run directly via node, upgrade to CLI commander if options needed
if (process.argv[1] && process.argv[1].endsWith('scrape-cinemark.js')) {
  scrapeCinemark();
}
