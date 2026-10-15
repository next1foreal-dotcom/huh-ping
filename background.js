// Huh? Ping — service worker: talks to any OpenAI-compatible endpoint (streaming) and grabs screenshots.
const DEFAULTS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  lang: '中文',
  continueText: '继续',
  shipText: '好，commit、push 并合并到 main。',
  sound: true,
  alwaysShot: false,
  provider: 'api',          // api | codex | claude | gemini | pi  (who answers ? and !)
  termAgent: 'none',        // none | codex | claude | gemini | pi (who gets 继续 / Push & Merge when the page has no chat box)
  bridgeUrl: 'http://127.0.0.1:47321',
  bridgeToken: '',
  agentDir: '',
  termFirst: false, bubbleFirst: true, pdfReader: true, privateSites: "mail.google.com\noutlook.live.com\noutlook.office.com\naccounts.google.com\n*bank*\npaypal.com\nalipay.com\nicloud.com\n1password.com\nbitwarden.com",
  presets: "[通用]\n翻译 = 把我指的这段翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些\n出处 = 这个说法可以去哪里核实？给出具体的网站、文档或文献名，没把握就直说\n[论文]\n讲人话 = 用外行也能听懂的话，重讲我指的这段在说什么\n翻译 = 把这段译成{lang}，学术术语保留原文并在括号里解释\n方法拆解 = 把这里的方法拆成 3 到 5 步，每步一句话\n新在哪 = 和以前的做法比，这里新在哪里，为什么重要\n局限 = 这个说法或方法有什么前提、局限或可疑的地方\n[英语]\n翻译 = 自然地翻译成{lang}，不要翻译腔\n生词语法 = 挑出难词和难点语法，每个一行：原文 - 意思 - 一个例句\n语气 = 这句话是什么语气，有没有潜台词（客气、催促、不满、讽刺……）\n怎么回 = 如果这是发给我的，给我一句得体的英文回复，并附上{lang}意思\n怎么读 = 给出难词的音标和重音，并标出整句在哪里停顿\n[图片]\n这是什么 = 详细说说图里我指的这一处是什么\n风格手法 = 这是什么风格，用了什么构图、光线、配色和手法\n反推提示词 = 根据原图反推 AI 生图提示词，分成这几段，每段的提示词各放进一个代码块：## Midjourney（英文，结尾带 --ar 画幅 --v 7 --style raw 等参数）；## Flux / SD（英文自然语言长描述：主体、动作、构图、镜头焦段、光线、配色、材质、风格、画质词）；## Nano Banana / GPT Image（英文，一段完整的指令式描述）；## 反向提示词（SD 用）；## 关键参数（画幅比例、景别、可能的风格或 LoRA）。最后一行用{lang}说你最拿不准的地方\n图中文字 = 把图里的文字原样抄出来，再翻译成{lang}\n[视频]\n这一帧 = 这一帧画面里正在发生什么\n怎么做的 = 这个镜头、转场或特效大概是怎么拍、怎么做的\n反推提示词 = 根据这一帧反推 AI 视频提示词，分段放进代码块：## Kling / Veo / Sora（英文：主体、动作、运镜、景别、光线、风格、时长）；## 首帧生图提示词（英文）；## 运镜和节奏（用{lang}说）\n[代码]\n逐行解释 = 逐行解释这段代码，每行一句\n有 bug 吗 = 这段代码有没有 bug、边界情况或安全问题\n怎么用 = 给一个最小的调用例子\n改简洁 = 改写得更简洁易读，并说明改了什么\n[报错]\n怎么修 = 按顺序给出要尝试的修复步骤，附上要运行的命令\n为什么 = 解释为什么会出现这个错误\n[按钮]\n安全吗 = 这个按钮、链接或弹窗安全吗？有没有诈骗、扣费或隐私风险\n点了会怎样 = 点了之后具体会发生什么，能不能撤销\n[数据]\n说明什么 = 这个数据说明了什么，结论靠不靠谱\n有误导吗 = 这个图表或数字有没有误导人的地方",
};
const OLD_PRESETS = ["翻译 = 把我指的这段原文翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些", "[通用]\n翻译 = 把我指的这段翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些\n[论文]\n讲人话 = 用外行也能听懂的话，重讲我指的这段在说什么\n翻译 = 把这段译成{lang}，学术术语保留原文并在括号里解释\n方法拆解 = 把这里的方法拆成 3 到 5 步，每步一句话\n新在哪 = 和以前的做法比，这里新在哪里，为什么重要\n局限 = 这个说法或方法有什么前提、局限或可疑的地方\n[英语]\n翻译 = 自然地翻译成{lang}，不要翻译腔\n生词语法 = 挑出难词和难点语法，每个一行：原文 - 意思 - 一个例句\n语气 = 这句话是什么语气，有没有潜台词（客气、催促、不满、讽刺……）\n怎么回 = 如果这是发给我的，给我一句得体的英文回复，并附上{lang}意思\n怎么读 = 给出难词的音标和重音，并标出整句在哪里停顿\n[图片]\n这是什么 = 详细说说图里我指的这一处是什么\n风格手法 = 这是什么风格，用了什么构图、光线、配色和手法\n生成提示词 = 写一段能用 AI 生图复现这张图的英文提示词\n图中文字 = 把图里的文字原样抄出来，再翻译成{lang}\n[视频]\n这一帧 = 这一帧画面里正在发生什么\n怎么做的 = 这个镜头、转场或特效大概是怎么拍、怎么做的\n生成提示词 = 写一段能用 AI 视频生成复现这个镜头的英文提示词\n[代码]\n逐行解释 = 逐行解释这段代码，每行一句\n有 bug 吗 = 这段代码有没有 bug、边界情况或安全问题\n怎么用 = 给一个最小的调用例子\n改简洁 = 改写得更简洁易读，并说明改了什么\n[报错]\n怎么修 = 按顺序给出要尝试的修复步骤，附上要运行的命令\n为什么 = 解释为什么会出现这个错误\n[按钮]\n安全吗 = 这个按钮、链接或弹窗安全吗？有没有诈骗、扣费或隐私风险\n点了会怎样 = 点了之后具体会发生什么，能不能撤销\n[数据]\n说明什么 = 这个数据说明了什么，结论靠不靠谱\n有误导吗 = 这个图表或数字有没有误导人的地方"];
// conns: every account you connect, used side by side. kind 'api' = any OpenAI-compatible endpoint; kind 'cli' = an agent CLI via the local bridge.
// pick: 'connId::model' that answers by default. A card's model chip can switch it per question.
DEFAULTS.conns = null; DEFAULTS.pick = '';
const getCfg = () => new Promise((res) => chrome.storage.local.get(DEFAULTS, (c) => {
  if (!Array.isArray(c.conns)) { // migrate the v0.1/v0.2 single-provider settings
    c.conns = [];
    if (c.apiKey) c.conns.push({ id: 'api1', name: hostName(c.baseUrl), kind: 'api', baseUrl: c.baseUrl, apiKey: c.apiKey, models: [c.model] });
    if (c.provider && c.provider !== 'api') c.conns.push({ id: 'cli-' + c.provider, name: c.provider, kind: 'cli', agent: c.provider, models: [''] });
    c.pick = c.conns.length ? (c.provider !== 'api' && c.conns.find((x) => x.kind === 'cli') ? 'cli-' + c.provider + '::' : 'api1::' + c.model) : '';
  }
  if (OLD_PRESETS.includes(c.presets)) c.presets = DEFAULTS.presets; // untouched v0.7 default → the scene packs
  res(c);
}));
const hostName = (u) => { try { return new URL(u).hostname.replace(/^api\./, ''); } catch (_) { return 'API'; } };
const choices = (c) => c.conns.flatMap((x) => (x.models.length ? x.models : ['']).map((m) => ({ value: x.id + '::' + m, conn: x.name, model: m || '默认' })));
const resolve = (c, pick) => { const v = pick || c.pick || (choices(c)[0] || {}).value || ''; const [id, ...rest] = v.split('::'); return { conn: c.conns.find((x) => x.id === id), model: rest.join('::') }; };

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
// one health check: is the bridge up, is it new enough to list models, which CLIs are installed, is it paired with *this* copy
// (Chrome sends no Origin on this GET, so the extension names itself in X-Huh-Ext; bridge v4+ answers with `you`)
const BRIDGE_WANT = 5;
const bridgeHealth = (c) => withTimeout(fetch(c.bridgeUrl.replace(/\/+$/, '') + '/health', { headers: { 'X-Huh': '1', 'X-Huh-Ext': chrome.runtime.id } }).then((r) => r.json()), 3000).catch(() => null);
// what to show when a CLI's list can't be fetched at all (an old bridge, a pairing problem): the same names bridge v4 ships
const BUILTIN = {
  claude: ['opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  gemini: ['auto', 'pro', 'flash', 'flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  codex: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  cursor: ['auto', 'composer-2.5', 'composer-2.5-fast', 'gpt-5.6-sol-high', 'gpt-5.6-luna-high', 'claude-opus-5-thinking-high', 'claude-sonnet-5-thinking-high', 'gemini-3.7-flash-high', 'cursor-grok-4.5-high', 'gpt-5.5'],
};
const PAIR_NOTE = '小桥配对的是另一个 Huh? Ping（换过插件文件夹会这样），所以回答和模型列表都会被拒：关掉小桥窗口，从这个插件文件夹里双击「启动小桥」；或者在小桥窗口里输入 y 回车';
const shortErr = (s) => String(s || '').replace(/^PAIRED_OTHER:\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 140);
// POST /models on the bridge -> { models, source, error }; never throws (HTTP errors, non-JSON and timeouts become error)
async function bridgeModels(bu, agent) {
  try {
    const r = await withTimeout(fetch(bu + '/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent }) }), 45000);
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    if (!r.ok || !j) return { models: [], source: 'none', status: r.status, pair: r.status === 403 && /PAIRED_OTHER|paired with another/i.test(t), error: `HTTP ${r.status}: ${shortErr((j && j.error) || t) || '空回复'}` };
    return { models: Array.isArray(j.models) ? j.models : [], source: j.source || (j.models && j.models.length ? 'live' : 'none'), error: j.error ? shortErr(j.error) : '' };
  } catch (e) { return { models: [], source: 'none', error: e && e.message === 'timeout' ? '小桥 45 秒没回' : `连不上小桥：${shortErr(e && e.message || e)}` }; }
}
// the model list of one connected account: from availCache when fresh enough, else asked again (bridge POST /models, or GET {baseUrl}/models)
// returns { avail, note, state, src, err } — state: ok | off | old | pair | missing | error | fallback ; src: live | cache | builtin | static
async function sourceModels(c, x, health, cache, maxAge) {
  const bu = c.bridgeUrl.replace(/\/+$/, ''); const key = x.id; const hit = cache[key]; let note = '', state = 'ok', err = '';
  if (x.kind === 'cli' && health && health.agents && health.agents[x.agent] === false) state = 'missing';
  if (x.kind === 'cli' && !health) { state = 'off'; note = '小桥没开：双击「启动小桥」'; }
  else if (x.kind === 'cli' && !(health.version >= 3)) { state = 'old'; note = '小桥是旧版，列不出模型：关掉原来的小桥窗口，再双击新版的「启动小桥」'; }
  else if (x.kind === 'cli' && health.you === 'other') { state = 'pair'; note = PAIR_NOTE; }
  else if (!hit || hit.src === 'builtin' || Date.now() - hit.t > maxAge) {
    if (x.kind === 'cli') {
      const j = await bridgeModels(bu, x.agent);
      if (j.pair) { state = 'pair'; note = PAIR_NOTE; }
      else if (j.models.length) { cache[key] = { t: Date.now(), m: j.models, src: j.source }; if (j.source === 'builtin' || j.source === 'cache') { state = 'fallback'; err = j.error; } }
      else { err = j.error || '小桥没给出列表'; state = 'error'; note = err + (health.version < BRIDGE_WANT ? '（换新版小桥能修好：关掉小桥窗口，双击新版「启动小桥」）' : ''); }
    } else {
      try {
        const fresh = (await withTimeout(fetch(x.baseUrl.replace(/\/+$/, '') + '/models', { headers: { Authorization: 'Bearer ' + x.apiKey } }).then((r) => r.json()), 12000)).data.map((m) => m.id).filter(Boolean).sort();
        if (fresh && fresh.length) cache[key] = { t: Date.now(), m: fresh, src: 'live' };
      } catch (e) { if (!cache[key]) { note = '模型列表没拉到'; state = 'error'; err = shortErr(e && e.message || e); } }
    }
  } else if (hit && (hit.src === 'cache')) { state = 'fallback'; }
  // nothing live and nothing cached: a CLI still gets its built-in names, so there is always something to click
  if (x.kind === 'cli' && !(cache[key] && cache[key].m.length) && BUILTIN[x.agent]) {
    cache[key] = { t: 0, m: BUILTIN[x.agent], src: 'builtin' };
    if (state === 'error') { state = 'fallback'; note = ''; }
  }
  const avail = cache[key] ? cache[key].m : (x.kind === 'api' ? (x.avail || []) : []);
  return { avail, note, state, src: cache[key] ? cache[key].src || 'live' : '', err };
}
// every model each connected account can use, for the model chip on a card
async function menuGroups() {
  const c = await getCfg(); const st = await chrome.storage.local.get('availCache'); const cache = st.availCache || {};
  const health = c.conns.some((x) => x.kind === 'cli') ? await bridgeHealth(c) : null;
  const groups = await Promise.all(c.conns.map(async (x) => {
    if (x.kind === 'cli' && health && health.agents && health.agents[x.agent] === false && c.pick.split('::')[0] !== x.id) return null; // not installed on this computer: don't list it
    const { avail, note, state } = await sourceModels(c, x, health, cache, 10 * 60e3);
    const chosen = x.models.length ? x.models : [''];
    const models = [...new Set([...(x.kind === 'cli' ? [''] : []), ...chosen, ...avail])];
    return { id: x.id, conn: x.name, models, note: avail.length && !['pair', 'off', 'old'].includes(state) ? '' : (note || (avail.length ? '' : '模型列表没拉到，可以在上面的搜索框里直接输入模型名')) };
  }));
  chrome.storage.local.set({ availCache: cache });
  return groups.filter(Boolean);
}
// the settings page: every connected account's full list, asked fresh (the cache is shown first, this refreshes it)
async function optionModels(given) { // given: the accounts as the settings page has them right now (it may not have saved yet)
  const c = await getCfg(); const st = await chrome.storage.local.get('availCache'); const cache = st.availCache || {};
  const list = Array.isArray(given) ? given : c.conns;
  const health = list.some((x) => x.kind === 'cli') ? await bridgeHealth(c) : null;
  const out = {};
  await Promise.all(list.map(async (x) => { if (x.kind === 'api' && !x.avail?.length && !cache[x.id]) { out[x.id] = { avail: [], note: '', state: 'none' }; return; } out[x.id] = await sourceModels(c, x, health, cache, 60e3); }));
  const now = await chrome.storage.local.get('availCache'); await chrome.storage.local.set({ availCache: { ...(now.availCache || {}), ...Object.fromEntries(list.filter((x) => cache[x.id]).map((x) => [x.id, cache[x.id]])) } });
  return out;
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
  // tabs opened before install/reload don't get the content script; inject it so Alt+click works without refreshing
  for (const t of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] })) {
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'cfg') { getCfg().then((c) => { const { apiKey, bridgeToken, conns, ...safe } = c; reply({ ...safe, choices: choices(c) }); }); return true; } // keys never reach the page
  if (msg.type === 'cli-models') {
    getCfg().then((c) => bridgeModels(c.bridgeUrl.replace(/\/+$/, ''), msg.agent)).then((j) => reply(j.models.length ? j : { ...j, models: BUILTIN[msg.agent] || [], source: 'builtin' }), () => reply({ models: BUILTIN[msg.agent] || [], source: 'builtin' }));
    return true;
  }
  if (msg.type === 'addModel') { // a model name typed into the menu: remember it on that account
    getCfg().then(async (c) => { const x = c.conns.find((k) => k.id === msg.id); if (x && msg.model && !x.models.includes(msg.model)) { x.models = [...x.models.filter(Boolean), msg.model]; await chrome.storage.local.set({ conns: c.conns }); } reply(true); });
    return true;
  }
  if (msg.type === 'conn-models') { optionModels(msg.conns).then(reply, () => reply({})); return true; }
  if (msg.type === 'menu') { menuGroups().then(reply, () => reply([])); return true; }
  if (msg.type === 'list-models') { // GET {baseUrl}/models for an API connection
    fetch(msg.baseUrl.replace(/\/+$/, '') + '/models', { headers: { Authorization: 'Bearer ' + msg.apiKey } })
      .then((r) => r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`))))
      .then((j) => reply({ models: (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort() }), (e) => reply({ error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'bridge-health') {
    getCfg().then((c) => fetch((msg.url || c.bridgeUrl).replace(/\/+$/, '') + '/health', { method: 'GET', headers: { 'X-Huh': '1', 'X-Huh-Ext': chrome.runtime.id } })
      .then((r) => r.ok ? r.json() : r.text().then((t) => ({ error: t })))
      .then(reply, () => reply({ error: 'OFF' })));
    return true;
  }
  if (msg.type === 'options') { chrome.runtime.openOptionsPage(); return false; }
  if (msg.type === 'img') { fetchImg(msg.url).then(reply, () => reply({})); return true; }
  if (msg.type === 'relay') { chrome.tabs.sendMessage(sender.tab.id, { ...msg, frameId: sender.frameId }, { frameId: 0 }).catch(() => {}); return false; }
  if (msg.type === 'relayGo') { chrome.tabs.sendMessage(sender.tab.id, msg, { frameId: msg.frameId }).catch(() => {}); return false; }
  if (msg.type === 'shot') {
    const tab = sender.tab.id, sub = sender.frameId > 0, vis = (v) => chrome.tabs.sendMessage(tab, { type: 'hostVis', v }, { frameId: 0 }).catch(() => {});
    const cap = () => chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 80 });
    (sub ? vis(false).then(() => new Promise((r) => setTimeout(r, 60))).then(cap).finally(() => vis(true)) : cap())
      .then((url) => reply({ url }), (e) => reply({ error: String(e && e.message || e) }));
    return true;
  }
  return false;
});

// Streaming chat over a port: {messages} in, {delta} / {done} / {error} out.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'huh-chat') return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async ({ messages, agent, pick }) => {
    const cfg = await getCfg();
    if (agent) return viaBridge(port, ctrl, cfg, agent);
    const { conn, model } = resolve(cfg, pick);
    if (!conn) { port.postMessage({ error: 'NO_KEY' }); return; }
    if (conn.kind === 'cli') return viaBridge(port, ctrl, cfg, { agent: conn.agent, mode: 'ask', model, ...flatten(messages) });
    if (!conn.apiKey && !/localhost|127\.0\.0\.1/.test(conn.baseUrl)) { port.postMessage({ error: 'NO_KEY' }); return; }
    try {
      const r = await fetch(conn.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + conn.apiKey },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.4, ...(/deepseek\.com/.test(conn.baseUrl) ? { thinking: { type: 'disabled' } } : {}) }), // DeepSeek thinks by default; off = first token in ~1s
      });
      if (!r.ok) { port.postMessage({ error: `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}` }); return; }
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (data === '[DONE]') continue;
          try { const j = JSON.parse(data); const d = j.choices && j.choices[0] && (j.choices[0].delta || {}).content; if (d) port.postMessage({ delta: d }); } catch (_) {}
        }
      }
      port.postMessage({ done: true });
    } catch (e) { if (e.name !== 'AbortError') port.postMessage({ error: String(e.message || e) }); }
  });
});

// ---- local bridge (your own Codex / Claude Code / Gemini CLI / pi logins) ----
function flatten(messages) {
  let image = null;
  const text = messages.map((m) => {
    const c = typeof m.content === 'string' ? m.content : m.content.map((p) => { if (p.type === 'image_url') { image = p.image_url.url; return ''; } return p.text; }).join('\n');
    return m.role === 'system' ? c : `${m.role === 'user' ? 'USER' : 'YOU (earlier answer)'}:\n${c}`;
  }).join('\n\n');
  return { prompt: text + '\n\nReply with the answer text only. Do not run commands or edit files.', image };
}
async function viaBridge(port, ctrl, cfg, job) {
  try {
    const r = await fetch(cfg.bridgeUrl.replace(/\/+$/, '') + '/run', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, cwd: cfg.agentDir || undefined }),
    });
    if (!r.ok) { const t = await r.text(); port.postMessage({ error: /PAIRED_OTHER|paired with another/i.test(t) ? PAIR_NOTE : `Bridge ${r.status}: ${t.slice(0, 300)}` }); return; }
    const rd = r.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { value, done } = await rd.read(); if (done) break; const d = dec.decode(value, { stream: true }); if (d) port.postMessage({ delta: d }); }
    port.postMessage({ done: true });
  } catch (e) {
    if (e.name !== 'AbortError') port.postMessage({ error: /Failed to fetch/.test(e.message) ? 'NO_BRIDGE_RUNNING' : String(e.message || e) });
  }
}

// the original image behind an <img>, shrunk to 1280px, as a data URL (for "反推提示词" and image questions)
async function fetchImg(u) {
  const r = await fetch(u, { credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const bmp = await createImageBitmap(await r.blob());
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const buf = new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { url: 'data:image/jpeg;base64,' + btoa(bin), w: bmp.width, h: bmp.height };
}
