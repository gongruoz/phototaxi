import { useState, useCallback, useEffect } from 'react';
import { generateRoom, randomSpawn } from './lib/room';
import RoomCanvas from './components/RoomCanvas';
import BotConsole from './components/BotConsole';
import { useBotLogic, resetMindOnNewRoom } from './hooks/useBotLogic';
import './App.css';

function App() {
  const [room, setRoom] = useState(null);
  const [bots, setBots] = useState([]);
  const [apiStatus, setApiStatus] = useState(null); // null | 'ok' | 'no-key' | 'no-backend'
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setApiStatus(d.keySet === true ? 'ok' : 'no-key'))
      .catch(() => setApiStatus('no-backend'));
  }, []);

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

  const { thoughts, dialogue, liveThoughts, mindState, setModulationOverride, clearModulationOverride, personalityPrompts, setPersonalityPromptForBot, applyUserMessage } = useBotLogic({ room, bots, setBots, paused });

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
