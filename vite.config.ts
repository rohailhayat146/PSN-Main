
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000, // Increase warning limit slightly
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            ui: ['lucide-react', 'recharts'],
            genai: ['@google/genai']
          }
        }
      }
    },
    // Define global constants replacement
    define: {
      // Safely replace process.env.API_KEY with the actual value from environment
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Ensure NODE_ENV is passed correctly for React optimization
      'process.env.NODE_ENV': JSON.stringify(mode),
      // Polyfill remaining process.env to empty object to prevent crashes in some libs
      'process.env': {}
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:4242',
          changeOrigin: true,
        }
      }
    }
  };
});
