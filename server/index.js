import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const DEBUG_LOG = path.join(__dirname, '..', '.cursor', 'debug-6b1ecd.log');

function debugLog(msg, data, hypothesisId) {
  try {
    const dir = path.dirname(DEBUG_LOG);
    if (!fs.existsSync(dir)) return;
    const line = JSON.stringify({ sessionId: '6b1ecd', location: 'server/index.js:api/chat', message: msg, data: data ?? {}, timestamp: Date.now(), hypothesisId: hypothesisId ?? 'H_SERVER' }) + '\n';
    fs.appendFileSync(DEBUG_LOG, line);
  } catch (_) {}
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.type('text/html').send(`
    <!DOCTYPE html>
    <html><body style="font-family:sans-serif;padding:2rem;">
      <h1>向光小兽 API</h1>
      <p>这是后端接口，不是前端页面。</p>
      <p>请打开 <strong>Vite 显示的地址</strong>（例如 <a href="http://localhost:5173">http://localhost:5173</a> 或 <a href="http://localhost:5174">http://localhost:5174</a>）查看应用。</p>
      <p><a href="/api/health">/api/health</a> – 检查 API 是否就绪</p>
    </body></html>
  `);
});

// Silicon Flow API（国内站 key 用 .cn）: https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions
const SILICONFLOW_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MODEL = 'deepseek-ai/DeepSeek-V3.2';

app.post('/api/chat', async (req, res) => {
  // #region agent log
  debugLog('api/chat hit', { hasBody: !!req.body }, 'H_API_HIT');
  // #endregion
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    console.warn('[chat] SILICONFLOW_API_KEY not set. Add it to .env and restart the server.');
    return res.status(500).json({ error: 'SILICONFLOW_API_KEY not set. Add it to .env and restart.' });
  }

  const { messages, stream = false } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const body = {
    model: MODEL,
    messages,
    stream: Boolean(stream),
    max_tokens: 128,
    enable_thinking: false,
  };

  try {
    const r = await fetch(SILICONFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      debugLog('api/chat upstream error', { status: r.status, errPreview: errText.slice(0, 100) }, 'H_API_UPSTREAM');
      console.error('[chat] Silicon Flow error:', r.status, errText.slice(0, 300));
      try {
        const errJson = JSON.parse(errText);
        console.error('[chat] Upstream message:', errJson?.error?.message || errJson?.message || errText.slice(0, 200));
      } catch (_) {}
      try {
        const errJson = JSON.parse(errText);
        return res.status(r.status).json({ error: errJson.error?.message || errText });
      } catch {
        return res.status(r.status).json({ error: errText || r.statusText });
      }
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
      return res.end();
    }

    const data = await r.json();
    // #region agent log
    debugLog('api/chat success', { status: r.status, hasChoices: !!data?.choices?.length }, 'H_API_OK');
    // #endregion
    return res.json(data);
  } catch (e) {
    debugLog('api/chat error', { err: e?.message }, 'H_API_ERR');
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.get('/api/health', (req, res) => {
  const keySet = !!process.env.SILICONFLOW_API_KEY;
  res.json({ ok: true, keySet });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  const keyStatus = process.env.SILICONFLOW_API_KEY ? 'set (AI ready)' : 'NOT SET – add SILICONFLOW_API_KEY to .env and restart';
  console.log(isProduction
    ? `Server running on port ${PORT} (production)`
    : `API proxy listening on http://localhost:${PORT}`);
  console.log('[chat] SILICONFLOW_API_KEY:', keyStatus);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is in use. Stop the other process (e.g. run: lsof -i :${PORT} then kill <PID>) or use another port: PORT=3002 npm run dev`);
  } else {
    console.error('[server] listen error', err);
  }
  process.exit(1);
});

if (process.stdin.isTTY === false) {
  process.stdin.on('end', () => {});
  process.stdin.resume();
}
