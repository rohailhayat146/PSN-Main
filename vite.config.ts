import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    // Define global constants replacement
    define: {
      // Safely replace process.env.API_KEY with the actual value from environment
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Polyfill process.env to an empty object to prevent "process is not defined" crashes
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