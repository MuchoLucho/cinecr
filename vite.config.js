import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
// base: './' ensures assets load correctly when hosted on GitHub Pages (e.g. username.github.io/cinecr/)
export default defineConfig({
  plugins: [vue()],
  base: './'
});
