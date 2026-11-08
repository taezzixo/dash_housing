import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://taezzixo.github.io/dash_housing/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/dash_housing/',
});
