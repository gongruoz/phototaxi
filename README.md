# 向光小兽 · Phototaxi Simulation

2D 俯视模拟：随机房间、光源与障碍物，两只趋光小兽在「躯体层 → 本能层 → 内分泌层」三层心智下移动。找到光的 bot 会向同伴「播报」位置，另一只会朝其靠拢并贴在一起晒光。内心想法与对话由 Silicon Flow API 生成，支持在控制台**对单只或两只**输入一句话以更新性格与移动策略。内分泌层的情绪会体现在 bot 的 **LED 呼吸**上。界面为极简深色风格，带可折叠 **Bot 控制台** 与暂停。

---

## 心智架构（Somatic – Instinct – Endocrine）

目标是把「肉体本能」和「系统意志」分开：**高频物理反射**在躯体层，**空间与势场决策**在本能层，**慢速情绪与人格**在内分泌层；LLM 仅用于内心/对话与「对它们说」的性格设定。

| 层级 | 职责 | 本仓库中的实现 |
|------|------|----------------|
| **躯体层 Somatic** | 传感器 → 数据帧；命令 → 电机/LED。无记忆，毫秒级。 | `src/mind/somatic.js`：光梯度、peer RSSI、振动（碰撞/接触代理）；当同伴处于 `resting` 时计算 `peer_broadcast_angle_diff`（模拟蓝牙播报）；执行 `forward_thrust` / `angular_velocity` / `led_pulse_hz`；撞墙时 unstuck 转角 |
| **本能层 Instinct** | 势场 v = w₁∇L + w₂∇S + η；趋光、群集、稳态；**homing_to_peer**（朝播报者靠拢）；向内分泌汇报状态。 | `src/mind/instinct.js`：势场、光梯度死区防转圈、稳态与 homing_to_peer、状态报告 |
| **内分泌层 Endocrine** | 情绪代谢（暗处→焦虑→exploration_noise 等）；输出调制参数供本能层与 **LED 呼吸** 使用。 | `src/mind/endocrine.js`：焦虑/渴望映射、调制输出、控制台覆盖 |

数据流：**Somatic 帧（含可选 `peer_broadcast_angle_diff`）→ Instinct（+ 调制）→ 命令 → Somatic 执行**；Instinct 定期向 Endocrine 报状态，Endocrine 输出调制回 Instinct 与前端画布（LED 呼吸频率与深度）。

---

## 当前功能

- **模拟**：房间、障碍、光源、两只 bot；每 tick（120 ms）按三层顺序更新位置与 mind state；步态偏慢、带轻微 wobble，撞墙自动转向脱困。
- **躯体层**：`light_gradient`、`peer_rssi`、`vibration`、`battery_level`；若某只 bot 处于 `resting`，为另一只提供 `peer_broadcast_angle_diff`；执行命令并做 unstuck 处理。
- **本能层**：趋光（光梯度死区减少原地转圈）+ 同伴吸引 + 探索噪声；`resting`（振动+光强高，或已靠近播报同伴）；**homing_to_peer**（朝正在休息的同伴移动）；输出 `current_state`、`time_in_darkness`、`encounters_count`。
- **内分泌层**：`time_in_darkness`→焦虑→`exploration_noise`；相遇次数→`social_weight`；调制用于本能势场与 **LED 呼吸**（频率 `led_pulse_hz`、深度由 modulation 合成）。
- **内心与对话**：定时请求 LLM 生成简短内心想法（每只独立 **personality prompt**，未设定时用初始描述）；靠近光时触发对话。API 走 Silicon Flow（DeepSeek-V3.2）；未配置时回退预设文案，并以固定节奏轮换减少闪烁。
- **Bot 控制台**：
  - **对它们说**：选择对象（两只 / 小兽一 / 小兽二）→ 输入一句话 → 发送；API 返回一行性格描述（写入该 bot 的 prompt）与可选一行三数（exploration_noise, social_weight, light_weight）写入调制。
  - **人格展示**：小兽一 / 小兽二 当前性格 prompt，未设定时显示初始描述（与 `useBotLogic` 中 `INITIAL_PERSONALITY_DISPLAY` 一致），改动后实时更新。
  - 选 bot → 查看 Somatic / Instinct / Modulation → 滑块调三参数，按钮「恢复自动」。
- **界面**：极简深色 UI（DM Sans、留白、细边框）；画布「换一局」、拖拽 bot；Header 暂停（停止 tick 与 AI 拉取）。

---

## 运行与部署

**注意：** 开发时请用 `npm run dev` 并打开 **http://localhost:5173**（或终端里 Vite 给出的端口）。不要用 `npm run build` + `npm run preview` 做日常开发，preview 没有后端，AI 与 API 状态会不可用。

若出现 **`EADDRINUSE: address already in use :::3001`**，说明 3001 已被占用，可 `lsof -i :3001` 查 PID 后 `kill <PID>`。

1. 复制环境变量并填写 Silicon Flow API key：
   ```bash
   cp .env.example .env
   # 编辑 .env：SILICONFLOW_API_KEY=你的key
   ```
   未配置时，内心活动与对话会回退到预设文案。

2. 启动开发服务（Vite + API 代理）：
   ```bash
   npm run dev
   ```
   等待终端出现 `API proxy listening on http://localhost:3001` 和 Vite 的 `Local: http://localhost:5173/`（或 5174）。

   **若终端没有 `[s]` / `[v]` 输出**：可开两个终端，分别执行 `npm run server` 和 `npm run dev:vite`，再在浏览器打开 Vite 显示的 Local 地址。

3. 在浏览器打开 **Vite 的 Local 地址**（不是 3001）。Header 可**暂停**模拟与 AI 拉取；画布「换一局」刷新房间，拖拽 bot 重定位；画布下方为可折叠 Bot 控制台（对它们说、人格展示、查看/调节单只 bot 参数）。

### 项目结构（前端与心智）

```
src/
  App.jsx, App.css, main.jsx
  components/   RoomCanvas.jsx（画布、气泡、bot 绘制与 LED 呼吸）
                BotConsole.jsx（对它们说、人格展示、Somatic/Instinct/Modulation 查看与滑块）
  hooks/        useBotLogic.js（tick、内心/对话请求、personalityPrompts、applyUserMessage）
  mind/         somatic.js, instinct.js, endocrine.js, constants.js
  lib/          light.js（光强与采样）, room.js（房间生成、碰撞）
```
后端：`server/` 提供 `/api/chat`、`/api/health` 等（见 `npm run server`）。

### 生产部署

- 本地：`npm run build` 后 `NODE_ENV=production npm start`，访问 http://localhost:3001。
- Render：见仓库内 `render.yaml`；在 Environment 中配置 `SILICONFLOW_API_KEY`。

API key 仅在后端代理使用，勿提交 `.env`；生产环境在宿主环境变量中配置。

---

## 与 ESP 的接口约定（下一步：硬件侧要实现什么）

模拟端已经按「与 ESP 等价」的接口来设计。ESP 只需实现**躯体层**的输入与输出，与本能/内分泌层通过**同一份 JSON 契约**协作。

### 1. ESP → 本能层：躯体数据帧（Somatic 输出）

ESP 以固定频率（建议 50–100 Hz，可与本能层 tick 对齐或做简单缓冲）向「上层」（本机运行的本能层，或通过蓝牙/Wi‑Fi 发往手机/服务器）发送一帧数据，格式为：

```json
{
  "light_gradient": 0.4,
  "peer_rssi": -65,
  "vibration": 0.3,
  "battery_level": 0.5
}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `light_gradient` | number | 左右光强差，范围建议 [-1, 1]。正=右侧更亮（如 (E−W) 或左右 LDR 归一化差）。 |
| `peer_rssi` | number | 同伴蓝牙 RSSI 或等效信号强度，单位 dBm 或与距离映射的代理值（如 -90～-50，越近越接近 -50）。 |
| `vibration` | number | 振动/接触强度，[0, 1]。无挤压传感器时用振动传感器或碰撞检测代理；有则可用电流/微动开关等。 |
| `battery_level` | number | 电量 [0, 1]。 |

本仓库模拟实现见 `src/mind/somatic.js` 的 `computeSomaticFrame`（以及 `constants.js` 中 RSSI 距离映射等），ESP 侧只需按同样语义从硬件采样并组包。

### 2. 本能层 → ESP：运动与 LED 命令（Somatic 输入）

上层（本能层，或汇聚了内分泌调制的逻辑）每 tick 计算后，向 ESP 下发一条命令：

```json
{
  "forward_thrust": 0.6,
  "angular_velocity": 0.2,
  "led_pulse_hz": 1.2
}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `forward_thrust` | number | 前进推力 [0, 1]，映射到四足步态速度或 PWM。 |
| `angular_velocity` | number | 转向角速度（弧度/周期），正=右转，负=左转；ESP 转为差速或舵机。 |
| `led_pulse_hz` | number | 内部呼吸灯频率 (Hz)，可与同伴同步做耦合振子效果。 |

ESP 只负责把这三项变成电机与 LED 的物理输出，不做路径规划或情绪计算。

### 3. ESP 端建议的代码结构

- **传感器采集模块**  
  周期读取：左右 LDR（算出 `light_gradient`）、蓝牙扫描/广播得到的 peer RSSI、振动传感器或碰撞检测（得到 `vibration`）、电量（得到 `battery_level`）。  
  输出：上述 JSON 数据帧（可先在本机用结构体/队列，再通过 BLE 或 WiFi 发给上层时序列化为 JSON）。

- **执行器模块**  
  接收「命令」JSON（或等价二进制）：解析 `forward_thrust`、`angular_velocity`、`led_pulse_hz`，驱动四足步态 PWM 与 LED 定时/频率。  
  建议与采集解耦：例如采集固定 50 Hz，执行器以相同或 2× 频率消费最新命令并做平滑。

- **与上层协作的两种方式**  
  - **本机跑本能+内分泌**：在 ESP32 上用 C/Arduino 或 MicroPython 实现与 `instinct.js` / `endocrine.js` 同逻辑的势场与调制，ESP 内 Somatic 输出→本能→命令→Somatic 执行。  
  - **手机/服务器跑本能+内分泌**：ESP 通过 BLE 或 WiFi 发送数据帧、接收命令；手机 App 或本仓库的 Node 服务运行本能层（可移植 instinct/endocrine 逻辑到 TypeScript/其他语言），或通过 WebSocket 与现有模拟共享同一套状态机，实现「一只真机 + 一只模拟」或双机联调。

无论哪种，**契约**就是上面两份 JSON；本仓库的 `src/mind/instinct.js`、`endocrine.js` 和常量可作为「参考实现」直接对照或移植。

---

## 下一步要做的事（路线图）

1. **ESP 固件**  
   - 实现数据帧的采集与上报、命令的接收与执行，满足上述 JSON 契约。  
   - 标定：LDR 与 `light_gradient` 的映射、距离与 `peer_rssi` 的映射、振动/碰撞与 `vibration` 的映射，使数值范围与模拟端常量（如 `RSSI_NEAR`/`RSSI_FAR`、`RESTING_VIBRATION_THRESHOLD`）可对齐或做简单线性换算。

2. **联调与桥接**  
   - 若用手机/服务器：定义传输协议（如 BLE GATT 或 WebSocket），在模拟或 Node 服务中增加「硬件 bot」通道：接收 ESP 数据帧、送入同一套 instinct/endocrine，把输出命令回传 ESP。  
   - 支持「混合场景」：例如 1 个模拟 bot + 1 个 ESP bot，共享同一房间的拓扑（光、障碍需在两端一致或由服务器权威）。

3. **内分泌层 LLM 集成（可选）**  
   - 在内分泌层定时（如每 1–2 分钟）把当前 stateReport + 电量/孤独感等组装成 prompt，请求 LLM 返回「焦躁指数」「对同伴渴望指数」等 [0,1] 数值，写回调制或仅作展示；与现有 `fetchThought` 类似但频率更低、输出结构化。  
   - 需设计 prompt 与解析方式，并考虑延迟与失败时的回退（例如保持当前调制或使用规则代谢）。

---

## 需要进一步实验与设计的问题

为逼近「具身认知」与「自然逻辑」，下列问题适合通过小实验迭代验证和调参：

1. **势场权重与噪声**  
   - `light_weight` / `social_weight` / `exploration_noise` 在真实光环境与多机下的合适区间；焦虑对 `exploration_noise` 的映射曲线（当前为线性 + 上限），是否要非线性或饱和。  
   - **实验**：在控制台固定某一权重、变化另一权重，观察趋光与聚群行为；在真机上重复并记录 RSSI/光强与行为关系。

2. **稳态（resting）触发条件**  
   - 当前为 `vibration` 与局部光强双超阈值。真机无挤压时仅靠振动/碰撞，是否容易误触发或难以触发；是否要加入「持续接触时长」或滞后（进入/离开 resting 的迟滞）。  
   - **实验**：在模拟中调高/调低 `RESTING_VIBRATION_THRESHOLD`、`RESTING_LIGHT_THRESHOLD`，看双 bot 相遇后是否稳定进入 resting；在真机上用振动强度与 LED 状态做对照。

3. **同伴感知与群集**  
   - RSSI 与距离的映射在真实环境中非单调、多径多；是否需要滤波、时间窗或「最近 N 次采样」再映射到 `peer_rssi`。  
   - **实验**：两机固定距离变化，记录 RSSI 分布；在模拟中用不同 `RSSI_NEAR_DIST`/`RSSI_FAR_DIST` 复现，观察 encounter 计数与 homing 行为是否合理。

4. **节奏与频率**  
   - 模拟 tick 120 ms；ESP 采集与命令下发频率、本能层运行频率（同机 vs 云端）对延迟与稳定性的影响。  
   - **实验**：在模拟中改 `TICK_MS` 或本能层计算步长，观察行为差异；真机联调时测量端到端延迟，决定是否在 ESP 侧做命令插值或预测。

5. **情绪与表达的衔接**  
   - 当前「内心想法」由定时 + 状态描述请求 LLM，人格可由「对它们说」注入；内分泌调制已驱动 LED 呼吸频率与深度。尚未做的是：把结构化情绪指数（如焦虑/渴望）注入内心 prompt，使文案更贴合状态。  
   - **实验**：在内分泌层增加「当前焦虑/渴望」到 fetchThought prompt 的注入，A/B 对比同一场景下生成句子的差异与主观自然度。

6. **多 bot 与扩展**  
   - 两只以上 bot 时，`peer_rssi` 取最近一只还是聚合多只；LED 相位同步是两两耦合还是全局耦合。  
   - **实验**：在模拟中增加第三只 bot，观察 encounter 与 resting 逻辑是否需扩展（例如「成对 resting」vs「群体 resting」）。

把上述实验的结果（参数范围、阈值、是否引入滞后/滤波等）反馈到 `src/mind/constants.js` 与本能/内分泌逻辑，即可逐步收敛到既符合生物学隐喻又工程可维护的设定；ESP 端保持「只实现 Somatic 契约」即可与这套心智持续协作。
