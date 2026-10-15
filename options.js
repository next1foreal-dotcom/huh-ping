// Huh? Ping settings: zero-config. Subscriptions are found through the local bridge; an API key is recognised by itself.
const DEFAULTS = { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', lang: '中文', continueText: '继续', shipText: '好，commit、push 并合并到 main。', sound: true, alwaysShot: false, provider: 'api', termAgent: 'none', bridgeUrl: 'http://127.0.0.1:47321', bridgeToken: '', agentDir: '', termFirst: false, bubbleFirst: true, pdfReader: true, privateSites: "mail.google.com\noutlook.live.com\noutlook.office.com\naccounts.google.com\n*bank*\npaypal.com\nalipay.com\nicloud.com\n1password.com\nbitwarden.com", presets: "[通用]\n翻译 = 把我指的这段翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些\n出处 = 这个说法可以去哪里核实？给出具体的网站、文档或文献名，没把握就直说\n[论文]\n讲人话 = 用外行也能听懂的话，重讲我指的这段在说什么\n翻译 = 把这段译成{lang}，学术术语保留原文并在括号里解释\n方法拆解 = 把这里的方法拆成 3 到 5 步，每步一句话\n新在哪 = 和以前的做法比，这里新在哪里，为什么重要\n局限 = 这个说法或方法有什么前提、局限或可疑的地方\n[英语]\n翻译 = 自然地翻译成{lang}，不要翻译腔\n生词语法 = 挑出难词和难点语法，每个一行：原文 - 意思 - 一个例句\n语气 = 这句话是什么语气，有没有潜台词（客气、催促、不满、讽刺……）\n怎么回 = 如果这是发给我的，给我一句得体的英文回复，并附上{lang}意思\n怎么读 = 给出难词的音标和重音，并标出整句在哪里停顿\n[图片]\n这是什么 = 详细说说图里我指的这一处是什么\n风格手法 = 这是什么风格，用了什么构图、光线、配色和手法\n反推提示词 = 根据原图反推 AI 生图提示词，分成这几段，每段的提示词各放进一个代码块：## Midjourney（英文，结尾带 --ar 画幅 --v 7 --style raw 等参数）；## Flux / SD（英文自然语言长描述：主体、动作、构图、镜头焦段、光线、配色、材质、风格、画质词）；## Nano Banana / GPT Image（英文，一段完整的指令式描述）；## 反向提示词（SD 用）；## 关键参数（画幅比例、景别、可能的风格或 LoRA）。最后一行用{lang}说你最拿不准的地方\n图中文字 = 把图里的文字原样抄出来，再翻译成{lang}\n[视频]\n这一帧 = 这一帧画面里正在发生什么\n怎么做的 = 这个镜头、转场或特效大概是怎么拍、怎么做的\n反推提示词 = 根据这一帧反推 AI 视频提示词，分段放进代码块：## Kling / Veo / Sora（英文：主体、动作、运镜、景别、光线、风格、时长）；## 首帧生图提示词（英文）；## 运镜和节奏（用{lang}说）\n[代码]\n逐行解释 = 逐行解释这段代码，每行一句\n有 bug 吗 = 这段代码有没有 bug、边界情况或安全问题\n怎么用 = 给一个最小的调用例子\n改简洁 = 改写得更简洁易读，并说明改了什么\n[报错]\n怎么修 = 按顺序给出要尝试的修复步骤，附上要运行的命令\n为什么 = 解释为什么会出现这个错误\n[按钮]\n安全吗 = 这个按钮、链接或弹窗安全吗？有没有诈骗、扣费或隐私风险\n点了会怎样 = 点了之后具体会发生什么，能不能撤销\n[数据]\n说明什么 = 这个数据说明了什么，结论靠不靠谱\n有误导吗 = 这个图表或数字有没有误导人的地方" };
const FIELDS = ['lang', 'continueText', 'shipText', 'sound', 'alwaysShot', 'termAgent', 'bridgeUrl', 'agentDir', 'termFirst', 'presets', 'bubbleFirst', 'privateSites', 'pdfReader'];
const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', codebuddy: 'WorkBuddy', gemini: 'Gemini CLI', pi: 'pi' };
// key prefix -> provider; plain sk- keys are probed in order
const BY_PREFIX = [
  [/^sk-or-/, 'OpenRouter', 'https://openrouter.ai/api/v1'],
  [/^xai-/, 'Grok', 'https://api.x.ai/v1'],
  [/^AIza/, 'Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'],
  [/^gsk_/, 'Groq', 'https://api.groq.com/openai/v1'],
  [/^[0-9a-f]{32}\.[A-Za-z0-9]+$/, '智谱', 'https://open.bigmodel.cn/api/paas/v4'],
];
const PROBE = [
  ['DeepSeek', 'https://api.deepseek.com/v1'], ['OpenAI', 'https://api.openai.com/v1'], ['Kimi', 'https://api.moonshot.cn/v1'],
  ['通义', 'https://dashscope.aliyuncs.com/compatible-mode/v1'], ['硅基流动', 'https://api.siliconflow.cn/v1'], ['Kimi', 'https://api.moonshot.ai/v1'],
];
const NOT_CHAT = /embed|whisper|tts|audio|dall-?e|image|moderation|realtime|transcribe|rerank|vision-preview|speech|search-preview|computer-use|-instruct$|babbage|davinci/i;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
const send = (m) => new Promise((ok) => chrome.runtime.sendMessage(m, ok));
let conns = [], pick = '', dismissed = [], openId = null, agentsFound = {};
// model lists per connected account: availCache (shared with the card's model menu) shows instantly, refreshModels() asks again in the background
let availCache = {}; const srcState = {}; const expanded = new Set(), manual = new Set();

// ---------- load + autosave ----------
chrome.storage.local.get({ ...DEFAULTS, conns: null, pick: '', dismissed: [], availCache: {} }, (c) => {
  if (["翻译 = 把我指的这段原文翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些", "[通用]\n翻译 = 把我指的这段翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些\n[论文]\n讲人话 = 用外行也能听懂的话，重讲我指的这段在说什么\n翻译 = 把这段译成{lang}，学术术语保留原文并在括号里解释\n方法拆解 = 把这里的方法拆成 3 到 5 步，每步一句话\n新在哪 = 和以前的做法比，这里新在哪里，为什么重要\n局限 = 这个说法或方法有什么前提、局限或可疑的地方\n[英语]\n翻译 = 自然地翻译成{lang}，不要翻译腔\n生词语法 = 挑出难词和难点语法，每个一行：原文 - 意思 - 一个例句\n语气 = 这句话是什么语气，有没有潜台词（客气、催促、不满、讽刺……）\n怎么回 = 如果这是发给我的，给我一句得体的英文回复，并附上{lang}意思\n怎么读 = 给出难词的音标和重音，并标出整句在哪里停顿\n[图片]\n这是什么 = 详细说说图里我指的这一处是什么\n风格手法 = 这是什么风格，用了什么构图、光线、配色和手法\n生成提示词 = 写一段能用 AI 生图复现这张图的英文提示词\n图中文字 = 把图里的文字原样抄出来，再翻译成{lang}\n[视频]\n这一帧 = 这一帧画面里正在发生什么\n怎么做的 = 这个镜头、转场或特效大概是怎么拍、怎么做的\n生成提示词 = 写一段能用 AI 视频生成复现这个镜头的英文提示词\n[代码]\n逐行解释 = 逐行解释这段代码，每行一句\n有 bug 吗 = 这段代码有没有 bug、边界情况或安全问题\n怎么用 = 给一个最小的调用例子\n改简洁 = 改写得更简洁易读，并说明改了什么\n[报错]\n怎么修 = 按顺序给出要尝试的修复步骤，附上要运行的命令\n为什么 = 解释为什么会出现这个错误\n[按钮]\n安全吗 = 这个按钮、链接或弹窗安全吗？有没有诈骗、扣费或隐私风险\n点了会怎样 = 点了之后具体会发生什么，能不能撤销\n[数据]\n说明什么 = 这个数据说明了什么，结论靠不靠谱\n有误导吗 = 这个图表或数字有没有误导人的地方"].includes(c.presets)) c.presets = DEFAULTS.presets; // untouched old default → current scene packs
  for (const k of FIELDS) { const e = $(k); if (e.type === 'checkbox') e.checked = c[k]; else e.value = c[k]; }
  dismissed = c.dismissed || [];
  if (Array.isArray(c.conns)) { conns = c.conns; pick = c.pick; }
  else {
    if (c.apiKey) conns.push({ id: 'api1', name: 'API', kind: 'api', baseUrl: c.baseUrl, apiKey: c.apiKey, models: [c.model] });
    pick = conns[0] ? conns[0].id + '::' + conns[0].models[0] : '';
  }
  availCache = c.availCache || {};
  render(); poll(); refreshModels();
});
let tSave;
function save() {
  const c = { conns, pick, dismissed };
  for (const k of FIELDS) { const e = $(k); c[k] = e.type === 'checkbox' ? e.checked : (k === 'agentDir' ? e.value.trim() : (e.value.trim() || DEFAULTS[k])); }
  chrome.storage.local.set(c, () => { $('saved').classList.add('show'); clearTimeout(tSave); tSave = setTimeout(() => $('saved').classList.remove('show'), 1200); });
}
FIELDS.forEach((k) => $(k).addEventListener('change', save));

// ---------- 1. subscriptions via the bridge (polled, auto-added) ----------
let lastBridge = null;
async function poll() {
  const r = await send({ type: 'bridge-health', url: $('bridgeUrl').value.trim() || DEFAULTS.bridgeUrl });
  const st = $('bst');
  if (!r || r.error) {
    st.className = 'st off'; agentsFound = {};
    $('bt').textContent = '小桥还没开';
    $('bs').innerHTML = (navigator.platform.startsWith('Win')
      ? '在插件文件夹里双击 <code>bridge\\启动小桥.bat</code>'
      : '在插件文件夹里双击 <code>bridge/启动小桥.command</code>（第一次要右键 → 打开）') + '，窗口开着就行，这里会自动连上。需要先装 <a href="https://nodejs.org" target="_blank">Node.js</a>。';
  } else {
    st.className = 'st on'; agentsFound = r.agents || {};
    const n = Object.values(agentsFound).filter(Boolean).length;
    $('bt').textContent = n ? `已连上，找到 ${n} 个订阅` : '已连上，但电脑上没找到 agent CLI';
    $('bs').textContent = n ? '点一下可以接入或取消。' : '先装好并登录 Claude Code、Codex 或 Cursor CLI，再回来这里。';
    if (r.you === 'other') { // this copy of the extension isn't the one the bridge paired with (an update loaded from a new folder)
      st.className = 'st off'; $('bt').textContent = '已连上，但小桥配对的是另一个 Huh? Ping';
      $('bs').textContent = '换过插件文件夹就会这样。关掉小桥窗口，从这个插件文件夹里双击「启动小桥」；或者在小桥窗口里输入 y 回车。';
    }
    let changed = false;
    for (const [a, ok] of Object.entries(agentsFound)) {
      if (ok && !dismissed.includes(a) && !conns.some((x) => x.kind === 'cli' && x.agent === a)) { conns.push({ id: 'cli-' + a, name: AGENT_NAMES[a] || a, kind: 'cli', agent: a, models: [''] }); changed = true; }
    }
    if (changed) { render(); save(); refreshModels(); }
  }
  // the bridge came up, went away, or was swapped for another version: the lists under each subscription follow
  const bkey = !r || r.error ? 'off' : 'v' + (r.version || 0) + (r.you || '');
  if (lastBridge !== null && bkey !== lastBridge) refreshModels(conns.filter((x) => x.kind === 'cli').map((x) => x.id));
  lastBridge = bkey;
  renderAgents();
  setTimeout(poll, r && !r.error ? 6000 : 2000);
}
function renderAgents() {
  $('agents').innerHTML = Object.keys(AGENT_NAMES).filter((a) => a in agentsFound).map((a) => {
    const inn = conns.some((x) => x.kind === 'cli' && x.agent === a);
    return `<span class="ag ${agentsFound[a] ? (inn ? 'in' : '') : 'no'}" data-a="${a}" title="${agentsFound[a] ? '' : '电脑上没装'}">${AGENT_NAMES[a]}</span>`;
  }).join('');
  $('agents').querySelectorAll('.ag:not(.no)').forEach((b) => (b.onclick = () => {
    const a = b.dataset.a, i = conns.findIndex((x) => x.kind === 'cli' && x.agent === a);
    if (i >= 0) { conns.splice(i, 1); dismissed.push(a); } else { dismissed = dismissed.filter((d) => d !== a); conns.push({ id: 'cli-' + a, name: AGENT_NAMES[a], kind: 'cli', agent: a, models: [''] }); }
    render(); save(); if (i < 0) refreshModels(['cli-' + a]);
  }));
}

// ---------- 2. paste a key, recognise the provider ----------
$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addKey').click(); });
$('key').addEventListener('paste', () => setTimeout(() => $('addKey').click(), 30));
$('addKey').onclick = async () => {
  const key = $('key').value.trim(); const m = $('kmsg'); if (!key) return;
  $('addKey').disabled = true; m.className = 'msg'; m.textContent = '识别中…';
  const hit = BY_PREFIX.find(([re]) => re.test(key));
  const tries = hit ? [[hit[1], hit[2]]] : PROBE;
  const results = await Promise.all(tries.map(([name, url]) => send({ type: 'list-models', baseUrl: url, apiKey: key }).then((r) => ({ name, url, r }))));
  const ok = results.find((x) => x.r && x.r.models);
  $('addKey').disabled = false;
  if (!ok) { m.className = 'msg bad'; m.textContent = hit ? `看着是 ${hit[1]} 的 key，但它不认：${(results[0].r || {}).error || '连不上'}` : '认不出是哪家的 key。到高级设置里填一下地址。'; return; }
  addApi(ok.name, ok.url, key, ok.r.models); $('key').value = '';
  m.className = 'msg ok'; m.textContent = `✓ 接上了 ${ok.name}，找到 ${ok.r.models.length} 个模型`;
};
$('addCustom').onclick = async () => {
  const url = $('cUrl').value.trim().replace(/\/+$/, ''), key = $('cKey').value.trim(), m = $('cmsg'); if (!url) return;
  m.className = 'msg'; m.textContent = '连接中…';
  const r = await send({ type: 'list-models', baseUrl: url, apiKey: key });
  let name; try { name = new URL(url).hostname.replace(/^(api|www)\./, ''); } catch (_) { m.className = 'msg bad'; m.textContent = '地址不对'; return; }
  addApi(name, url, key, (r && r.models) || []);
  m.className = r && r.models ? 'msg ok' : 'msg'; m.textContent = r && r.models ? `✓ 接上了，找到 ${r.models.length} 个模型` : '已加上，但拉不到模型列表，点开它手动填模型名。';
  $('cUrl').value = $('cKey').value = '';
};
function addApi(name, baseUrl, apiKey, avail) {
  const chat = avail.filter((x) => !NOT_CHAT.test(x));
  let list = chat.length ? chat : avail;
  if (/deepseek\.com/.test(baseUrl) && list.includes('deepseek-flash')) list = ['deepseek-flash', ...list.filter((x) => x !== 'deepseek-flash')]; // fastest + reads images
  const models = list.slice(0, 3);
  const old = conns.find((x) => x.kind === 'api' && x.baseUrl === baseUrl);
  if (old) Object.assign(old, { apiKey, avail, models: old.models.length ? old.models : models });
  else { const id = 'api-' + Math.random().toString(36).slice(2, 7); conns.push({ id, name, kind: 'api', baseUrl, apiKey, avail, models }); if (!pick || /deepseek\.com/.test(baseUrl) || !conns.some((c) => pick.startsWith(c.id + '::'))) pick = id + '::' + (models[0] || ''); openId = id; }
  render(); save();
}

// ---------- connected list ----------
// every connected account shows its models as chips: 默认模型 first (subscriptions), then the most common ~8, then 更多 (N)
const TOP = 8;
const POPULAR = /^(gpt-5(\.\d+)?(-mini)?|gpt-4o(-mini)?|gpt-4\.1|o\d(-mini)?|deepseek-(flash|v4-pro|chat|reasoner)|grok-\d(\.\d+)?|kimi-k2[\w.-]*|moonshot-v1-8k|qwen-(max|plus|turbo)|qwen3[\w.-]*|glm-4\.\d+|gemini-[\d.]+-(pro|flash)|claude-[\w.-]*(sonnet|opus)[\w.-]*|llama-3\.\d-70b[\w-]*)$/i;
const SNAPSHOT = /-\d{4}-\d{2}-\d{2}$|-\d{8}$|-\d{4}$|preview|exp/i;
const availOf = (x) => (availCache[x.id] && availCache[x.id].m && availCache[x.id].m.length ? availCache[x.id].m : x.avail || []);
// CLIs already list their models in their own order (recommended first); API /models is alphabetical, so the usual chat models go first
function ranked(x) {
  const score = (m) => (NOT_CHAT.test(m) ? 100 : 0) + (SNAPSHOT.test(m) ? 10 : 0) + (x.kind === 'api' && !POPULAR.test(m) ? 5 : 0);
  return availOf(x).map((m, i) => [m, score(m), i]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map((p) => p[0]);
}
// [visible chips, how many more are hidden]
function chipsOf(x, q) {
  const all = ranked(x), extra = x.models.filter((m) => m && !all.includes(m));
  const head = x.kind === 'cli' ? [''] : [];
  if (expanded.has(x.id)) {
    const f = (q || '').toLowerCase();
    const list = [...head, ...extra, ...all].filter((m) => !f || (m || '默认模型').toLowerCase().includes(f));
    return [list.slice(0, 400), 0];
  }
  const top = all.slice(0, TOP), sel = all.slice(TOP).filter((m) => x.models.includes(m));
  return [[...head, ...extra, ...top, ...sel], all.length - top.length - sel.length];
}
const chipHtml = (x, m) => `<span class="chip ${x.models.includes(m) ? 'in' : ''} ${m ? '' : 'def'}" data-m="${esc(m)}">${esc(m || '默认模型')}</span>`;
function chipsHtml(x, q) {
  const [list, more] = chipsOf(x, q);
  return list.map((m) => chipHtml(x, m)).join('')
    + (more > 0 ? `<span class="chip more" data-act="more">更多 (${more})</span>` : '')
    + (expanded.has(x.id) ? `<span class="chip more" data-act="less">收起</span>` : '')
    + (expanded.has(x.id) && !list.length ? '<span class="empty">没有匹配的模型</span>' : '');
}
function noteOf(x) {
  const s = srcState[x.id] || {}, has = availOf(x).length, src = (availCache[x.id] || {}).src;
  if (s.loading && !has) return { cls: '', t: '正在拉取模型列表…' };
  if (x.kind !== 'cli') return s.note && !has ? { cls: 'bad', t: s.note } : null;
  if (s.state === 'off') return { cls: 'bad', t: '小桥没开，先双击「启动小桥」' + (has ? (src === 'builtin' ? '。下面先列出内置清单' : '。下面是上次拉到的列表') : '，模型列表会自己出来') };
  if (s.state === 'old') return { cls: 'bad', t: s.note + (has ? '。下面的列表先用着' : '') };
  if (s.state === 'pair') return { cls: 'bad', t: '小桥不认这个插件（见上面「已连上，但…」的说明）' + (has ? '，下面的列表先用着' : '') };
  if (s.note && !has) return { cls: 'bad', t: s.note + '。可以点「没找到？手动输入」填模型名' };
  // a list is there but isn't the CLI's own answer: say so quietly, with the reason for debugging
  if (has && (src === 'builtin' || src === 'cache') && (s.state === 'fallback' || s.err)) {
    const why = s.err ? `（实时获取失败：${s.err}）` : '';
    return { cls: '', t: (src === 'cache' ? '列表来自 CLI 的本地缓存' : '列表来自内置清单') + why };
  }
  return null;
}
function rowHtml(x) {
  const has = availOf(x).length, q = (document.querySelector(`.conn[data-id="${CSS.escape(x.id)}"] .flt`) || {}).value || '';
  const n = noteOf(x);
  // an API key whose provider gave no list: the plain input, as before
  if (x.kind === 'api' && !has) return `<div class="ch"><span class="nm">${esc(x.name)}</span><span class="tg">API</span><span class="ms">${esc(x.models.join(' · ') || '还没选模型')}</span><button class="x" title="移除">×</button></div>
    <div class="ed"><input class="addm" placeholder="输入模型名，回车添加">${x.models.length ? `<div class="chips">${x.models.map((m) => chipHtml(x, m)).join('')}</div>` : ''}${n ? `<div class="mnote ${n.cls}">${esc(n.t)}</div>` : ''}</div>`;
  return `<div class="ch"><span class="nm">${esc(x.name)}</span><span class="tg">${x.kind === 'api' ? 'API' : '订阅'}</span><span class="ms"></span>${srcState[x.id] && srcState[x.id].loading && has ? '<span class="spin" title="正在刷新模型列表"></span>' : ''}<button class="x" title="移除">×</button></div>
    <div class="ed">${n ? `<div class="mnote ${n.cls}">${esc(n.t)}</div>` : ''}
      ${expanded.has(x.id) ? `<input class="flt" placeholder="搜模型（共 ${has} 个）" value="${esc(q)}" spellcheck="false">` : ''}
      <div class="chips">${chipsHtml(x, q)}</div>
      ${manual.has(x.id) ? `<input class="addm" placeholder="输入模型名，回车添加${x.kind === 'cli' ? `；不填就用 ${esc(x.name)} 自己的默认模型` : ''}" spellcheck="false">` : `<button class="lnk" data-act="manual">没找到？手动输入</button>`}</div>`;
}
function render() {
  $('conns').innerHTML = conns.map((x) => `<div class="conn open" data-id="${esc(x.id)}">${rowHtml(x)}</div>`).join('')
    || '<div class="empty">还没接入。开小桥，或者粘贴一个 key。</div>';
  $('conns').querySelectorAll('.conn').forEach((box) => bindRow(box));
  pickList();
}
// redraw one account (keeps the caret in its search box)
function renderRow(x) {
  const box = document.querySelector(`.conn[data-id="${CSS.escape(x.id)}"]`); if (!box) return render();
  const a = document.activeElement, inFlt = a && box.contains(a) && a.classList.contains('flt'), pos = inFlt ? a.selectionStart : 0;
  box.innerHTML = rowHtml(x); bindRow(box);
  if (inFlt) { const f = box.querySelector('.flt'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }
  pickList();
}
function bindRow(box) {
  const x = conns.find((c) => c.id === box.dataset.id); if (!x) return;
  box.querySelector('.x').onclick = () => { conns = conns.filter((c) => c !== x); if (x.kind === 'cli') dismissed.push(x.agent); render(); renderAgents(); save(); };
  const flt = box.querySelector('.flt');
  if (flt) flt.oninput = () => { box.querySelector('.chips').innerHTML = chipsHtml(x, flt.value); };
  const addm = box.querySelector('.addm');
  if (addm) addm.onkeydown = (e) => { if (e.key !== 'Enter' || !addm.value.trim()) return; const v = addm.value.trim(); if (!x.models.includes(v)) x.models = [...x.models, v]; manual.delete(x.id); render(); save(); };
  const lnk = box.querySelector('.lnk');
  if (lnk) lnk.onclick = () => { manual.add(x.id); renderRow(x); const i = box.querySelector('.addm'); if (i) i.focus(); };
  box.querySelector('.ed').onclick = (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.act === 'more') { expanded.add(x.id); renderRow(x); const f = box.querySelector('.flt'); if (f) f.focus(); return; }
    if (c.dataset.act === 'less') { expanded.delete(x.id); renderRow(x); return; }
    const m = c.dataset.m;
    x.models = x.models.includes(m) ? x.models.filter((v) => v !== m) : [...x.models, m];
    if (x.kind === 'cli') { if (!x.models.length) x.models = ['']; if (x.models.includes('')) x.models = ['', ...x.models.filter(Boolean)]; }
    renderRow(x); save();
  };
}
// the default model: every model of every connected account, one group per account
function pickList() {
  const groups = conns.map((x) => {
    let ms = [...new Set([...(x.kind === 'cli' ? [''] : []), ...x.models, ...ranked(x)])];
    if (pick.startsWith(x.id + '::')) { const pm = pick.slice(x.id.length + 2); if (!ms.includes(pm)) ms = [...ms, pm]; }
    return [x, ms];
  }).filter(([, ms]) => ms.length);
  const opts = groups.flatMap(([x, ms]) => ms.map((m) => x.id + '::' + m));
  if (!opts.includes(pick)) pick = opts[0] || '';
  $('pick').innerHTML = groups.map(([x, ms]) => `<optgroup label="${esc(x.name)}">${ms.map((m) => { const v = x.id + '::' + m; return `<option value="${esc(v)}" ${v === pick ? 'selected' : ''}>${esc(x.name + ' · ' + (m || '默认模型'))}</option>`; }).join('')}</optgroup>`).join('') || '<option value="">先接入一个</option>';
}
$('pick').onchange = (e) => {
  pick = e.target.value;
  // a model picked here also goes on that account's chips, so the card's model chip can name it
  const x = conns.find((c) => pick.startsWith(c.id + '::')), m = x ? pick.slice(x.id.length + 2) : null;
  if (x && m !== null && !x.models.includes(m)) { x.models = [...x.models, m]; if (x.models.includes('')) x.models = ['', ...x.models.filter(Boolean)]; renderRow(x); }
  save();
};

// ---------- model lists: cached first, then asked again in the background ----------
async function refreshModels(ids) {
  const list = conns.filter((x) => (!ids || ids.includes(x.id)) && (x.kind === 'cli' || availOf(x).length));
  if (!list.length) return;
  list.forEach((x) => { srcState[x.id] = { ...(srcState[x.id] || {}), loading: true }; renderRow(x); });
  const r = (await send({ type: 'conn-models', conns: list })) || {};
  const st = await chrome.storage.local.get('availCache'); availCache = st.availCache || {};
  for (const x of list) {
    const s = r[x.id] || { state: 'error', note: '模型列表没拉到' };
    srcState[x.id] = { state: s.state, note: s.note, err: s.err, loading: false };
    if (s.avail && s.avail.length) availCache[x.id] = { t: Date.now(), m: s.avail, src: s.src || (availCache[x.id] || {}).src };
    if (conns.includes(x)) renderRow(x);
  }
}
