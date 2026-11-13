<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue';
import moviesData from './data/movies-data.json';
import scrapingStatusData from './data/scraping-status.json';

const isDark = ref(true);
const statusDialog = ref(false);
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

const scrollY = ref(0);
const showScrollTop = computed(() => scrollY.value > 250);

const handleScroll = () => {
  scrollY.value = window.scrollY;
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const scrollToNextMovie = () => {
  const cards = Array.from(document.querySelectorAll('.movie-card-item'));
  if (cards.length === 0) return;
  const navOffset = 76;
  const currentPos = window.scrollY + navOffset;

  const nextCard = cards.find(card => {
    const cardTop = card.getBoundingClientRect().top + window.scrollY;
    return cardTop > currentPos + 12;
  });

  if (nextCard) {
    const targetY = nextCard.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }
};

const scrollToPrevMovie = () => {
  const cards = Array.from(document.querySelectorAll('.movie-card-item'));
  if (cards.length === 0) return;
  const navOffset = 76;
  const currentPos = window.scrollY + navOffset;

  const prevCards = cards.filter(card => {
    const cardTop = card.getBoundingClientRect().top + window.scrollY;
    return cardTop < currentPos - 12;
  });

  if (prevCards.length > 0) {
    const prevCard = prevCards[prevCards.length - 1];
    const targetY = prevCard.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Floating Navigation Dock (Draggable & repositionable to any corner)
const dockSide = ref('right'); // 'right' | 'left'
const dockY = ref(null); // vertical offset in px (null = default bottom: 24px)
const isDraggingDock = ref(false);
const dragPos = ref(null);

let startPointer = { x: 0, y: 0 };
let startDock = { x: 0, y: 0 };
let hasDragged = false;

const loadDockPosition = () => {
  try {
    const saved = localStorage.getItem('cinecr-dock-pos');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.side === 'left' || parsed.side === 'right') {
        dockSide.value = parsed.side;
      }
      if (typeof parsed.y === 'number') {
        const maxY = Math.max(80, window.innerHeight - 160);
        dockY.value = Math.min(Math.max(80, parsed.y), maxY);
      }
    }
  } catch (err) {
    // Ignore storage errors
  }
};

const saveDockPosition = () => {
  try {
    localStorage.setItem(
      'cinecr-dock-pos',
      JSON.stringify({ side: dockSide.value, y: dockY.value })
    );
  } catch (err) {
    // Ignore storage errors
  }
};

const toggleCorner = () => {
  dockSide.value = dockSide.value === 'right' ? 'left' : 'right';
  saveDockPosition();
};

const dockStyle = computed(() => {
  if (isDraggingDock.value && dragPos.value) {
    return {
      left: `${dragPos.value.x}px`,
      top: `${dragPos.value.y}px`,
      right: 'auto',
      bottom: 'auto'
    };
  }
  const style = {};
  if (dockSide.value === 'left') {
    style.left = '18px';
    style.right = 'auto';
  } else {
    style.right = '18px';
    style.left = 'auto';
  }
  if (dockY.value !== null) {
    style.top = `${dockY.value}px`;
    style.bottom = 'auto';
  } else {
    style.bottom = '24px';
    style.top = 'auto';
  }
  return style;
});

const onDockPointerDown = (e) => {
  const target = e.target;
  const isButton = target.closest('.floating-nav-btn');
  const isHandle = target.closest('.floating-drag-handle');

  // Allow clicking on nav buttons without initiating drag
  if (isButton && !isHandle) return;

  const dockEl = e.currentTarget;
  if (!dockEl) return;

  const rect = dockEl.getBoundingClientRect();
  startDock = { x: rect.left, y: rect.top };
  startPointer = { x: e.clientX, y: e.clientY };
  hasDragged = false;

  const onPointerMove = (moveEvent) => {
    const dx = moveEvent.clientX - startPointer.x;
    const dy = moveEvent.clientY - startPointer.y;

    if (!hasDragged && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      hasDragged = true;
      isDraggingDock.value = true;
    }

    if (hasDragged) {
      const maxX = Math.max(12, window.innerWidth - rect.width - 12);
      const maxY = Math.max(80, window.innerHeight - rect.height - 12);
      const newX = Math.min(Math.max(12, startDock.x + dx), maxX);
      const newY = Math.min(Math.max(80, startDock.y + dy), maxY);
      dragPos.value = { x: newX, y: newY };
    }
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    if (hasDragged) {
      isDraggingDock.value = false;
      const currentX = dragPos.value ? dragPos.value.x : startDock.x;
      const currentY = dragPos.value ? dragPos.value.y : startDock.y;
      dragPos.value = null;

      // Snap to left or right corner
      const centerX = currentX + rect.width / 2;
      dockSide.value = centerX < window.innerWidth / 2 ? 'left' : 'right';

      const maxY = Math.max(80, window.innerHeight - rect.height - 24);
      dockY.value = Math.min(Math.max(80, currentY), maxY);
      saveDockPosition();
    } else if (isHandle) {
      // Tap/click on handle toggles corner instantly
      toggleCorner();
    }
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
};

const handleWindowResize = () => {
  if (dockY.value !== null) {
    const maxY = Math.max(80, window.innerHeight - 160);
    dockY.value = Math.min(Math.max(80, dockY.value), maxY);
  }
};

const handleKeyDown = (e) => {
  if (e.key === 'Escape' && isMobileFilterOpen.value) {
    closeMobileFilter();
  }
};

onMounted(() => {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleWindowResize, { passive: true });
  loadDockPosition();
  try {
    geoPromptDismissed.value = localStorage.getItem('cinecr-geo-dismissed') === 'true';
    if (localStorage.getItem('cinecr-geo-enabled') === 'true') {
      requestUserLocation();
    }
  } catch {
    // Ignore storage errors
  }
  handleScroll();
  updateSidebarHeight();
  if (typeof ResizeObserver !== 'undefined' && sidebarRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateSidebarHeight();
    });
    resizeObserver.observe(sidebarRef.value);
  }
  timerInterval = setInterval(() => {
    currentTimeTrigger.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleWindowResize);
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
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
  const currentMonthIdx = m - 1;

  sorted.forEach(dStr => {
    const parts = dStr.split('-');
    const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

    const isDifferentMonth = dt.getMonth() !== currentMonthIdx;
    const monthSuffix = isDifferentMonth ? ` ${monthNames[dt.getMonth()]}` : '';

    let value = dStr;
    let label = `${dayNames[dt.getDay()]} ${dt.getDate()}${monthSuffix}`;

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
  { id: 'citicinemas', name: 'CitiCinemas' },
  { id: 'pacific', name: 'Pacific Cinemas' },
  { id: 'sunset', name: 'Sunset Cinema' },
  { id: 'bistro', name: 'Bistro Cinema' },
  { id: 'multicines', name: 'Multicines' },
  { id: 'paseodelviento', name: 'Paseo del Viento' }
];

const CHAIN_WEBSITES = {
  cinemark: 'https://www.cinemarkca.com/costa-rica',
  cinepolis: 'https://cinepolis.co.cr',
  ccm: 'https://www.ccmcinemas.com',
  nova: 'https://www.novacinemas.cr',
  magaly: 'https://www.cinemagaly.com',
  sanpedro: 'https://cinemasanpedro.com',
  studio: 'https://www.studiocinemascr.com',
  citicinemas: 'https://www.citicinemascr.com',
  pacific: 'https://pacificcinemas.com/cartelera.php',
  sunset: 'https://sunsetcinemajaco.com/cartelera/',
  bistro: 'https://bistrocinemahermosa.com',
  multicines: 'https://www.compraenlineaml.net/Cartelera.aspx?complejo=450',
  paseodelviento: 'https://paseodelvientocinema.com/Cartelera.aspx?complejo=460'
};

const getCinemaWebsite = (complex) => {
  return complex?.website || CHAIN_WEBSITES[complex?.chainId] || 'https://cinecr.pages.dev';
};

const CINEMA_COORDINATES = {
  'bistro-hermosa': { lat: 10.5673, lng: -85.6696 },
  'ccm-plaza-mayor': { lat: 9.9448, lng: -84.1178 },
  'ccm-san-ramon': { lat: 10.0777, lng: -84.4694 },
  'ccm-san-carlos': { lat: 10.3331, lng: -84.4347 },
  'cmk-2204': { lat: 10.0044, lng: -84.2117 },
  'cmk-770': { lat: 9.9443, lng: -84.1509 },
  'cmk-773': { lat: 9.9172, lng: -84.0466 },
  'cmk-2210': { lat: 9.9939, lng: -84.1326 },
  'cpl-lincoln': { lat: 9.9628, lng: -84.0554 },
  'cpl-multicentro': { lat: 9.8996, lng: -84.0677 },
  'cpl-paseo-flores': { lat: 9.9850, lng: -84.1114 },
  'cpl-paseo-metropoli': { lat: 9.8670, lng: -83.9426 },
  'cpl-terramall': { lat: 9.9020, lng: -83.9965 },
  'cpl-terrazas-lindora': { lat: 9.9569, lng: -84.1966 },
  'citicinemas-grecia': { lat: 10.0786, lng: -84.3170 },
  'magaly-california': { lat: 9.9331, lng: -84.0679 },
  'studio-santa-ana': { lat: 9.9358, lng: -84.1900 },
  'multicines-liberia': { lat: 10.6182, lng: -85.4368 },
  'paseodelviento-tilaran': { lat: 10.4706, lng: -84.9691 },
  'nova-escazu': { lat: 9.9390, lng: -84.1426 },
  'nova-curridabat': { lat: 9.9081, lng: -84.0175 },
  'nova-alajuela': { lat: 10.0111, lng: -84.2063 },
  'nova-limon': { lat: 9.9879, lng: -83.0968 },
  'nova-tamarindo': { lat: 10.3087, lng: -85.8311 },
  'sanpedro-mall': { lat: 9.9339, lng: -84.0566 },
  'pacific-paso-canoas': { lat: 8.5381, lng: -82.8391 },
  'sunset-jaco': { lat: 9.6175, lng: -84.6310 }
};

// User Geolocation & Distance Calculation (Haversine)
const userLocation = ref(null);
const geoStatus = ref('idle'); // 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'
const geoPromptDismissed = ref(false);

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  if (
    typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lng2 !== 'number'
  ) {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistanceKm = (km) => {
  if (km === null || km === undefined || Number.isNaN(km)) return '';
  if (km < 1) return `a ${km.toFixed(1)} km`;
  return `a ${km.toFixed(1).replace(/\.0$/, '')} km`;
};

const getComplexDistanceKm = (complex) => {
  if (!userLocation.value || !complex) return null;
  const coords = (typeof complex.lat === 'number' && typeof complex.lng === 'number')
    ? { lat: complex.lat, lng: complex.lng }
    : CINEMA_COORDINATES[complex.complexId];
  if (!coords) return null;
  return calculateDistanceKm(userLocation.value.lat, userLocation.value.lng, coords.lat, coords.lng);
};

const requestUserLocation = () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    geoStatus.value = 'unsupported';
    return;
  }
  geoStatus.value = 'loading';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation.value = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      geoStatus.value = 'granted';
      try {
        localStorage.setItem('cinecr-geo-enabled', 'true');
        localStorage.removeItem('cinecr-geo-dismissed');
      } catch {
        // Ignore storage errors
      }
    },
    () => {
      geoStatus.value = 'denied';
      try {
        localStorage.removeItem('cinecr-geo-enabled');
      } catch {
        // Ignore storage errors
      }
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
};

const clearUserLocation = () => {
  userLocation.value = null;
  geoStatus.value = 'idle';
  try {
    localStorage.removeItem('cinecr-geo-enabled');
  } catch {
    // Ignore storage errors
  }
};

const dismissGeoPrompt = () => {
  geoPromptDismissed.value = true;
  try {
    localStorage.setItem('cinecr-geo-dismissed', 'true');
  } catch {
    // Ignore storage errors
  }
};

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

const getRatingBadgeClass = (ratingStr) => {
  if (!ratingStr) return 'badge-green';
  const r = ratingStr.toUpperCase();
  if (r.includes('18')) return 'badge-red';
  if (r.includes('15')) return 'badge-orange';
  if (r.includes('12')) return 'badge-amber';
  return 'badge-green';
};

const getMovieAgeRating = (ratingStr) => {
  if (!ratingStr) return { tier: 'TP', minAge: 0, label: 'Todo Público (TP)' };
  const r = ratingStr.toUpperCase().trim();
  if (r.includes('18')) return { tier: '18', minAge: 18, label: 'Mayores de 18 (+18)' };
  if (r.includes('15')) return { tier: '15', minAge: 15, label: 'Mayores de 15 (+15)' };
  if (r.includes('12')) return { tier: '12', minAge: 12, label: 'Mayores de 12 (+12)' };
  return { tier: 'TP', minAge: 0, label: 'Todo Público (TP)' };
};

const getAgeRatingLabel = (tier) => {
  if (tier === 'TP') return 'Todo Público';
  if (tier === '12') return '+12';
  if (tier === '15') return '+15';
  if (tier === '18') return '+18';
  return 'Todas';
};

const getSortTitle = (title) => {
  if (!title || typeof title !== 'string') return '';
  let clean = title.replace(/^[\s¿¡"'\«“\(\[]+/, '').trim();
  clean = clean.replace(/^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/i, '').trim();
  return clean || title;
};

const compareMovieTitles = (a, b) => {
  const titleA = typeof a === 'string' ? a : (a?.title || '');
  const titleB = typeof b === 'string' ? b : (b?.title || '');
  const keyA = getSortTitle(titleA);
  const keyB = getSortTitle(titleB);
  const cmp = keyA.localeCompare(keyB, 'es', { sensitivity: 'base' });
  if (cmp !== 0) return cmp;
  return titleA.localeCompare(titleB, 'es');
};

const movies = ref(moviesData.map(m => {
  const genres = cleanGenres(m.genres);
  const genre = genres[0] || 'Película';
  const color = genreColors[genre] || '#f43f5e';
  const ageInfo = getMovieAgeRating(m.rating);
  const theaters = (m.theaters || []).map(t => {
    const coords = CINEMA_COORDINATES[t.complexId];
    return {
      ...t,
      lat: t.lat ?? coords?.lat ?? null,
      lng: t.lng ?? coords?.lng ?? null,
      website: t.website || CHAIN_WEBSITES[t.chainId] || 'https://cinecr.pages.dev'
    };
  });
  return {
    ...m,
    genres,
    theaters,
    ratingBadgeClass: m.ratingBadgeClass || getRatingBadgeClass(m.rating),
    ageTier: ageInfo.tier,
    minAge: ageInfo.minAge,
    poster: m.poster || generatePosterSvg(m.title, genre, color)
  };
}).sort(compareMovieTitles));

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
  provinces: [],
  chain: null,
  language: null,
  formats: [],
  ageRating: null
});

const selectedFormatSingle = computed({
  get: () => (filters.formats.length > 0 ? filters.formats[0] : null),
  set: (val) => { filters.formats = val ? [val] : []; }
});

const filteredMovies = computed(() => {
  return movies.value
    .filter(m => {
      if (filters.ageRating && m.ageTier !== filters.ageRating) {
        return false;
      }
      return true;
    })
    .map(movie => {
      const groupedTheaters = movie.theaters
        .filter(complex => {
          if (filters.chain && complex.chainId !== filters.chain) return false;
          if (filters.provinces.length > 0 && !filters.provinces.includes(complex.province)) return false;
          return true;
        })
        .map(complex => {
          const matchingGroups = complex.groups
            .map(g => {
              if (filters.language && g.language !== filters.language) return null;
              if (filters.formats.length > 0 && !filters.formats.includes(g.format)) return null;

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
            distanceKm: getComplexDistanceKm(complex),
            groupedByFormatLang: matchingGroups,
            uniqueFormats,
            sessions: flatSessions
          };
        })
        .filter(complex => complex.groupedByFormatLang.length > 0);

      if (userLocation.value) {
        groupedTheaters.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      }

      return {
        ...movie,
        groupedTheaters
      };
    })
    .filter(movie => movie.groupedTheaters.length > 0)
    .sort(compareMovieTitles);
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
  filters.provinces.length > 0 || filters.chain || filters.language || filters.formats.length > 0 || filters.ageRating
));

const activeFilterCount = computed(() => {
  let count = 0;
  if (filters.provinces.length > 0) count++;
  if (filters.chain) count++;
  if (filters.language) count++;
  if (filters.formats.length > 0) count++;
  if (filters.ageRating) count++;
  return count;
});

const isMobileFilterOpen = ref(false);
const sidebarRef = ref(null);
let resizeObserver = null;

const updateSidebarHeight = () => {
  if (sidebarRef.value && typeof window !== 'undefined') {
    const h = sidebarRef.value.offsetHeight;
    if (h > 0) {
      sidebarRef.value.style.setProperty('--sidebar-height', `${h}px`);
    }
  }
};
const toggleMobileFilter = () => {
  isMobileFilterOpen.value = !isMobileFilterOpen.value;
};
const closeMobileFilter = () => {
  isMobileFilterOpen.value = false;
};

watch(isMobileFilterOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : '';
  }
});

const resetFilters = () => {
  filters.provinces = [];
  filters.chain = null;
  filters.language = null;
  filters.formats = [];
  filters.ageRating = null;
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
  if (chainId === 'pacific') return 'badge-blue';
  if (chainId === 'sunset') return 'badge-amber';
  if (chainId === 'bistro') return 'badge-pink';
  if (chainId === 'multicines') return 'badge-cyan';
  if (chainId === 'paseodelviento') return 'badge-green';
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
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const now = getNowCR();
  const currentMonthIdx = parseInt(now.date.split('-')[1], 10) - 1;
  const monthSuffix = d.getMonth() !== currentMonthIdx ? ` ${monthNames[d.getMonth()]}` : '';
  return `${dayNames[d.getDay()]} ${d.getDate()}${monthSuffix}`;
};

const statusChainsList = computed(() => {
  const chainsMap = scrapingStatusData?.chains || {};
  return chains.map(c => {
    const data = chainsMap[c.id] || {};
    return {
      id: c.id,
      name: c.name,
      status: data.status || 'healthy',
      lastSuccess: data.lastSuccess || null,
      moviesCount: data.moviesCount || 0,
      showtimesCount: data.showtimesCount || 0,
      note: data.note || null
    };
  });
});

const hasScrapeWarnings = computed(() =>
  statusChainsList.value.some(c => c.status === 'warning')
);

const formatStatusDate = (isoStr) => {
  if (!isoStr) return 'Sin datos';
  try {
    const d = new Date(isoStr);
    const formatter = new Intl.DateTimeFormat('es-CR', {
      timeZone: 'America/Costa_Rica',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return formatter.format(d);
  } catch {
    return isoStr;
  }
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
            class="md-btn md-btn-tonal md-btn-sm"
            :class="{ 'geo-active-btn': geoStatus === 'granted' }"
            @click="userLocation ? clearUserLocation() : requestUserLocation()"
            :disabled="geoStatus === 'loading'"
            :title="userLocation ? 'Ubicación activa (clic para desactivar)' : 'Calcular distancia a cada cine'"
          >
            <span class="material-symbols-outlined sm">
              {{ geoStatus === 'granted' ? 'my_location' : 'location_searching' }}
            </span>
            <span class="hide-mobile">
              {{ geoStatus === 'loading' ? 'Ubicando...' : (geoStatus === 'granted' ? 'Ubicación activa' : 'Mi ubicación') }}
            </span>
          </button>

          <button
            type="button"
            class="md-btn md-btn-tonal md-btn-sm status-btn"
            @click="statusDialog = true"
            title="Ver estado de sincronización de cines"
          >
            <span class="status-pulse-dot" :class="hasScrapeWarnings ? 'warning' : 'healthy'"></span>
            <span class="material-symbols-outlined sm">monitor_heart</span>
            <span class="hide-mobile">Estado</span>
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

    <!-- HERO SECTION -->
    <section class="hero-section">
      <div class="md-container">
        <div class="hero-grid">
          <div>
            <h1 class="hero-title">Cartelera de Cine</h1>
            <p class="hero-desc">
              Horarios y tandas unificadas de todos los cines de Costa Rica
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
      </div>
    </section>

    <!-- MAIN CONTENT -->
    <main class="md-container app-layout-container">
      <div class="app-layout">
        <!-- SIDEBAR / DRAWER -->
        <aside
          ref="sidebarRef"
          class="filter-sidebar"
          :class="{ 'mobile-open': isMobileFilterOpen }"
          aria-label="Filtros de cartelera"
        >
          <div class="sidebar-header">
            <div class="sidebar-title">
              <span class="material-symbols-outlined">tune</span>
              <span>Filtros</span>
              <span v-if="activeFilterCount > 0" class="filter-count-badge">{{ activeFilterCount }}</span>
            </div>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="md-btn md-btn-text md-btn-sm hide-mobile"
              @click="resetFilters"
              title="Restablecer todos los filtros"
            >
              Limpiar
            </button>
            <button
              type="button"
              class="md-icon-btn show-mobile-only"
              @click="closeMobileFilter"
              aria-label="Cerrar filtros"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="sidebar-content">
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
              <div class="md-field-header">
                <label class="md-field-label">
                  <span class="material-symbols-outlined sm">map</span> Provincias
                  <span v-if="filters.provinces.length > 0" class="filter-count-chip">({{ filters.provinces.length }})</span>
                </label>
                <button
                  v-if="filters.provinces.length > 0"
                  type="button"
                  class="clear-link-btn"
                  @click="filters.provinces = []"
                  title="Limpiar provincias seleccionadas"
                >
                  Limpiar
                </button>
              </div>
              <div class="checkbox-group" role="group" aria-label="Filtrar por provincias">
                <label
                  v-for="p in provinces"
                  :key="p"
                  class="checkbox-item"
                  :class="{ 'is-checked': filters.provinces.includes(p) }"
                >
                  <input
                    type="checkbox"
                    :value="p"
                    v-model="filters.provinces"
                    class="md-checkbox"
                  />
                  <span class="checkbox-label-text">{{ p }}</span>
                </label>
              </div>
            </div>

            <div class="md-field">
              <div class="md-field-header">
                <label class="md-field-label">
                  <span class="material-symbols-outlined sm">family_restroom</span> Clasificación
                  <span v-if="filters.ageRating" class="filter-count-chip">({{ getAgeRatingLabel(filters.ageRating) }})</span>
                </label>
                <button
                  v-if="filters.ageRating"
                  type="button"
                  class="clear-link-btn"
                  @click="filters.ageRating = null"
                  title="Restablecer clasificación"
                >
                  Todas
                </button>
              </div>
              <div class="age-scale-container" role="radiogroup" aria-label="Escala de clasificación por edad">
                <button
                  type="button"
                  class="age-scale-btn"
                  :class="{ active: filters.ageRating === null }"
                  :aria-checked="filters.ageRating === null"
                  role="radio"
                  @click="filters.ageRating = null"
                >
                  Todas
                </button>
                <button
                  type="button"
                  class="age-scale-btn age-scale-tp"
                  :class="{ active: filters.ageRating === 'TP' }"
                  :aria-checked="filters.ageRating === 'TP'"
                  role="radio"
                  @click="filters.ageRating = filters.ageRating === 'TP' ? null : 'TP'"
                  title="Todo Público (Apta para toda la familia)"
                >
                  TP
                </button>
                <button
                  type="button"
                  class="age-scale-btn age-scale-12"
                  :class="{ active: filters.ageRating === '12' }"
                  :aria-checked="filters.ageRating === '12'"
                  role="radio"
                  @click="filters.ageRating = filters.ageRating === '12' ? null : '12'"
                  title="Mayores de 12 años (+12)"
                >
                  +12
                </button>
                <button
                  type="button"
                  class="age-scale-btn age-scale-15"
                  :class="{ active: filters.ageRating === '15' }"
                  :aria-checked="filters.ageRating === '15'"
                  role="radio"
                  @click="filters.ageRating = filters.ageRating === '15' ? null : '15'"
                  title="Mayores de 15 años (+15)"
                >
                  +15
                </button>
                <button
                  type="button"
                  class="age-scale-btn age-scale-18"
                  :class="{ active: filters.ageRating === '18' }"
                  :aria-checked="filters.ageRating === '18'"
                  role="radio"
                  @click="filters.ageRating = filters.ageRating === '18' ? null : '18'"
                  title="Mayores de 18 años (+18)"
                >
                  +18
                </button>
              </div>
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

          <div class="sidebar-footer show-mobile-only">
            <button
              v-if="hasActiveFilters"
              type="button"
              class="md-btn md-btn-tonal md-btn-sm"
              style="flex: 1;"
              @click="resetFilters"
            >
              Limpiar
            </button>
            <button
              type="button"
              class="md-btn md-btn-filled md-btn-sm"
              style="flex: 2;"
              @click="closeMobileFilter"
            >
              Ver tandas
            </button>
          </div>
        </aside>

        <!-- BACKDROP FOR MOBILE DRAWER -->
        <Transition name="fade">
          <div
            v-if="isMobileFilterOpen"
            class="sidebar-backdrop"
            @click="closeMobileFilter"
            aria-hidden="true"
          ></div>
        </Transition>

        <!-- MAIN CONTENT COLUMN -->
        <div class="main-content-column">
          <!-- GEOLOCATION PROMPT BANNER -->
          <div
            v-if="!userLocation && !geoPromptDismissed && geoStatus !== 'denied' && geoStatus !== 'unsupported'"
            class="geo-prompt-banner"
          >
            <div class="geo-prompt-info">
              <span class="material-symbols-outlined geo-prompt-icon">near_me</span>
              <span class="geo-prompt-text">
                ¿Querés saber a cuántos kilómetros estás de cada cine? Compartí tu ubicación para mostrar la distancia.
              </span>
            </div>
            <div class="geo-prompt-actions">
              <button
                type="button"
                class="md-btn md-btn-filled md-btn-sm"
                :disabled="geoStatus === 'loading'"
                @click="requestUserLocation"
              >
                {{ geoStatus === 'loading' ? 'Obteniendo...' : 'Compartir ubicación' }}
              </button>
              <button
                type="button"
                class="md-btn md-btn-text md-btn-sm"
                @click="dismissGeoPrompt"
              >
                Ahora no
              </button>
            </div>
          </div>

          <!-- TOP TOOLBAR: Date chips + Mobile Filters button -->
          <div class="content-toolbar">
            <button
              type="button"
              class="md-btn md-btn-tonal md-btn-sm mobile-filter-trigger"
              @click="toggleMobileFilter"
              aria-label="Abrir filtros"
            >
              <span class="material-symbols-outlined sm">tune</span>
              <span>Filtros</span>
              <span v-if="activeFilterCount > 0" class="filter-count-badge">{{ activeFilterCount }}</span>
            </button>

            <div class="date-chips-scroll">
              <span class="hide-mobile" style="font-size: 0.8rem; color: var(--md-sys-color-on-surface-variant); font-weight: 500; margin-right: 2px;">
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
          </div>
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
        <article v-for="movie in filteredMovies" :key="movie.id" class="md-card movie-card-item">
          <div class="movie-card-grid">
            <div class="movie-sidebar">
              <div class="poster-wrapper">
                <img
                  :src="movie.poster"
                  :alt="movie.title"
                  class="poster-img"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="(e) => e.target.src = generatePosterSvg(movie.title, movie.genres[0] || 'Película', '#f43f5e')"
                />
                <div class="poster-overlay">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="md-badge" :class="movie.ratingBadgeClass">
                      {{ movie.rating }}
                    </span>
                    <span v-if="movie.score" class="md-badge" style="background: rgba(0,0,0,0.8); color: #fbbf24;">
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
                      <div style="font-size: 0.76rem; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="display: inline-flex; align-items: center; gap: 3px;">
                          <span class="material-symbols-outlined sm" style="font-size: 14px;">location_on</span>
                          {{ complex.province }} • {{ complex.locationDetail }}
                        </span>
                        <span
                          v-if="complex.distanceKm !== null"
                          class="distance-pill"
                          title="Distancia aproximada en línea recta desde tu ubicación"
                        >
                          <span class="material-symbols-outlined" style="font-size: 13px;">near_me</span>
                          {{ formatDistanceKm(complex.distanceKm) }}
                        </span>
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
                        :href="getCinemaWebsite(complex)"
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
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span :class="['md-badge xs', getChainBadgeClass(item.complex.chainId)]">
                        {{ item.complex.chainName }}
                      </span>
                      <span style="font-weight: 500;">{{ item.complex.complexName }}</span>
                      <span
                        v-if="item.complex.distanceKm !== null"
                        class="distance-pill"
                        title="Distancia aproximada en línea recta desde tu ubicación"
                      >
                        <span class="material-symbols-outlined" style="font-size: 13px;">near_me</span>
                        {{ formatDistanceKm(item.complex.distanceKm) }}
                      </span>
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
                      :href="getCinemaWebsite(item.complex)"
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
        </div>
      </div>
    </main>

    <!-- HEALTH / STATUS MODAL -->
    <div v-if="statusDialog" class="md-scrim" @click.self="statusDialog = false">
      <div class="md-dialog" role="dialog" aria-modal="true" style="max-width: 580px;">
        <div class="md-dialog-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-outlined" style="color: var(--md-sys-color-primary);">monitor_heart</span>
            <div>
              <div style="font-weight: 700; font-size: 1.05rem; line-height: 1.2;">
                Estado de Carteleras
              </div>
              <div style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">
                Última sincronización de cada cine
              </div>
            </div>
          </div>
          <button type="button" class="md-icon-btn" @click="statusDialog = false" title="Cerrar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="md-dialog-body" style="padding: 16px 20px;">
          <div class="status-list">
            <div
              v-for="chain in statusChainsList"
              :key="chain.id"
              class="status-item-row"
            >
              <div style="display: flex; align-items: center; gap: 10px;">
                <span :class="['md-badge', getChainBadgeClass(chain.id)]" style="min-width: 90px; text-align: center;">
                  {{ chain.name }}
                </span>
                <span
                  v-if="chain.status === 'warning'"
                  class="md-badge xs badge-amber"
                  title="Respaldo en uso"
                >
                  Respaldo
                </span>
              </div>

              <div style="text-align: right;">
                <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 600; color: var(--md-sys-color-on-surface-variant);">
                  Última sincronización
                </div>
                <div style="font-size: 0.84rem; font-weight: 600; color: var(--md-sys-color-on-surface); white-space: nowrap;">
                  {{ formatStatusDate(chain.lastSuccess) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="md-dialog-actions" style="justify-content: space-between; align-items: center;">
          <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined sm">schedule</span>
            Actualización automática diaria vía GitHub Actions
          </div>
          <button type="button" class="md-btn md-btn-filled md-btn-sm" @click="statusDialog = false">
            Entendido
          </button>
        </div>
      </div>
    </div>

    <!-- FLOATING NAVIGATION CONTROLS (Draggable & repositionable) -->
    <aside
      class="floating-nav-dock"
      :class="{ 'is-dragging': isDraggingDock, 'is-left': dockSide === 'left' }"
      :style="dockStyle"
      aria-label="Navegación rápida"
      @pointerdown="onDockPointerDown"
    >
      <!-- Stepper (Previous / Next movie) - now on PC & Mobile -->
      <div
        v-if="viewMode === 'movies' && filteredMovies.length > 1"
        class="floating-nav-stepper"
      >
        <!-- Drag Handle / Corner Switch -->
        <button
          type="button"
          class="floating-drag-handle"
          title="Arrastrar para mover o clic para cambiar de esquina"
          aria-label="Cambiar de esquina o arrastrar"
        >
          <span class="material-symbols-outlined drag-icon">drag_indicator</span>
        </button>

        <button
          type="button"
          class="floating-nav-btn"
          title="Película anterior"
          aria-label="Película anterior"
          @click="scrollToPrevMovie"
        >
          <span class="material-symbols-outlined">keyboard_arrow_up</span>
        </button>
        <button
          type="button"
          class="floating-nav-btn"
          title="Película siguiente"
          aria-label="Película siguiente"
          @click="scrollToNextMovie"
        >
          <span class="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
      </div>

      <!-- Scroll to Top (desktop & mobile) -->
      <button
        v-show="showScrollTop"
        type="button"
        class="floating-nav-btn primary"
        title="Volver arriba"
        aria-label="Volver arriba"
        @click="scrollToTop"
      >
        <span class="material-symbols-outlined">arrow_upward</span>
      </button>
    </aside>

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
