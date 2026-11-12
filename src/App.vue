<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';
import moviesData from './data/movies-data.json';

const isDark = ref(true);
const toggleTheme = () => {
  isDark.value = !isDark.value;
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
};

const getNowCR = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  return { date, time, dateTime: `${date} ${time}` };
};

const currentTimeTrigger = ref(Date.now());
let timerInterval = null;

onMounted(() => {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
  timerInterval = setInterval(() => {
    currentTimeTrigger.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const isSessionInPast = (sessionDate, sessionTime) => {
  currentTimeTrigger.value; // reactive dependency
  const now = getNowCR();
  if (sessionDate < now.date) return true;
  if (sessionDate === now.date && sessionTime < now.time) return true;
  return false;
};

const hasRemainingToday = () => {
  const now = getNowCR();
  for (const m of moviesData) {
    for (const t of m.theaters || []) {
      for (const g of t.groups || []) {
        for (const s of g.times || []) {
          if (s.date === now.date && s.time >= now.time) {
            return true;
          }
        }
      }
    }
  }
  return false;
};

const viewMode = ref('movies');
const selectedDate = ref(hasRemainingToday() ? 'today' : 'tomorrow');
const onlyPremium = ref(false);
const scheduleSearch = ref('');

const availableDates = computed(() => {
  currentTimeTrigger.value;
  const now = getNowCR();
  const [y, m, d] = now.date.split('-').map(Number);
  const tomorrowStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

  const dates = new Set();
  movies.value.forEach(m => m.theaters.forEach(t => t.groups.forEach(g => g.times.forEach(s => {
    if (s.date && s.date >= now.date) dates.add(s.date);
  }))));

  const sorted = Array.from(dates).sort();
  const options = [];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

  sorted.forEach(dStr => {
    const parts = dStr.split('-');
    const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

    let value = dStr;
    let label = `${dayNames[dt.getDay()]} ${dt.getDate()} ${monthNames[dt.getMonth()]}`;

    if (dStr === now.date) {
      value = 'today';
      label = 'Hoy';
    } else if (dStr === tomorrowStr) {
      value = 'tomorrow';
      label = 'Mañana';
    }

    options.push({ label, value, rawDate: dStr });
  });

  // Add 'Toda la semana' as an option
  options.push({ label: 'Toda la semana', value: 'all' });

  return options;
});

const chains = [
  { id: 'cinemark', name: 'Cinemark' },
  { id: 'cinepolis', name: 'Cinépolis' },
  { id: 'ccm', name: 'CCM Cinemas' },
  { id: 'nova', name: 'Nova Cinemas' },
  { id: 'magaly', name: 'Cine Magaly' },
  { id: 'sanpedro', name: 'Cinema San Pedro' },
  { id: 'studio', name: 'Studio Cinemas' },
  { id: 'citicinemas', name: 'CitiCinemas' }
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
  'Acción': '#ef4444',
  'Terror': '#dc2626',
  'Comedia': '#f59e0b',
  'Animación': '#10b981',
  'Drama': '#8b5cf6',
  'Suspenso': '#06b6d4',
  'Aventura': '#3b82f6',
  'Ciencia Ficción': '#0ea5e9',
  'Fantasía': '#a855f7',
  'Familiar': '#ec4899',
  'Independiente': '#6366f1'
};

const cleanGenres = (genresList) => {
  if (!Array.isArray(genresList)) return [];
  const map = {
    'animacion': 'Animación', 'animada': 'Animación', 'animadas': 'Animación', 'animado': 'Animación', 'animados': 'Animación', 'animation': 'Animación',
    'accion': 'Acción', 'action': 'Acción',
    'ciencia ficcion': 'Ciencia Ficción', 'scifi': 'Ciencia Ficción', 'sci fi': 'Ciencia Ficción',
    'fantasia': 'Fantasía', 'fantasy': 'Fantasía',
    'suspenso': 'Suspenso', 'suspense': 'Suspenso', 'thriller': 'Suspenso',
    'comedia': 'Comedia', 'comedy': 'Comedia',
    'drama': 'Drama',
    'terror': 'Terror', 'horror': 'Terror',
    'aventura': 'Aventura', 'aventuras': 'Aventura', 'adventure': 'Aventura',
    'ninos': 'Familiar', 'niños': 'Familiar', 'infantil': 'Familiar', 'familiar': 'Familiar',
    'romance': 'Romance',
    'musical': 'Música', 'musica': 'Música',
    'documental': 'Documental',
    'independiente': 'Independiente', 'indie': 'Independiente'
  };
  const useless = new Set(['cine', 'pelicula', 'película', 'general', 'todos', 'n/a']);
  const res = [];
  for (const g of genresList) {
    if (!g || typeof g !== 'string') continue;
    const key = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!key || useless.has(key)) continue;
    res.push(map[key] || (g.trim().charAt(0).toUpperCase() + g.trim().slice(1)));
  }
  return Array.from(new Set(res));
};

const movies = ref(moviesData.map(m => {
  const genres = cleanGenres(m.genres);
  const genre = genres[0] || 'Película';
  const color = genreColors[genre] || '#f43f5e';
  return {
    ...m,
    genres,
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
                // 1. Hide shows whose start time has already passed
                if (isSessionInPast(s.date, s.time)) return false;

                // 2. Filter by selected date
                if (selectedDate.value === 'all') return true;

                const now = getNowCR();
                if (selectedDate.value === 'today') {
                  return s.date === now.date;
                }
                if (selectedDate.value === 'tomorrow') {
                  const [y, m, d] = now.date.split('-').map(Number);
                  const tomorrowStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
                  return s.date === tomorrowStr;
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

const formatSessionDate = (dateStr) => {
  if (!dateStr) return '';
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return `${dayNames[d.getDay()]} ${d.getDate()}`;
};
</script>

<template>
  <div id="app-root">
    <!-- TOP APP BAR -->
    <header class="md-top-app-bar">
      <div class="md-container md-top-app-bar-inner">
        <div class="brand-group">
          <div class="brand-avatar" style="background: none; padding: 0;">
            <img src="/favicon.svg" alt="CineCR" width="36" height="36" style="display: block; border-radius: 8px;" />
          </div>
          <div>
            <div class="brand-title">
              Cine<span style="color: #CE1126;">CR</span>
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
            <h1 class="hero-title">Cartelera de Cine</h1>
            <p class="hero-desc">
              Horarios y tandas actualizadas de todos los cines de Costa Rica.
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
              <div class="stat-label">Cines</div>
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

              <div v-if="movie.director && movie.director !== 'N/A'" style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--md-sys-color-outline-variant); font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                <strong>Director:</strong> {{ movie.director }}
              </div>
            </div>

            <div class="movie-content">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--md-sys-color-on-surface-variant);">
                  {{ countMovieShowtimes(movie) }} tandas en {{ movie.groupedTheaters.length }} cines
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
                      <a
                        v-for="session in group.times"
                        :key="session.time + session.date"
                        :href="complex.website"
                        target="_blank"
                        rel="noopener"
                        class="showtime-btn"
                        :title="`Ir a ${complex.chainName}`"
                      >
                        <span class="material-symbols-outlined sm">calendar_today</span>
                        <span v-if="session.date" style="opacity: 0.75; font-size: 0.78rem; font-weight: 500;">
                          {{ formatSessionDate(session.date) }}
                        </span>
                        <span>{{ session.time }}</span>
                      </a>
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
                Todas las funciones ordenadas por hora
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
                    <a
                      :href="item.complex.website"
                      target="_blank"
                      rel="noopener"
                      class="md-btn md-btn-tonal md-btn-sm"
                      style="text-decoration: none;"
                    >
                      Ir al cine
                      <span class="material-symbols-outlined sm">open_in_new</span>
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <!-- FOOTER -->
    <footer class="md-footer">
      <div class="md-container">
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px;">
          <span><strong>CineCR</strong> — Cartelera de cine en Costa Rica</span>
          <span>•</span>
          <a
            href="https://github.com/MuchoLucho/cinecr/blob/main/LICENSE"
            target="_blank"
            rel="noopener"
            style="color: inherit; text-decoration: underline;"
          >
            Licencia Apache 2.0
          </a>
          <span>•</span>
          <a
            href="https://github.com/MuchoLucho/cinecr"
            target="_blank"
            rel="noopener"
            class="md-btn md-btn-tonal md-btn-sm"
            style="text-decoration: none; display: inline-flex; align-items: center; gap: 5px;"
          >
            <span class="material-symbols-outlined sm">code</span>
            Colaborar
          </a>
        </div>

        <div style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant); max-width: 720px; margin: 0 auto 12px; line-height: 1.4; opacity: 0.85;">
          Descargo de responsabilidad: CineCR es un proyecto independiente y de código abierto. No está vinculado, afiliado ni respaldado por ninguna de las salas o cadenas de cine mencionadas ni por los estudios cinematográficos.
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 0.74rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 12px; opacity: 0.85;">
          <img
            src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
            alt="TMDb Logo"
            style="height: 12px; width: auto;"
          />
          <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        </div>

        <div style="font-size: 0.85rem; color: var(--md-sys-color-on-surface); font-weight: 500;">
          Hecho con ❤️ por <a href="https://github.com/MuchoLucho" target="_blank" rel="noopener" style="color: var(--md-sys-color-primary); text-decoration: none; font-weight: 600;">Lucho</a>
        </div>
      </div>
    </footer>
  </div>
</template>
