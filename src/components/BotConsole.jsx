import { useState } from 'react';
import { INITIAL_PERSONALITY_DISPLAY } from '../hooks/useBotLogic';

const BOT_LABELS = ['小兽一', '小兽二'];

export default function BotConsole({ bots = [], mindState = {}, setModulationOverride, clearModulationOverride, personalityPrompts = {}, setPersonalityPromptForBot, applyUserMessage }) {
  const [selectedId, setSelectedId] = useState(bots[0]?.id ?? 0);
  const [talkTargetId, setTalkTargetId] = useState('both');
  const [collapsed, setCollapsed] = useState(false);
  const [userInput, setUserInput] = useState('');

  const handleSayToBots = () => {
    const t = userInput.trim();
    if (t && applyUserMessage) applyUserMessage(talkTargetId, t);
    setUserInput('');
  };

  const label = (i) => BOT_LABELS[i] ?? `Bot ${i}`;

  const id = selectedId ?? bots[0]?.id ?? 0;
  const mind = mindState[id];
  const bot = bots.find((b) => (b.id ?? bots.indexOf(b)) === id) ?? bots[0];

  const handleSlider = (key, value) => {
    const v = parseFloat(value);
    if (Number.isFinite(v)) setModulationOverride?.(id, { [key]: v });
  };

  const handleReset = () => {
    clearModulationOverride?.(id);
  };

  if (bots.length === 0) return null;

  return (
    <section className="bot-console">
      <button
        type="button"
        className="bot-console__toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? '展开 Bot 控制台' : '收起 Bot 控制台'}
      </button>
      {!collapsed && (
        <div className="bot-console__panel">
          <div className="bot-console__section bot-console__talk">
            <h4>对它们说</h4>
            <p className="bot-console__hint">选择对象后输入一句话，会更新其性格与移动策略。</p>
            <div className="bot-console__target-row">
              <label htmlFor="talk-target">对象</label>
              <select
                id="talk-target"
                value={String(talkTargetId)}
                onChange={(e) => setTalkTargetId(e.target.value === 'both' ? 'both' : Number(e.target.value))}
                className="bot-console__target-select"
              >
                <option value="both">两只</option>
                <option value="0">{label(0)}</option>
                <option value="1">{label(1)}</option>
              </select>
            </div>
            <div className="bot-console__input-row">
              <input
                type="text"
                className="bot-console__input"
                placeholder="例如：你要更胆小一点"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSayToBots()}
                aria-label="对小兽说的话"
              />
              <button type="button" className="bot-console__send" onClick={handleSayToBots}>
                发送
              </button>
            </div>
            <div className="bot-console__personality-list">
              <p className="bot-console__personality-item" title="当前性格设定（未设定时显示初始）">
                <span className="bot-console__personality-label">{label(0)}</span> {personalityPrompts[0] || INITIAL_PERSONALITY_DISPLAY}
              </p>
              <p className="bot-console__personality-item" title="当前性格设定（未设定时显示初始）">
                <span className="bot-console__personality-label">{label(1)}</span> {personalityPrompts[1] || INITIAL_PERSONALITY_DISPLAY}
              </p>
            </div>
          </div>
          <div className="bot-console__selector">
            <label htmlFor="bot-select">查看</label>
            <select
              id="bot-select"
              value={String(id)}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {bots.map((b, i) => (
                <option key={b.id ?? i} value={String(b.id ?? i)}>
                  {label(b.id ?? i)}
                </option>
              ))}
            </select>
          </div>

          {mind && (
            <>
              <div className="bot-console__section">
                <h4>躯体层 Somatic</h4>
                <ul className="bot-console__readonly">
                  <li>light_gradient: <code>{(mind.somaticFrame?.light_gradient ?? 0).toFixed(3)}</code></li>
                  <li>peer_rssi: <code>{mind.somaticFrame?.peer_rssi ?? '-'}</code></li>
                  <li>vibration: <code>{(mind.somaticFrame?.vibration ?? 0).toFixed(3)}</code></li>
                  <li>battery_level: <code>{(mind.somaticFrame?.battery_level ?? 0).toFixed(2)}</code></li>
                </ul>
              </div>
              <div className="bot-console__section">
                <h4>本能层 Instinct</h4>
                <ul className="bot-console__readonly">
                  <li>current_state: <code>{mind.instinctReport?.current_state ?? '-'}</code></li>
                  <li>time_in_darkness: <code>{mind.instinctReport?.time_in_darkness ?? 0} s</code></li>
                  <li>encounters_count: <code>{mind.instinctReport?.encounters_count ?? 0}</code></li>
                </ul>
              </div>
              <div className="bot-console__section">
                <h4>内分泌层 Modulation（可调）</h4>
                <div className="bot-console__sliders">
                  <label>
                    <span>exploration_noise</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={mind.modulation?.exploration_noise ?? 0.5}
                      onChange={(e) => handleSlider('exploration_noise', e.target.value)}
                    />
                    <span className="bot-console__val">{(mind.modulation?.exploration_noise ?? 0.5).toFixed(2)}</span>
                  </label>
                  <label>
                    <span>social_weight</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={mind.modulation?.social_weight ?? 0.5}
                      onChange={(e) => handleSlider('social_weight', e.target.value)}
                    />
                    <span className="bot-console__val">{(mind.modulation?.social_weight ?? 0.5).toFixed(2)}</span>
                  </label>
                  <label>
                    <span>light_weight</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={mind.modulation?.light_weight ?? 0.8}
                      onChange={(e) => handleSlider('light_weight', e.target.value)}
                    />
                    <span className="bot-console__val">{(mind.modulation?.light_weight ?? 0.8).toFixed(2)}</span>
                  </label>
                </div>
                <button type="button" className="bot-console__reset" onClick={handleReset}>
                  恢复自动
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
