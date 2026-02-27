/** Vercel serverless: GET /api/health */
const ENV_API_KEY = process.env.SILICONFLOW_API_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Provider');
}

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const headerKey = req.headers['x-api-key']?.trim();
  const keySet = !!headerKey || !!ENV_API_KEY;
  res.status(200).json({ ok: true, keySet });
}
