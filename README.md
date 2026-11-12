<p align="center">
  <img src="public/logo.svg" alt="CineCR Logo" width="220" />
</p>

# CineCR

**CineCR** es una plataforma web limpia, rápida y unificada para consultar la cartelera y horarios de cine en **Costa Rica**. 

Reúne en un solo lugar la información oficial de las principales cadenas y salas independientes del país:
- **Cinemark** (City Mall, Multiplaza Curridabat, Multiplaza Escazú, Oxígeno)
- **Cinépolis** (Lincoln, Multicentro, Paseo de las Flores, Paseo Metrópoli, TerraMall, Terrazas Lindora VIP)
- **CCM Cinemas** (Plaza Mayor Rohrmoser, San Ramón, San Carlos)
- **Nova Cinemas** (Avenida Escazú, Ciudad del Este, Plaza Real Alajuela, Plaza Moín Limón, Tamarindo)
- **Cine Magaly** (Barrio La California, San José)
- **Cinema San Pedro** (Mall San Pedro)
- **Studio Cinemas** (City Place, Santa Ana)
- **CitiCinemas** (Plaza Grecia)

---

## 🚀 Características

- **Vista por Película**: Agrupada por cine y sala con formato (2D, 3D, VIP, IMAX, XD, etc.) e idioma (SUB / DOB).
- **Vista Cronograma**: Tabla cronológica de todas las funciones del día para elegir fácilmente qué ver según la hora.
- **Filtros rápidos**: Por fecha (hoy, mañana, días siguientes o toda la semana), provincia, cadena, formato e idioma.
- **Acceso directo a compra**: Cada tanda enlaza directamente a la boletería del cine respectivo.
- **Enriquecimiento con TMDb**: Datos precisos de afiches oficiales en alta resolución, duración y sinopsis.
- **Automatizado**: Un flujo de GitHub Actions actualiza las tandas dos veces al día sin intervención manual.

---

## 🛠️ Requisitos Previos

- **Node.js** v20 o superior (recomendado v22+)
- **npm** v10 o superior

---

## 💻 Instalación y Configuración Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/MuchoLucho/cinecr.git
   cd cinecr
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar TMDb (Opcional pero recomendado para nuevos datos)**:
   Si vas a correr los scrapers tú mismo y quieres enriquecer afiches y sinopsis:
   - Crea un archivo `.env` en la raíz del proyecto:
     ```env
     TMDB_READ_ACCESS_TOKEN="tu_token_aqui"
     ```
   *(El repositorio ya incluye un archivo `src/data/movies-data.json` con datos precargados para desarrollo).*

4. **Iniciar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

## 🤖 Comandos de Scraping y Build

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor local de desarrollo con hot-reload. |
| `npm run build` | Compila el bundle de producción en `dist/`. |
| `npm run preview` | Previsualiza la versión compilada localmente. |
| `npm run scrape` | Ejecuta todos los scrapers y unifica la cartelera en `movies-data.json`. |
| `npm run scrape:cinemark` | Scrapea únicamente Cinemark. |
| `npm run scrape:cinepolis` | Scrapea únicamente Cinépolis. |
| `npm run scrape:ccm` | Scrapea únicamente CCM Cinemas. |
| `npm run scrape:nova` | Scrapea únicamente Nova Cinemas. |
| `npm run scrape:magaly` | Scrapea únicamente Cine Magaly. |
| `npm run scrape:sanpedro` | Scrapea únicamente Cinema San Pedro. |
| `npm run scrape:studio` | Scrapea únicamente Studio Cinemas. |
| `npm run scrape:citicinemas` | Scrapea únicamente CitiCinemas. |
| `node tests/verify-data.test.js` | Corre la prueba de validación e integridad de datos. |

---

## 🤝 Contribuciones

¿Encontraste un error en un horario o quieres agregar una nueva sala? ¡Toda contribución es bienvenida!

[![Colaborar en GitHub](https://img.shields.io/badge/Colaborar-GitHub-blue?style=for-the-badge&logo=github)](https://github.com/MuchoLucho/cinecr)

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia [Apache 2.0](LICENSE).

---

## ⚖️ Descargo de Responsabilidad (Disclaimer)

CineCR es un proyecto independiente y de código abierto sin fines comerciales. No está afiliado, respaldado, asociado ni vinculado oficialmente con ninguna de las cadenas de cine (Cinemark, Cinépolis, CCM Cinemas, Nova Cinemas, Cine Magaly, Cinema San Pedro, Studio Cinemas, CitiCinemas) ni con los estudios cinematográficos o distribuidoras de las películas listadas. Todas las marcas registradas, nombres de complejos y logotipos son propiedad de sus respectivos dueños.

Este producto utiliza la API de TMDb, pero no está respaldado ni certificado por TMDb.

---

Hecho con ❤️ por [Lucho](https://github.com/MuchoLucho)
