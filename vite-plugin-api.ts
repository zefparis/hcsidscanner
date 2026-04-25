/**
 * Tiny Vite middleware that mounts /api/* handlers from the local `api/`
 * folder during dev. The same files deploy verbatim as Vercel functions
 * in production — so handler shape is intentionally Vercel-style.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

import type { ApiHandler } from './api/_helpers';

const ROUTES: Record<string, string> = {
  '/api/token-exchange': './api/token-exchange.ts',
  '/api/face-match': './api/face-match.ts',
};

export default function apiDevPlugin(): Plugin {
  return {
    name: 'hcs-id-scanner:api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const target = ROUTES[url];
        if (!target) {
          next();
          return;
        }
        try {
          const abs = path.resolve(server.config.root, target);
          const mod = await server.ssrLoadModule(pathToFileURL(abs).href);
          const handler = mod.default as ApiHandler;
          await handler(req, res);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[api-dev] ${url}`, (err as Error).message);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'internal_error' }));
          }
        }
      });
    },
  };
}
