import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api/search': {
        target: 'https://search.brainstormnodes.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/search/, '/search'),
        secure: true,
      },
      '/api/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, ''),
        secure: true,
      },
      '/api/mcp/n8nv2': {
        target: 'https://n8nv2.brainstormnodes.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mcp\/n8nv2/, ''),
        secure: true,
      },
      '/api/openrouter': {
        target: 'https://openrouter.ai/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openrouter/, ''),
        secure: true,
      },
      '/api/github': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github/, ''),
        secure: true,
      },
      '/api/vercel': {
        target: 'https://api.vercel.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vercel/, ''),
        secure: true,
      },
    }
  }
})
