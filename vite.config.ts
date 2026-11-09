import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages(루트 도메인) 기준. 하위 경로에 배포할 때만 BASE_PATH 지정.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
  build: {
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html' }, // 관리자페이지는 /admin.html
    },
  },
});
