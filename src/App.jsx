import { useState, useCallback, useEffect } from 'react';
import { generateRoom, randomSpawn } from './lib/room';
import RoomCanvas from './components/RoomCanvas';
import BotConsole from './components/BotConsole';
import { useBotLogic, resetMindOnNewRoom } from './hooks/useBotLogic';
import './App.css';

const API_KEY_STORAGE = 'phototaxi_api_key';
const API_PROVIDER_STORAGE = 'phototaxi_api_provider';

const PROVIDER_OPTIONS = [
  { value: 'siliconflow', label: '硅基流动' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Anthropic Claude' },
];

function App() {
  const [room, setRoom] = useState(null);
  const [bots, setBots] = useState([]);
  const [apiStatus, setApiStatus] = useState(null); // null | 'ok' | 'no-key' | 'no-backend'
  const [paused, setPaused] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? (localStorage.getItem(API_KEY_STORAGE) ?? '') : '';
    } catch {
      return '';
    }
  });
  const [apiProvider, setApiProvider] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? (localStorage.getItem(API_PROVIDER_STORAGE) ?? 'siliconflow') : 'siliconflow';
    } catch {
      return 'siliconflow';
    }
  });
  const [apiChecking, setApiChecking] = useState(false);

  useEffect(() => {
    if (apiKey.trim()) localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem(API_PROVIDER_STORAGE, apiProvider);
  }, [apiProvider]);

  useEffect(() => {
    const headers = { ...(apiKey.trim() ? { 'X-Api-Key': apiKey.trim() } : {}), 'X-Provider': apiProvider };
    fetch('/api/health', { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setApiStatus(d.keySet === true ? 'ok' : 'no-key'))
      .catch(() => setApiStatus('no-backend'));
  }, []);

  const handleConfirmApi = useCallback(() => {
    setApiChecking(true);
    const headers = { 'X-Provider': apiProvider };
    if (apiKey.trim()) headers['X-Api-Key'] = apiKey.trim();
    fetch('/api/health', { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setApiStatus(d.keySet === true ? 'ok' : 'no-key'))
      .catch(() => setApiStatus('no-backend'))
      .finally(() => setApiChecking(false));
  }, [apiKey, apiProvider]);

  const initRoom = useCallback(() => {
    resetMindOnNewRoom();
    const newRoom = generateRoom();
    setRoom(newRoom);
    const { bounds, obstacles } = newRoom;
    const bot1 = randomSpawn(bounds, obstacles);
    const bot2 = randomSpawn(bounds, obstacles);
    setBots([
      { id: 0, x: bot1.x, y: bot1.y, facing: 0, stepPhase: 0, stepTicksLeft: 8, reasoning: '正在感知光线…' },
      { id: 1, x: bot2.x, y: bot2.y, facing: 0, stepPhase: 0, stepTicksLeft: 8, reasoning: '正在感知光线…' },
    ]);
  }, []);

  useEffect(() => {
    if (!room) initRoom();
  }, []);

  const handleRefresh = () => initRoom();
  const handleBotPositionChange = useCallback((index, pos) => {
    setBots((prev) => prev.map((b, i) => (i === index ? { ...b, x: pos.x, y: pos.y } : b)));
  }, []);

  const { thoughts, dialogue, liveThoughts, mindState, setModulationOverride, clearModulationOverride, personalityPrompts, setPersonalityPromptForBot, applyUserMessage } = useBotLogic({ room, bots, setBots, paused, apiKey: apiKey?.trim() || undefined, apiProvider });

  const getThought = useCallback(
    (index) => (thoughts[index] && thoughts[index].trim()) ? thoughts[index] : (liveThoughts[index] ?? ''),
    [liveThoughts, thoughts]
  );
  const getDialogue = useCallback(() => dialogue, [dialogue]);

  if (!room) return <div className="app"><div className="app-loading">加载中…</div></div>;

  return (
    <div className="app">
      <header className="app-header">
        <h1>向光小兽</h1>
        {apiStatus === 'no-backend' && (
          <span className="api-status api-status--missing" title="未检测到后端，请用 npm run dev 并打开 http://localhost:5173">
            请用 npm run dev 打开本地:5173
          </span>
        )}
        {apiStatus === 'no-key' && (
          <span className="api-status api-status--missing" title="SILICONFLOW_API_KEY 未设置，内心活动与对话将使用预设文案">
            API 未配置
          </span>
        )}
        {apiStatus === 'ok' && (
          <span className="api-status api-status--ok" title="AI 接口已就绪">
            AI 已连接
          </span>
        )}
        <label className="app-header__api-wrap" title="选择厂商后填写对应 API Key">
          <span className="app-header__api-label">厂商</span>
          <select
            className="app-header__api-select"
            value={apiProvider}
            onChange={(e) => setApiProvider(e.target.value)}
            aria-label="API 厂商"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="app-header__api-wrap" title="对应厂商的 API Key，可选">
          <span className="app-header__api-label">API Key</span>
          <input
            type="password"
            className="app-header__api-input"
            placeholder="可选，未填则用 .env 或仅预设"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="app-header__confirm-api"
          onClick={handleConfirmApi}
          disabled={apiChecking}
          title="用当前厂商与 Key 验证并推给后端"
        >
          {apiChecking ? '验证中…' : '确认'}
        </button>
        <button
          type="button"
          className="app-header__pause"
          onClick={() => setPaused((p) => !p)}
          title={paused ? '继续' : '暂停（停止模拟与 AI 拉取）'}
          aria-pressed={paused}
        >
          {paused ? '继续' : '暂停'}
        </button>
      </header>
      <main className="app-main">
        <div className="app-main__content">
          <RoomCanvas
            room={room}
            bots={bots}
            onRefresh={handleRefresh}
            onBotPositionChange={handleBotPositionChange}
            getThought={getThought}
            getDialogue={getDialogue}
          />
          <BotConsole
            bots={bots}
            mindState={mindState}
            setModulationOverride={setModulationOverride}
            clearModulationOverride={clearModulationOverride}
            personalityPrompts={personalityPrompts}
            setPersonalityPromptForBot={setPersonalityPromptForBot}
            applyUserMessage={applyUserMessage}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
