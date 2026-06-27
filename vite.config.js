import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// A simple plugin to copy the assets folder to dist/assets
function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      const srcDir = resolve(__dirname, 'assets');
      const destDir = resolve(__dirname, 'dist/assets');
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, destDir, { recursive: true, force: true });
        console.log('Successfully copied assets/ to dist/assets/');
      }
    }
  };
}

export default defineConfig({
  plugins: [copyAssetsPlugin()],
  base: process.env.VITE_BASE_PATH || "/sribhagyalaxmijewellery"
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        owner: resolve(__dirname, 'owner.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html')
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5500',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
