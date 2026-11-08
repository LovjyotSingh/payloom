import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build:lib` builds the engine + components as an ES library (React is external).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-lib',
    copyPublicDir: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'payloom' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
  },
})
