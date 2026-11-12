<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import moviesData from './data/movies-data.json';

const isDark = ref(true);
const toggleTheme = () => {
  isDark.value = !isDark.value;
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
};

onMounted(() => {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
});

const viewMode = ref('movies');
const selectedDate = ref('today');
const onlyPremium = ref(false);
const scheduleSearch = ref('');
const sessionDialog = ref(false);
const sourcesDialog = ref(false);
const activeSession = ref(null);

const availableDates = computed(() => {
  const dates = new Set();
  movies.value.forEach(m => m.theaters.forEach(t => t.groups.forEach(g => g.times.forEach(s => {
    if (s.date) dates.add(s.date);
  }))));

  const sorted = Array.from(dates).sort();
  const options = [];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

  sorted.forEach((dStr, idx) => {
    const parts = dStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    // First date is 'today'
    const value = idx === 0 ? 'today' : dStr;
    const dayLabel = idx === 0 ? 'Hoy' : idx === 1 ? 'Mañana' : `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
    options.push({ label: dayLabel, value, rawDate: dStr });
  });

  // Add 'Toda la semana' as an option
  options.push({ label: 'Toda la semana', value: 'all' });

  return options;
});

// Real chains active in CineCR right now
const chains = [
  {
    id: 'cinemark',
    name: 'Cinemark',
    url: 'https://www.cinemarkca.com/costa-rica',
    complexes: 'City Mall Alajuela, Multiplaza Curridabat, Multiplaza Escazú, Playground Oxígeno Heredia',
    integrationMethod: 'API Vista Live Feed Scraping (JSON)',
    status: 'Activo'
  },
  {
    id: 'cinepolis',
    name: 'Cinépolis',
    url: 'https://cinepolis.co.cr',
    complexes: 'Lincoln, Multicentro, Paseo De Las Flores, Paseo Metrópoli, TerraMall, Terrazas Lindora VIP',
    integrationMethod: 'CinemaWorld REST API Scraping',
    status: 'Activo'
  },
  {
    id: 'ccm',
    name: 'CCM Cinemas',
    url: 'https://www.ccmcinemas.com',
    complexes: 'Plaza Mayor Rohrmoser, San Ramón, San Carlos (Ciudad Quesada)',
    integrationMethod: 'CCM Funciones JSON API Scraping',
    status: 'Activo'
  },
  {
    id: 'nova',
    name: 'Nova Cinemas',
    url: 'https://www.novacinemas.cr',
    complexes: 'Avenida Escazú, Ciudad del Este Curridabat, Plaza Real Alajuela, Plaza Moín Limón, Tamarindo Guanacaste',
    integrationMethod: 'API Vista Central Live Scraping (JSON)',
    status: 'Activo'
  },
  {
    id: 'magaly',
    name: 'Cine Magaly',
    url: 'https://www.cinemagaly.com',
    complexes: 'Barrio La California, San José (Sala Magaly & La Salita)',
    integrationMethod: 'Programación Web API Scraping (JSON)',
    status: 'Activo'
  },
  {
    id: 'sanpedro',
    name: 'Cinema San Pedro',
    url: 'https://cinemasanpedro.com',
    complexes: 'Mall San Pedro (Pisos 3 y 5, San Pedro de Montes de Oca)',
    integrationMethod: 'Schema.org JSON-LD Web Scraping',
    status: 'Activo'
  },
  {
    id: 'studio',
    name: 'Studio Cinemas',
    url: 'https://www.studiocinemascr.com',
    complexes: 'City Place Santa Ana (Radial Santa Ana - Belén)',
    integrationMethod: 'API Cineverse REST Live Scraping (JSON)',
    status: 'Activo'
  },
  {
    id: 'citicinemas',
    name: 'CitiCinemas',
    url: 'https://www.citicinemascr.com',
    complexes: 'Plaza El Ingenio (Plaza Grecia, Alajuela)',
    integrationMethod: 'HTML Web Scraping & Multi-day Tabs',
    status: 'Activo'
  }
];

// Helper to generate dynamic poster artworks
function generatePosterSvg(title, genre, color) {
  const safeTitle = (title || 'CineCR').substring(0, 32);
  const safeGenre = (genre || 'Cine').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>
    <rect width="600" height="900" fill="url(#bg)"/>
    <circle cx="300" cy="380" r="180" fill="${color}" opacity="0.12"/>
    <rect x="220" y="300" width="160" height="160" rx="28" fill="${color}" opacity="0.25"/>
    <text x="300" y="395" font-family="system-ui, sans-serif" font-size="64" font-weight="bold" fill="${color}" text-anchor="middle">🎬</text>
    <text x="300" y="540" font-family="system-ui, sans-serif" font-size="20" letter-spacing="4" font-weight="700" fill="${color}" text-anchor="middle">${safeGenre}</text>
    <text x="300" y="600" font-family="system-ui, sans-serif" font-size="32" font-weight="800" fill="#f8fafc" text-anchor="middle">${safeTitle}</text>
    <rect x="150" y="640" width="300" height="2" fill="url(#accent)" opacity="0.5"/>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const genreColors = {
  'Accion': '#ef4444',
  'Terror': '#dc2626',
  'Comedia': '#f59e0b',
  'Animacion': '#10b981',
  'Drama': '#8b5cf6',
  'Suspenso': '#06b6d4',
  'Aventura': '#3b82f6',
  'Ciencia Ficcion': '#0ea5e9'
};

// Real scraped movies from Cinemark and Cinépolis
const movies = ref(moviesData.map(m => {
  const genre = (m.genres && m.genres[0]) || 'Cine';
  const color = genreColors[genre] || '#f43f5e';
  return {
    ...m,
    poster: m.poster || generatePosterSvg(m.title, genre, color)
  };
}));

// Real provinces where active theaters exist
const provinces = computed(() => {
  const set = new Set();
  movies.value.forEach(m => m.theaters.forEach(t => { if (t.province) set.add(t.province); }));
  return Array.from(set).sort();
});

// Real distinct formats currently on billboard
const formatOptions = computed(() => {
  const set = new Set();
  movies.value.forEach(m => m.theaters.forEach(t => t.groups.forEach(g => { if (g.format) set.add(g.format); })));
  return Array.from(set).sort();
});

const languageOptions = [
  { label: 'Subtitulada (SUB)', value: 'SUB' },
  { label: 'Doblada al Español (DOB)', value: 'DOB' }
];

const filters = reactive({
  movie: null,
  province: null,
  chain: null,
  language: null,
  formats: []
});

const selectedFormatSingle = computed({
  get: () => (filters.formats.length > 0 ? filters.formats[0] : null),
  set: (val) => { filters.formats = val ? [val] : []; }
});

const movieFilterOptions = computed(() =>
  movies.value.map(m => ({ id: m.id, title: m.title }))
);

const filteredMovies = computed(() => {
  return movies.value
    .filter(m => !filters.movie || m.id === filters.movie)
    .map(movie => {
      const groupedTheaters = movie.theaters
        .filter(complex => {
          if (filters.chain && complex.chainId !== filters.chain) return false;
          if (filters.province && complex.province !== filters.province) return false;
          return true;
        })
        .map(complex => {
          const matchingGroups = complex.groups
            .map(g => {
              if (filters.language && g.language !== filters.language) return null;
              if (filters.formats.length > 0 && !filters.formats.includes(g.format)) return null;
              if (onlyPremium.value && !['XD', 'D-BOX', 'VIP', 'IMAX', '4DX', 'MACRO XE', 'LASERMAX', 'ONE'].includes(g.format)) return null;

              const times = g.times.filter(s => {
                if (selectedDate.value === 'all') return true;
                if (selectedDate.value === 'today') {
                  const todayOption = availableDates.value.find(o => o.value === 'today');
                  return s.date === todayOption?.rawDate;
                }
                return s.date === selectedDate.value;
              });

              if (times.length === 0) return null;
              return { ...g, times };
            })
            .filter(Boolean);

          const uniqueFormats = [...new Set(matchingGroups.map(g => g.format))];
          const flatSessions = matchingGroups.flatMap(g => g.times);

          return {
            ...complex,
            groupedByFormatLang: matchingGroups,
            uniqueFormats,
            sessions: flatSessions
          };
        })
        .filter(complex => complex.groupedByFormatLang.length > 0);

      return {
        ...movie,
        groupedTheaters
      };
    })
    .filter(movie => movie.groupedTheaters.length > 0);
});

// Closed by default
const expandedPanels = reactive({});

const isPanelOpen = (movieId, complexId) => {
  return expandedPanels[movieId] && expandedPanels[movieId].includes(complexId);
};

const togglePanel = (movieId, complexId) => {
  const list = expandedPanels[movieId] || [];
  const idx = list.indexOf(complexId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(complexId);
  expandedPanels[movieId] = list;
};

const flatSchedule = computed(() => {
  const items = [];
  const q = (scheduleSearch.value || '').toLowerCase().trim();

  filteredMovies.value.forEach(movie => {
    movie.groupedTheaters.forEach(complex => {
      complex.groupedByFormatLang.forEach(group => {
        group.times.forEach(session => {
          if (q) {
            const haystack = `${movie.title} ${complex.complexName} ${complex.province} ${group.format} ${group.language}`.toLowerCase();
            if (!haystack.includes(q)) return;
          }
          items.push({
            time: session.time,
            movie,
            complex,
            group
          });
        });
      });
    });
  });

  return items.sort((a, b) => a.time.localeCompare(b.time));
});

const totalMatchingShowtimes = computed(() =>
  filteredMovies.value.reduce((acc, m) => acc + countMovieShowtimes(m), 0)
);

const activeComplexCount = computed(() => {
  const ids = new Set();
  filteredMovies.value.forEach(m => m.groupedTheaters.forEach(c => ids.add(c.complexId)));
  return ids.size;
});

const hasActiveFilters = computed(() => Boolean(
  filters.movie || filters.province || filters.chain || filters.language || filters.formats.length > 0 || onlyPremium.value
));

const toggleQuickLanguage = (lang) => {
  filters.language = filters.language === lang ? null : lang;
};

const resetFilters = () => {
  filters.movie = null;
  filters.province = null;
  filters.chain = null;
  filters.language = null;
  filters.formats = [];
  onlyPremium.value = false;
};

const countMovieShowtimes = (movie) =>
  movie.groupedTheaters.reduce((sum, c) => sum + c.sessions.length, 0);

const getAvailableFormatsForMovie = (movie) => {
  const set = new Set();
  movie.theaters.forEach(t => t.groups.forEach(g => set.add(g.format)));
  return [...set];
};

const getChainBadgeClass = (chainId) => {
  if (chainId === 'cinepolis') return 'badge-blue';
  if (chainId === 'ccm') return 'badge-cyan';
  if (chainId === 'nova') return 'badge-green';
  if (chainId === 'magaly') return 'badge-amber';
  if (chainId === 'sanpedro') return 'badge-orange';
  if (chainId === 'studio') return 'badge-purple';
  if (chainId === 'citicinemas') return 'badge-teal';
  return 'badge-red';
};

const getFormatBadgeClass = (format) => {
  const map = {
    'XD': 'badge-red',
    'MACRO XE': 'badge-red',
    '4DX': 'badge-purple',
    'IMAX': 'badge-cyan',
    'LASERMAX': 'badge-purple',
    'ONE': 'badge-teal',
    'D-BOX': 'badge-orange',
    'VIP': 'badge-amber',
    '3D': 'badge-teal',
    '2D': 'badge-grey',
    'JUNIOR': 'badge-green'
  };
  return map[format] || 'badge-blue';
};

const getFormatIcon = (format) => {
  const map = {
    'XD': 'speaker',
    'D-BOX': 'vibration',
    'VIP': 'chair',
    'IMAX': 'theaters',
    'LASERMAX': 'auto_awesome',
    'ONE': 'movie',
    '3D': '3d_rotation',
    '2D': 'theaters'
  };
  return map[format] || 'movie';
};

const getFormatDescription = (format) => {
  const descriptions = {
    'XD': 'Extreme Digital Cinema de Cinemark con pantalla gigante de pared a pared.',
    'D-BOX': 'Asientos con movimiento háptico sincronizado directamente con la película.',
    'VIP': 'Butacas reclinables de alta comodidad.',
    'IMAX': 'Pantalla envolvente IMAX de gran formato y sonido inmersivo.',
    'LASERMAX': 'Proyección láser de ultra alta definición exclusiva de Nova Cinemas.',
    'ONE': 'Sala premium con sonido envolvente y experiencia inmersiva Nova ONE.',
    '3D': 'Proyección tridimensional digital.',
    '2D': 'Proyección digital tradicional en alta definición.'
  };
  return descriptions[format] || 'Proyección digital estándar.';
};

const formatSessionDate = (dateStr) => {
  if (!dateStr) return '';
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return `${dayNames[d.getDay()]} ${d.getDate()}`;
};

const openSessionModal = (movie, complex, group, session) => {
  activeSession.value = { movie, complex, group, session };
  sessionDialog.value = true;
};
</script>

<template>
  <div id="app-root">
    <!-- TOP APP BAR -->
    <header class="md-top-app-bar">
      <div class="md-container md-top-app-bar-inner">
        <div class="brand-group">
          <div class="brand-avatar">
            <span class="material-symbols-outlined lg">theaters</span>
          </div>
          <div>
            <div class="brand-title">
              CineCR
              <span class="md-badge xs badge-red">COSTA RICA</span>
            </div>
            <div class="brand-subtitle">
              Cartelera en tiempo real • Datos 100% reales
            </div>
          </div>
        </div>

        <div class="app-bar-actions">
          <div class="md-segmented-group hide-mobile" role="group">
            <button
              type="button"
              class="md-segmented-btn"
              :class="{ active: viewMode === 'movies' }"
              @click="viewMode = 'movies'"
            >
              <span class="material-symbols-outlined sm" v-if="viewMode === 'movies'">check</span>
              <span class="material-symbols-outlined sm" v-else>movie</span>
              Por Película
            </button>
            <button
              type="button"
              class="md-segmented-btn"
              :class="{ active: viewMode === 'schedule' }"
              @click="viewMode = 'schedule'"
            >
              <span class="material-symbols-outlined sm" v-if="viewMode === 'schedule'">check</span>
              <span class="material-symbols-outlined sm" v-else>schedule</span>
              Cronograma
            </button>
          </div>

          <button type="button" class="md-btn md-btn-tonal md-btn-sm" @click="sourcesDialog = true">
            <span class="material-symbols-outlined sm">hub</span>
            Cines ({{ chains.length }})
          </button>

          <button
            type="button"
            class="md-icon-btn"
            @click="toggleTheme"
            :title="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
          >
            <span class="material-symbols-outlined">
              {{ isDark ? 'light_mode' : 'dark_mode' }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <!-- HERO & FILTER BAR -->
    <section class="hero-section">
      <div class="md-container">
        <div class="hero-grid">
          <div>
            <div class="hero-overline">
              <span class="material-symbols-outlined sm">location_on</span>
              COSTA RICA • CARTELERA REAL EN VIVO
            </div>
            <h1 class="hero-title">Cartelera en Tiempo Real</h1>
            <p class="hero-desc">
              Tandas, formatos de sala (VIP, IMAX, LASERMAX, 4DX, MACRO XE, XD, D-BOX, 3D, 2D) e idiomas (Doblada / Subtitulada) obtenidos directamente desde las plataformas oficiales de Cinemark, Cinépolis, CCM Cinemas, Nova Cinemas, Cine Magaly, Cinema San Pedro, Studio Cinemas y CitiCinemas Costa Rica.
            </p>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value" style="color: #fbbf24;">{{ filteredMovies.length }}</div>
              <div class="stat-label">Películas</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #f87171;">{{ totalMatchingShowtimes }}</div>
              <div class="stat-label">Tandas</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #34d399;">{{ activeComplexCount }}</div>
              <div class="stat-label">Complejos</div>
            </div>
          </div>
        </div>

        <!-- Filter Card -->
        <div class="filter-card">
          <div class="filter-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="md-field">
              <label class="md-field-label">
                <span class="material-symbols-outlined sm">movie</span> Película
              </label>
              <select v-model="filters.movie" class="md-select">
                <option :value="null">Todas las películas ({{ movies.length }})</option>
                <option v-for="m in movieFilterOptions" :key="m.id" :value="m.id">
                  {{ m.title }}
                </option>
              </select>
            </div>

            <div class="md-field">
              <label class="md-field-label">
                <span class="material-symbols-outlined sm">theater_comedy</span> Cadena
              </label>
              <select v-model="filters.chain" class="md-select">
                <option :value="null">Todas las cadenas ({{ chains.length }})</option>
                <option v-for="c in chains" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>

            <div class="md-field">
              <label class="md-field-label">
                <span class="material-symbols-outlined sm">map</span> Provincia
              </label>
              <select v-model="filters.province" class="md-select">
                <option :value="null">Todas las provincias</option>
                <option v-for="p in provinces" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>

            <div class="md-field">
              <label class="md-field-label">
                <span class="material-symbols-outlined sm">translate</span> Idioma
              </label>
              <select v-model="filters.language" class="md-select">
                <option :value="null">Todos los idiomas</option>
                <option v-for="l in languageOptions" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </div>

            <div class="md-field">
              <label class="md-field-label">
                <span class="material-symbols-outlined sm">3d_rotation</span> Formato / Sala
              </label>
              <select v-model="selectedFormatSingle" class="md-select">
                <option :value="null">Todos los formatos</option>
                <option v-for="f in formatOptions" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
          </div>

          <hr class="md-divider" />

          <div class="quick-bar">
            <div class="chip-row">
              <span style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant); margin-right: 4px; font-weight: 500;">
                Fecha:
              </span>
              <button
                v-for="d in availableDates"
                :key="d.value"
                type="button"
                class="md-chip"
                :class="{ selected: selectedDate === d.value }"
                @click="selectedDate = d.value"
              >
                <span v-if="selectedDate === d.value" class="material-symbols-outlined sm">check</span>
                {{ d.label }}
              </button>
            </div>

            <div class="chip-row">
              <button
                type="button"
                class="md-chip"
                :class="{ selected: filters.language === 'SUB' }"
                @click="toggleQuickLanguage('SUB')"
              >
                <span v-if="filters.language === 'SUB'" class="material-symbols-outlined sm">check</span>
                Subtitulada
              </button>
              <button
                type="button"
                class="md-chip"
                :class="{ selected: filters.language === 'DOB' }"
                @click="toggleQuickLanguage('DOB')"
              >
                <span v-if="filters.language === 'DOB'" class="material-symbols-outlined sm">check</span>
                Doblada
              </button>
              <button
                type="button"
                class="md-chip"
                :class="{ selected: onlyPremium }"
                @click="onlyPremium = !onlyPremium"
              >
                <span class="material-symbols-outlined sm">auto_awesome</span>
                Formatos Especiales (VIP, XD, XE, 4DX)
              </button>
              <button
                v-if="hasActiveFilters"
                type="button"
                class="md-btn md-btn-text md-btn-sm"
                @click="resetFilters"
              >
                <span class="material-symbols-outlined sm">filter_alt_off</span>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- MAIN CONTENT -->
    <main class="md-container" style="padding-top: 28px;">
      <div class="show-mobile-only" style="margin-bottom: 20px; display: flex;">
        <div class="md-segmented-group" style="width: 100%;">
          <button
            type="button"
            class="md-segmented-btn"
            style="flex: 1;"
            :class="{ active: viewMode === 'movies' }"
            @click="viewMode = 'movies'"
          >
            <span class="material-symbols-outlined sm">movie</span>
            Por Película
          </button>
          <button
            type="button"
            class="md-segmented-btn"
            style="flex: 1;"
            :class="{ active: viewMode === 'schedule' }"
            @click="viewMode = 'schedule'"
          >
            <span class="material-symbols-outlined sm">schedule</span>
            Cronograma
          </button>
        </div>
      </div>

      <div v-if="totalMatchingShowtimes === 0" class="md-banner">
        <span class="material-symbols-outlined lg">info</span>
        <div>
          <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">
            No se encontraron tandas con los filtros seleccionados
          </div>
          <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 12px;">
            Prueba cambiando el idioma, formato de sala o provincia.
          </div>
          <button type="button" class="md-btn md-btn-filled md-btn-sm" @click="resetFilters">
            Restablecer filtros
          </button>
        </div>
      </div>

      <!-- VIEW 1: MOVIES -->
      <div v-if="viewMode === 'movies'">
        <article v-for="movie in filteredMovies" :key="movie.id" class="md-card">
          <div class="movie-card-grid">
            <div class="movie-sidebar">
              <div class="poster-wrapper">
                <img :src="movie.poster" :alt="movie.title" class="poster-img" />
                <div class="poster-overlay">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="md-badge" :class="movie.ratingBadgeClass">
                      {{ movie.rating }}
                    </span>
                    <span class="md-badge" style="background: rgba(0,0,0,0.8); color: #fbbf24;">
                      <span class="material-symbols-outlined sm filled" style="font-size: 14px;">star</span>
                      {{ movie.score }}
                    </span>
                  </div>
                  <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #fca5a5;">
                      {{ movie.studio }}
                    </div>
                    <div style="font-family: 'Google Sans', sans-serif; font-size: 1.35rem; font-weight: 700; color: #fff; line-height: 1.15;">
                      {{ movie.title }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="chip-row" style="margin-bottom: 12px;">
                <span class="md-badge badge-outline">
                  <span class="material-symbols-outlined sm" style="font-size: 14px;">schedule</span>
                  {{ movie.duration }}
                </span>
                <span v-for="g in movie.genres" :key="g" class="md-badge badge-outline">
                  {{ g }}
                </span>
              </div>

              <p style="font-size: 0.85rem; color: var(--md-sys-color-on-surface-variant); margin: 0 0 16px;">
                {{ movie.synopsis }}
              </p>

              <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--md-sys-color-outline-variant); font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                <div><strong>Director:</strong> {{ movie.director }}</div>
                <div style="margin-top: 4px;">
                  <strong>Formatos en CR:</strong> {{ getAvailableFormatsForMovie(movie).join(' • ') }}
                </div>
              </div>
            </div>

            <div class="movie-content">
              <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px;">
                <div>
                  <h2 style="font-size: 1.35rem; font-weight: 700;">
                    Cartelera disponible — {{ movie.title }}
                  </h2>
                  <div style="font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant);">
                    Mostrando {{ countMovieShowtimes(movie) }} tandas en {{ movie.groupedTheaters.length }} complejos
                  </div>
                </div>

                <div class="chip-row">
                  <span class="md-badge badge-indigo-tonal"><strong>SUB</strong> = Subtitulada</span>
                  <span class="md-badge badge-teal-tonal"><strong>DOB</strong> = Doblada</span>
                </div>
              </div>

              <div
                v-for="complex in movie.groupedTheaters"
                :key="complex.complexId"
                class="md-expansion-panel"
              >
                <button
                  type="button"
                  class="md-expansion-header"
                  @click="togglePanel(movie.id, complex.complexId)"
                >
                  <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <span :class="['md-badge', getChainBadgeClass(complex.chainId)]">
                      {{ complex.chainName }}
                    </span>
                    <div>
                      <div style="font-weight: 700; font-size: 0.98rem;">
                        {{ complex.complexName }}
                      </div>
                      <div style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 3px;">
                        <span class="material-symbols-outlined sm" style="font-size: 14px;">location_on</span>
                        {{ complex.province }} • {{ complex.locationDetail }}
                      </div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span
                      v-for="fmt in complex.uniqueFormats"
                      :key="fmt"
                      class="md-badge xs"
                      :class="getFormatBadgeClass(fmt)"
                    >
                      {{ fmt }}
                    </span>
                    <span class="md-badge xs badge-outline">
                      {{ complex.sessions.length }} tandas
                    </span>
                    <span class="material-symbols-outlined">
                      {{ isPanelOpen(movie.id, complex.complexId) ? 'expand_less' : 'expand_more' }}
                    </span>
                  </div>
                </button>

                <div v-show="isPanelOpen(movie.id, complex.complexId)" class="md-expansion-body">
                  <div
                    v-for="(group, idx) in complex.groupedByFormatLang"
                    :key="idx"
                    class="session-group-row"
                  >
                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                      <span class="md-badge" :class="getFormatBadgeClass(group.format)">
                        <span class="material-symbols-outlined sm" style="font-size: 15px;">
                          {{ getFormatIcon(group.format) }}
                        </span>
                        {{ group.format }}
                      </span>

                      <span
                        class="md-badge"
                        :class="group.language === 'SUB' ? 'badge-indigo-tonal' : 'badge-teal-tonal'"
                      >
                        {{ group.language === 'SUB' ? 'SUBTITULADA' : 'DOBLADA' }}
                      </span>
                    </div>

                    <div class="chip-row">
                      <button
                        v-for="session in group.times"
                        :key="session.time + session.date"
                        type="button"
                        class="showtime-btn"
                        @click="openSessionModal(movie, complex, group, session)"
                      >
                        <span class="material-symbols-outlined sm">calendar_today</span>
                        <span v-if="session.date" style="opacity: 0.75; font-size: 0.78rem; font-weight: 500;">
                          {{ formatSessionDate(session.date) }}
                        </span>
                        <span>{{ session.time }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- VIEW 2: SCHEDULE -->
      <div v-else>
        <div class="md-card">
          <div style="padding: 20px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--md-sys-color-outline-variant);">
            <div>
              <h2 style="font-size: 1.25rem; font-weight: 700;">Cronograma de Tandas</h2>
              <div style="font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant);">
                Horarios cronológicos reales de Cinemark, Cinépolis, CCM, Nova, Magaly, San Pedro, Studio Cinemas y CitiCinemas
              </div>
            </div>
            <div style="min-width: 260px;">
              <input
                v-model="scheduleSearch"
                type="search"
                class="md-input"
                placeholder="Buscar película, complejo o formato..."
              />
            </div>
          </div>

          <div class="md-table-wrapper">
            <table class="md-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Película</th>
                  <th>Complejo</th>
                  <th>Provincia</th>
                  <th>Formato</th>
                  <th>Idioma</th>
                  <th style="text-align: center;">Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in flatSchedule" :key="i">
                  <td style="font-weight: 700; white-space: nowrap;">
                    <span class="material-symbols-outlined sm" style="margin-right: 4px; color: var(--md-sys-color-on-surface-variant);">schedule</span>
                    {{ item.time }}
                  </td>
                  <td>
                    <div style="font-weight: 700;">{{ item.movie.title }}</div>
                    <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">
                      {{ item.movie.rating }} • {{ item.movie.duration }}
                    </div>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span :class="['md-badge xs', getChainBadgeClass(item.complex.chainId)]">
                        {{ item.complex.chainName }}
                      </span>
                      <span style="font-weight: 500;">{{ item.complex.complexName }}</span>
                    </div>
                  </td>
                  <td>{{ item.complex.province }}</td>
                  <td>
                    <span class="md-badge" :class="getFormatBadgeClass(item.group.format)">
                      {{ item.group.format }}
                    </span>
                  </td>
                  <td>
                    <span
                      class="md-badge"
                      :class="item.group.language === 'SUB' ? 'badge-indigo-tonal' : 'badge-teal-tonal'"
                    >
                      {{ item.group.language === 'SUB' ? 'Subtitulada' : 'Doblada' }}
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <button
                      type="button"
                      class="md-btn md-btn-tonal md-btn-sm"
                      @click="openSessionModal(item.movie, item.complex, item.group, { time: item.time, occupancy: item.occupancy })"
                    >
                      Ver Tanda
                      <span class="material-symbols-outlined sm">open_in_new</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <!-- SHOWTIME MODAL -->
    <div v-if="sessionDialog && activeSession" class="md-scrim" @click.self="sessionDialog = false">
      <div class="md-dialog" role="dialog" aria-modal="true">
        <div class="md-dialog-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span :class="['md-badge', getChainBadgeClass(activeSession.complex.chainId)]">
              {{ activeSession.complex.chainName }}
            </span>
            <span style="font-weight: 700; font-size: 1rem;">
              {{ activeSession.complex.complexName }}
            </span>
          </div>
          <button type="button" class="md-icon-btn" @click="sessionDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="md-dialog-body">
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 18px;">
            <img
              :src="activeSession.movie.poster"
              :alt="activeSession.movie.title"
              style="width: 68px; height: 96px; object-fit: cover; border-radius: 12px;"
            />
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 700;">{{ activeSession.movie.title }}</h3>
              <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px;">
                {{ activeSession.movie.rating }} • {{ activeSession.movie.duration }}
              </div>
              <div class="chip-row">
                <span class="md-badge" :class="getFormatBadgeClass(activeSession.group.format)">
                  {{ activeSession.group.format }}
                </span>
                <span
                  class="md-badge"
                  :class="activeSession.group.language === 'SUB' ? 'badge-indigo-tonal' : 'badge-teal-tonal'"
                >
                  {{ activeSession.group.language === 'SUB' ? 'Subtitulada' : 'Doblada' }}
                </span>
              </div>
            </div>
          </div>

          <div style="background-color: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: 16px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">Hora de función</div>
              <div style="font-size: 1.35rem; font-weight: 700; color: var(--md-sys-color-primary);">
                {{ activeSession.session.time }}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">Formato</div>
              <span class="md-badge" :class="getFormatBadgeClass(activeSession.group.format)">
                {{ activeSession.group.format }}
              </span>
            </div>
          </div>

          <div style="font-weight: 700; font-size: 0.875rem; margin-bottom: 4px;">
            Sala ({{ activeSession.group.format }}):
          </div>
          <p style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin: 0;">
            {{ getFormatDescription(activeSession.group.format) }}
          </p>
        </div>

        <div class="md-dialog-actions">
          <button type="button" class="md-btn md-btn-text" @click="sessionDialog = false">
            Cerrar
          </button>
          <a
            class="md-btn md-btn-filled"
            :href="activeSession.complex.website"
            target="_blank"
            rel="noopener"
          >
            Ir a {{ activeSession.complex.chainName }}
            <span class="material-symbols-outlined sm">open_in_new</span>
          </a>
        </div>
      </div>
    </div>

    <!-- SOURCES MODAL -->
    <div v-if="sourcesDialog" class="md-scrim" @click.self="sourcesDialog = false">
      <div class="md-dialog lg" role="dialog" aria-modal="true">
        <div class="md-dialog-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-outlined" style="color: var(--md-sys-color-primary);">hub</span>
            <span style="font-weight: 700; font-size: 1.05rem;">Fuentes de Cartelera</span>
          </div>
          <button type="button" class="md-icon-btn" @click="sourcesDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="md-dialog-body">
          <div class="md-list">
            <div v-for="chain in chains" :key="chain.id" class="md-list-item">
              <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span :class="['md-badge', getChainBadgeClass(chain.id)]" style="margin-top: 2px;">
                  {{ chain.name }}
                </span>
                <div>
                  <div style="font-weight: 700; font-size: 0.9rem;">{{ chain.complexes }}</div>
                  <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant); margin-top: 2px;">
                    <strong>Estado:</strong> {{ chain.integrationMethod }}
                  </div>
                </div>
              </div>
              <a class="md-icon-btn" :href="chain.url" target="_blank" rel="noopener">
                <span class="material-symbols-outlined sm">open_in_new</span>
              </a>
            </div>
          </div>
        </div>

        <div class="md-dialog-actions">
          <button type="button" class="md-btn md-btn-filled" @click="sourcesDialog = false">
            Entendido
          </button>
        </div>
      </div>
    </div>

    <!-- FOOTER WITH TMDB ATTRIBUTION -->
    <footer class="md-footer">
      <div class="md-container">
        <div style="margin-bottom: 8px;">
          <strong>CineCR</strong> — Cartelera en tiempo real de Cinemark, Cinépolis, CCM, Nova, Magaly, San Pedro, Studio Cinemas y CitiCinemas Costa Rica.
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant); opacity: 0.85;">
          <img
            src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
            alt="TMDb Logo"
            style="height: 12px; width: auto;"
          />
          <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        </div>
      </div>
    </footer>
  </div>
</template>
