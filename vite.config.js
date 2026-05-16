import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin simples para rodar a Vercel Serverless Function localmente
const vercelApiPlugin = () => ({
  name: 'vercel-api-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/api/')) {
        try {
          const urlPath = req.url.split('?')[0];
          const absolutePath = path.resolve(__dirname, `.${urlPath}.js`);
          
          if (!fs.existsSync(absolutePath)) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Rota nao encontrada' }));
          }

          // Carregar a funcao
          const mod = await server.ssrLoadModule(absolutePath);
          const handler = mod.default;

          // Processar o body (JSON)
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            await new Promise(resolve => req.on('end', () => {
              try { req.body = JSON.parse(body); } catch(e) {}
              resolve();
            }));
          }

          // Fake Res API
          const adaptedRes = {
            status: (code) => { res.statusCode = code; return adaptedRes; },
            json: (data) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
              return adaptedRes;
            },
            send: (data) => { res.end(data); return adaptedRes; }
          };

          await handler(req, adaptedRes);
        } catch (e) {
          console.error("Erro no proxy local:", e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
    react(),
    vercelApiPlugin()
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.mjs']
  },
  server: {
    proxy: {
      '/supabase': {
        target: 'https://104.18.38.10',
        changeOrigin: true,
        secure: false,
        headers: {
          'Host': 'xyxpyljufhnwuqmpqbxx.supabase.co'
        },
        rewrite: (path) => path.replace(/^\/supabase/, '')
      }
    }
  }
})
