/** Vercel serverless: POST /api/chat (multi-provider) */
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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Provider');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key']?.trim() || ENV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key required. Set in page (API Key + 厂商) or env SILICONFLOW_API_KEY.' });
  }

  const providerKey = (req.headers['x-provider']?.trim() || DEFAULT_PROVIDER).toLowerCase();
  const provider = PROVIDERS[providerKey] || PROVIDERS[DEFAULT_PROVIDER];
  const { messages, stream = false } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }
  if (stream && !provider.openaiFormat) {
    return res.status(400).json({ error: 'Gemini/Claude 暂不支持 stream' });
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
      const claudeMessages = messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text ?? ''),
      }));
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
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errJson.message || errText;
      } catch (_) {}
      return res.status(r.status).json({ error: errMsg });
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
      return res.status(200).json(openAICompatResponse(text));
    }
    if (providerKey === 'claude') {
      const text = data?.content?.[0]?.text ?? '';
      return res.status(200).json(openAICompatResponse(text));
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
