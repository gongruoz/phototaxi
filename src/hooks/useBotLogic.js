import { useState, useEffect, useRef, useCallback } from 'react';
import { getLightAt } from '../lib/light';
import { computeSomaticFrame, applySomaticCommand } from '../mind/somatic';
import { instinctTick, resetInstinctAccumulator } from '../mind/instinct';
import { getModulation, setModulationOverride as setEndocrineOverride, clearModulationOverride as clearEndocrineOverride } from '../mind/endocrine';
import { TICK_MS } from '../mind/constants';

/** 初始性格 prompt 的简短描述，用于控制台展示（未设定时显示此项） */
export const INITIAL_PERSONALITY_DISPLAY = '可爱、拟人化的向光小兽；简短生动带萌感的中文内心想法，像小动物碎碎念。';

/** How often we fetch a new AI thought for one bot (alternating). Display stays until next fetch. */
const THOUGHT_INTERVAL_MS = 9000;
/** How often the preset fallback text rotates when AI is not used. */
const PRESET_PHASE_MS = 9000;
const DIALOGUE_DECAY_MS = 8000;
const NEAR_LIGHT_THRESHOLD = 0.5;

async function fetchChat(messages, personalityPrompt = '', apiKey = '', apiProvider = 'siliconflow') {
  const prefix = personalityPrompt.trim()
    ? `【当前性格设定】${personalityPrompt.trim()}\n\n`
    : '';
  const adjusted = messages.map((m) =>
    m.role === 'user' ? { ...m, content: prefix + m.content } : m
  );
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (apiProvider) headers['X-Provider'] = apiProvider;
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: adjusted, stream: false }),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      console.warn('[dialogue] API error', r.status, errBody?.error || errBody?.message || '');
      return '';
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim?.() ?? '';
    return text.slice(0, 120);
  } catch (e) {
    console.warn('[dialogue] API catch', e?.message);
    return '';
  }
}

async function fetchThought(stateText, personalityPrompt = '', apiKey = '', apiProvider = 'siliconflow') {
  const prefix = personalityPrompt.trim()
    ? `【当前性格与行动设定】${personalityPrompt.trim()}\n\n`
    : '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (apiProvider) headers['X-Provider'] = apiProvider;
  try {
    const messages = [
      {
        role: 'user',
        content: `${prefix}你是一只可爱、拟人化的向光小兽。请用一句简短、生动、带一点萌感的中文（15字以内）描述你此刻的「内心想法」——可以像小动物在碎碎念，语气轻松可爱，不要干巴巴的说明。当前状态：${stateText}`,
      },
    ];
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, stream: false }),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      console.warn('[thought] API error', r.status, errBody?.error || errBody?.message || '');
      return '';
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim?.() ?? '';
    return text.slice(0, 80);
  } catch (e) {
    return '';
  }
}

export function useBotLogic({ room, bots, setBots, paused = false, apiKey = '', apiProvider = 'siliconflow' }) {
  const [thoughts, setThoughts] = useState(['', '']);
  const [dialogue, setDialogue] = useState([]);
  const [mindState, setMindState] = useState({});
  const [personalityPrompts, setPersonalityPrompts] = useState({ 0: '', 1: '' });
  const thoughtTimerRef = useRef(null);
  const lastThoughtIndexRef = useRef(0);
  const tickIndexRef = useRef(0);
  const botsRef = useRef(bots);
  const roomRef = useRef(room);
  const personalityPromptsRef = useRef(personalityPrompts);
  const apiKeyRef = useRef(apiKey);
  const apiProviderRef = useRef(apiProvider);
  botsRef.current = bots;
  roomRef.current = room;
  personalityPromptsRef.current = personalityPrompts;
  apiKeyRef.current = apiKey;
  apiProviderRef.current = apiProvider;
  const [presetPhase, setPresetPhase] = useState(0);

  const tick = useCallback(() => {
    if (paused) return;
    if (!room?.bounds || !room?.obstacles || !room?.lights || bots.length < 2) return;
    const { bounds, obstacles, lights } = room;
    tickIndexRef.current += 1;
    const tickIndex = tickIndexRef.current;

    setBots((prev) => {
      const nextBots = [];
      const nextMindState = {};
      for (let index = 0; index < prev.length; index++) {
        const bot = prev[index];
        const botId = bot.id ?? index;
        const frame = computeSomaticFrame(bot, index, prev, room);
        const lightAtBot = getLightAt(bot.x, bot.y, lights);
        const lastReport = bot._lastStateReport || { current_state: 'wandering', time_in_darkness: 0, encounters_count: 0 };
        const modForInstinct = getModulation(botId, lastReport);
        const { command, stateReport } = instinctTick(botId, frame, modForInstinct, { lightAtBot, tickIndex });
        const modulation = getModulation(botId, stateReport);
        const { bot: nextBot, ledPulseHz } = applySomaticCommand(bot, command, room, 1);
        const stepPhase = command.forward_thrust > 0 ? (tickIndex % 2) : (bot.stepPhase ?? 0);
        const withVibration = { ...nextBot, vibration: frame.vibration, ledPulseHz, stepPhase, _lastStateReport: stateReport, modulation };
        nextBots.push(withVibration);
        nextMindState[botId] = {
          somaticFrame: frame,
          instinctReport: stateReport,
          modulation,
        };
      }
      setMindState((m) => ({ ...m, ...nextMindState }));
      return nextBots;
    });
  }, [room, bots.length, setBots, paused]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick, paused]);

  useEffect(() => {
    if (paused || !room?.lights || bots.length < 2) return;
    const updateThought = async (index) => {
      const bot = botsRef.current[index];
      const r = roomRef.current;
      if (!bot || !r?.lights) return;
      const current = getLightAt(bot.x, bot.y, r.lights);
      const report = bot._lastStateReport || {};
      const stateText = `position (${Math.round(bot.x)}, ${Math.round(bot.y)}), light ${current.toFixed(2)}, state ${report.current_state || 'wandering'}, darkness ${report.time_in_darkness ?? 0}s, encounters ${report.encounters_count ?? 0}.`;
      const thought = await fetchThought(stateText, personalityPromptsRef.current[index] ?? '', apiKeyRef.current ?? '', apiProviderRef.current ?? 'siliconflow');
      setThoughts((t) => {
        const next = [...t];
        next[index] = (thought && thought.trim()) ? thought : (t[index] || '');
        return next;
      });
    };
    thoughtTimerRef.current = setInterval(() => {
      const n = Math.max(1, botsRef.current.length);
      const index = lastThoughtIndexRef.current % n;
      lastThoughtIndexRef.current += 1;
      updateThought(index);
    }, THOUGHT_INTERVAL_MS);
    return () => {
      if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    };
  }, [room?.lights, bots.length, paused]);

  const lastDialogueRef = useRef(0);
  useEffect(() => {
    if (paused || !room?.lights || bots.length < 2) return;
    const now = Date.now();
    if (now - lastDialogueRef.current < 12000) return;
    const cur = getLightAt(bots[0].x, bots[0].y, room.lights);
    const cur1 = bots.length > 1 ? getLightAt(bots[1].x, bots[1].y, room.lights) : 0;
    if (cur >= NEAR_LIGHT_THRESHOLD) {
      lastDialogueRef.current = now;
      (async () => {
        const ai = await fetchChat(
          [{ role: 'user', content: '你是向光小兽，刚发现这边有光。用一句简短中文对同伴说一句话（10字以内）。只输出这句话，不要引号。' }],
          personalityPromptsRef.current[0] ?? '',
          apiKeyRef.current ?? '',
          apiProviderRef.current ?? 'siliconflow'
        );
        setDialogue((d) => [...d.slice(-4), { from: 0, text: (ai && ai.trim()) ? ai : '这边有光，要过来吗？' }]);
      })();
    } else if (cur1 >= NEAR_LIGHT_THRESHOLD) {
      lastDialogueRef.current = now;
      (async () => {
        const ai = await fetchChat(
          [{ role: 'user', content: '你是向光小兽，刚发现这边很亮。用一句简短中文对同伴说一句话（10字以内）。只输出这句话，不要引号。' }],
          personalityPromptsRef.current[1] ?? '',
          apiKeyRef.current ?? '',
          apiProviderRef.current ?? 'siliconflow'
        );
        setDialogue((d) => [...d.slice(-4), { from: 1, text: (ai && ai.trim()) ? ai : '这边很亮。' }]);
      })();
    }
  }, [room?.lights, bots, paused]);

  useEffect(() => {
    const id = setInterval(() => {
      setDialogue((d) => (d.length > 0 ? d.slice(1) : d));
    }, DIALOGUE_DECAY_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPresetPhase((p) => p + 1), PRESET_PHASE_MS);
    return () => clearInterval(id);
  }, []);

  const setModulationOverride = useCallback((botId, override) => {
    setEndocrineOverride(botId, override);
  }, []);
  const clearModulationOverride = useCallback((botId) => {
    clearEndocrineOverride(botId);
  }, []);

  const applyUserMessage = useCallback(
    async (targetId, userMessage) => {
      const trimmed = (userMessage || '').trim();
      if (!trimmed) return;
      const isBoth = targetId === 'both';
      const targetLabel = isBoth ? '两只小兽' : `小兽${targetId}`;

      const applyPersonality = (description) => {
        if (!description) return;
        setPersonalityPrompts((prev) => {
          const next = { ...prev };
          const text = description.trim();
          if (isBoth) {
            next[0] = text;
            next[1] = text;
          } else {
            next[targetId] = text;
          }
          return next;
        });
      };

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKeyRef.current) headers['X-Api-Key'] = apiKeyRef.current;
        if (apiProviderRef.current) headers['X-Provider'] = apiProviderRef.current;
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `用户对${targetLabel}说：「${trimmed}」\n\n请严格按两行回复：\n第一行：用50字以内中文描述它/它们接下来应表现的性格与行动倾向（例如：更胆小、更爱探索、更黏同伴、更懒、更谨慎等）。只写这一句描述，不要引号、不要「第一行」等前缀。\n第二行：三个0~1的数字用空格分隔（exploration_noise social_weight light_weight），例如 0.6 0.5 0.8；若不改移动参数就只写一个 - 。`,
              },
            ],
            stream: false,
          }),
        });
        let data = null;
        if (r.ok) {
          try {
            data = await r.json();
          } catch (_) {}
        }
        const raw = data?.choices?.[0]?.message?.content?.trim?.() ?? '';
        const lines = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
        const personalityFromApi = lines[0] ?? '';
        applyPersonality(personalityFromApi || trimmed);

        if (r.ok && lines[1] && lines[1] !== '-') {
          const parts = lines[1].split(/\s+/).map((p) => parseFloat(p));
          if (parts.length >= 3 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
            const [exploration_noise, social_weight, light_weight] = parts;
            if (isBoth) {
              setModulationOverride(0, { exploration_noise, social_weight, light_weight });
              setModulationOverride(1, { exploration_noise, social_weight, light_weight });
            } else {
              setModulationOverride(targetId, { exploration_noise, social_weight, light_weight });
            }
          }
        }
      } catch (e) {
        console.warn('[applyUserMessage]', e?.message);
        applyPersonality(trimmed);
      }
    },
    [setModulationOverride]
  );

  const setPersonalityPromptForBot = useCallback((botId, text) => {
    setPersonalityPrompts((prev) => ({ ...prev, [botId]: text ?? '' }));
  }, []);

  const PRESET_RESTING = [
    '满足，休息中。',
    '晒着光好舒服呀～',
    '先歇一会儿再说。',
    '这里亮亮的，不想动。',
  ];
  const PRESET_HOMING = [
    '往亮处走。',
    '那边有光，过去看看！',
    '亮亮的地方在召唤我～',
    '朝着光走就对啦。',
  ];
  const PRESET_HOMING_TO_PEER = [
    '同伴找到光了，过去一起晒～',
    '收到位置啦，正在靠过去。',
    '跟着同伴的广播走。',
    '要贴贴一起晒太阳。',
  ];
  const PRESET_WANDERING = [
    '游荡中。',
    '到处看看有没有光～',
    '嗯……光在哪里呢？',
    '慢慢找找亮的地方。',
  ];
  const liveThoughts = bots.map((b, i) => {
    const r = b._lastStateReport;
    if (!r) return '…';
    const pool =
      r.current_state === 'resting'
        ? PRESET_RESTING
        : r.current_state === 'homing'
          ? PRESET_HOMING
          : r.current_state === 'homing_to_peer'
            ? PRESET_HOMING_TO_PEER
            : PRESET_WANDERING;
    return pool[(presetPhase + i) % pool.length];
  });

  return {
    thoughts,
    dialogue,
    liveThoughts,
    mindState,
    setModulationOverride,
    clearModulationOverride,
    personalityPrompts,
    setPersonalityPromptForBot,
    applyUserMessage,
  };
}

export function resetMindOnNewRoom() {
  resetInstinctAccumulator(0);
  resetInstinctAccumulator(1);
}
