import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const FLASK_PORT = Number(process.env.FLASK_PORT || 5001);
const FLASK_URL = `http://127.0.0.1:${FLASK_PORT}`;

async function waitForFlask(retries = 40): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${FLASK_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Flask still starting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Flask backend failed to become ready in time.');
}

function startFlaskProcess(): ChildProcess {
  const proc = spawn('python', ['-m', 'backend.app'], {
    cwd: __dirname,
    env: {
      ...process.env,
      FLASK_PORT: String(FLASK_PORT),
      PYTHONUNBUFFERED: '1',
    },
    stdio: 'inherit',
  });
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`Flask backend exited with code ${code}`);
    }
  });
  return proc;
}

async function main() {
  const flaskProc = startFlaskProcess();
  const shutdown = () => {
    if (!flaskProc.killed) {
      flaskProc.kill('SIGTERM');
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await waitForFlask();

  const app = express();

  const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ]);

  // Transparent reverse proxy for all /api/* requests to Python Flask backend
  app.use('/api', async (req, res) => {
    try {
      const targetUrl = `${FLASK_URL}${req.originalUrl}`;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bodyBuffer = Buffer.concat(chunks);

      // RFC 7230: also strip any header names listed in the Connection header
      const dynamicHopByHop = new Set(HOP_BY_HOP_HEADERS);
      const rawConn = req.headers['connection'];
      const connVal = Array.isArray(rawConn) ? rawConn.join(',') : rawConn;
      if (typeof connVal === 'string') {
        for (const token of connVal.split(',')) {
          const clean = token.trim().toLowerCase();
          if (clean) dynamicHopByHop.add(clean);
        }
      }

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase();
        if (lower.startsWith(':') || dynamicHopByHop.has(lower)) continue;
        if (typeof v === 'string') headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(', ');
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer,
      });

      res.status(upstream.status);
      upstream.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (
          !HOP_BY_HOP_HEADERS.has(lower) &&
          lower !== 'content-encoding'
        ) {
          res.setHeader(key, val);
        }
      });
      const arrayBuf = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      console.error('Flask proxy error:', err);
      res.status(502).json({ error: 'Backend API unavailable.' });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MetroPulse server running on http://0.0.0.0:${PORT} (API proxied to Flask on ${FLASK_PORT})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
