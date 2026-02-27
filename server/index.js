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

// 多厂商：OpenAI 兼容 或 单独适配（Gemini/Claude）
const PROVIDERS = {
  siliconflow: {
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'deepseek-ai/DeepSeek-V3.2',
    extra: { enable_thinking: false },
    openaiFormat: true,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    extra: {},
    openaiFormat: true,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    extra: {},
    openaiFormat: true,
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    model: 'gemini-2.0-flash-exp',
    openaiFormat: false,
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022',
    openaiFormat: false,
  },
};

const DEFAULT_PROVIDER = 'siliconflow';
const ENV_API_KEY = process.env.SILICONFLOW_API_KEY;

function openAICompatResponse(text) {
  return { choices: [{ message: { content: text || '' } }] };
}

app.post('/api/chat', async (req, res) => {
  debugLog('api/chat hit', { hasBody: !!req.body }, 'H_API_HIT');
  const apiKey = req.headers['x-api-key']?.trim() || ENV_API_KEY;
  if (!apiKey) {
    console.warn('[chat] No API key: set X-Api-Key header or .env');
    return res.status(500).json({ error: 'API key required. Set in page (API Key + 厂商) or .env (SILICONFLOW_API_KEY).' });
  }

  const providerKey = (req.headers['x-provider']?.trim() || DEFAULT_PROVIDER).toLowerCase();
  const provider = PROVIDERS[providerKey] || PROVIDERS[DEFAULT_PROVIDER];
  const { messages, stream = false } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }
  if (stream && !provider.openaiFormat) {
    return res.status(400).json({ error: 'Gemini/Claude 暂不支持 stream，请勿传 stream: true' });
  }

  try {
    let r;
    if (providerKey === 'gemini') {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text ?? '') }],
      }));
      const url = `${provider.url}?key=${encodeURIComponent(apiKey)}`;
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 128 } }),
      });
    } else if (providerKey === 'claude') {
      const claudeMessages = messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text ?? '') }));
      r = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: provider.model, max_tokens: 128, messages: claudeMessages }),
      });
    } else {
      const body = {
        model: provider.model,
        messages,
        stream: Boolean(stream),
        max_tokens: 128,
        ...provider.extra,
      };
      r = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    }

    if (!r.ok) {
      const errText = await r.text();
      debugLog('api/chat upstream error', { status: r.status, provider: providerKey, errPreview: errText.slice(0, 100) }, 'H_API_UPSTREAM');
      console.error('[chat] Upstream error:', providerKey, r.status, errText.slice(0, 300));
      try {
        const errJson = JSON.parse(errText);
        return res.status(r.status).json({ error: errJson.error?.message || errJson.message || errText });
      } catch {
        return res.status(r.status).json({ error: errText || r.statusText });
      }
    }

    if (provider.openaiFormat && stream) {
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
    if (providerKey === 'gemini') {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      debugLog('api/chat success', { status: r.status, provider: providerKey }, 'H_API_OK');
      return res.json(openAICompatResponse(text));
    }
    if (providerKey === 'claude') {
      const text = data?.content?.[0]?.text ?? '';
      debugLog('api/chat success', { status: r.status, provider: providerKey }, 'H_API_OK');
      return res.json(openAICompatResponse(text));
    }
    debugLog('api/chat success', { status: r.status, hasChoices: !!data?.choices?.length }, 'H_API_OK');
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
  const headerKey = req.headers['x-api-key']?.trim();
  const keySet = !!headerKey || !!process.env.SILICONFLOW_API_KEY;
  res.json({ ok: true, keySet });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  const keyStatus = ENV_API_KEY ? 'set (AI ready)' : 'NOT SET – add key in page or SILICONFLOW_API_KEY in .env';
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
