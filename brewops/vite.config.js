import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev 服务器插件：/brewops → /brewops/ 301 重定向
function redirectSlash() {
  return {
    name: 'redirect-base-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/brewops') {
          res.writeHead(301, { Location: '/brewops/' })
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), redirectSlash()],
  base: '/brewops/',
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
