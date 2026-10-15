#!/usr/bin/env node
// Huh? Bridge — lets the Huh? Ping extension use the agent CLIs you are already signed in to
// (Codex / Claude Code / Gemini CLI / pi / Cursor / CodeBuddy-WorkBuddy), so answers come out of your own subscriptions.
// Node 18+, no dependencies. Listens on 127.0.0.1 only. No token to copy: the extension in this bridge's own folder is
// recognised by its ID, the first extension that calls is remembered, and any other one has to be let in by typing y in
// this window (run with --reset to forget every pairing).
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import crypto from 'node:crypto'; import { EventEmitter } from 'node:events'; import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.HUH_PORT || 47321);
const CONF = path.join(os.homedir(), '.huh-bridge.json');
let conf = {}; try { conf = JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch (_) {}
const save = () => { try { fs.writeFileSync(CONF, JSON.stringify(conf, null, 2), { mode: 0o600 }); } catch (e) { console.error('  [huh] could not save ' + CONF + ': ' + e.message); } };
// v4: several paired extensions (an update unzipped into a new folder is a new extension ID); v3 kept just one in conf.ext
conf.exts = [...new Set([...(Array.isArray(conf.exts) ? conf.exts : []), ...(conf.ext ? [conf.ext] : [])])]; delete conf.ext;
if (process.argv.includes('--reset')) { conf.exts = []; save(); }
export { listModels, BRIDGE_VERSION, STATIC_MODELS, BUILTIN_MODELS, selfIds, spawnCli, runOut, resolved as _resolved };
const DEFAULT_CWD = process.env.HUH_CWD || process.cwd();
const WIN = process.platform === 'win32';
// one bad request must never take the bridge down (the window would just say "press any key")
process.on('uncaughtException', (e) => console.error('  [huh] error: ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => console.error('  [huh] error: ' + (e && e.stack || e)));

// started as `node huh-bridge.mjs` (not imported by a test)
const real = (f) => { try { f = fs.realpathSync(f); } catch (_) {} return WIN ? f.toLowerCase() : f; };
const MAIN = !!process.argv[1] && real(path.resolve(process.argv[1])) === real(fileURLToPath(import.meta.url));

// ---- pairing --------------------------------------------------------------------------
// An unpacked extension's ID is derived from its folder path (Chromium crx_file::id_util::GenerateIdForPath:
// sha256 of the path — UTF-16LE with an upper-case drive letter on Windows — first 16 bytes, hex mapped to a-p).
// This bridge sits in <extension folder>/bridge, so it can recognise "its own" extension without asking, even after
// the user loads an update from a new folder.
const HERE = path.dirname(fileURLToPath(import.meta.url));
export function idForPath(p, win = WIN) {
  let s = p; if (win && /^[a-z]:/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  const h = crypto.createHash('sha256').update(Buffer.from(s, win ? 'utf16le' : 'utf8')).digest('hex').slice(0, 32);
  return h.replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
const selfIds = (() => {
  const dirs = new Set(); const ext = path.resolve(HERE, '..'); dirs.add(ext);
  try { dirs.add(fs.realpathSync(ext)); } catch (_) {} try { dirs.add(fs.realpathSync.native(ext)); } catch (_) {}
  return new Set([...dirs].map((d) => idForPath(d.replace(/[\\/]+$/, ''))));
})();
let pending = null; // an unknown extension that asked; the user can type y in this window to let it in
const allowExt = (id) => { if (!conf.exts.includes(id)) { conf.exts.push(id); save(); console.log(`  Paired with extension ${id} ✓`); } };
function pairState(ext) {
  if (!ext) return 'none';
  if (conf.exts.includes(ext)) return 'ok';
  if (selfIds.has(ext) || !conf.exts.length) { allowExt(ext); return 'ok'; }
  if (pending !== ext) { pending = ext; console.log(`\n  ⚠ 另一个插件 ${ext} 想用小桥（更新后换了插件文件夹就会这样）。\n    如果是你的 Huh? Ping，在这个窗口输入 y 回车。 / Another extension wants this bridge: type y + Enter to allow it.\n`); }
  return 'other';
}
if (process.stdin && !process.stdin.destroyed && MAIN) {
  try {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { if (pending && /^\s*y/i.test(String(d))) { allowExt(pending); pending = null; } });
    process.stdin.on('error', () => {});
  } catch (_) {}
}

// ---- finding and starting the CLIs ----------------------------------------------------------
// Windows: npm installs CLIs as .cmd shims, Cursor installs a .cmd that starts a .ps1, and since Node 18.20.2 / 20.12.2
// a .cmd/.bat can't be spawned without a shell at all (EINVAL). cmd.exe would also mangle multi-line prompts.
// So the shim is read and its real program run directly. PATH is searched here (not with `where`, whose output is in the
// console code page and garbles non-ASCII user folders).
export function findOnPath(bin, env = process.env, win = WIN) {
  const dirs = String(env.PATH || env.Path || '').split(win ? ';' : ':').map((d) => d.replace(/^"|"$/g, '')).filter(Boolean);
  const exts = win ? ['', ...String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())] : [''];
  const hits = [];
  for (const d of dirs) for (const e of exts) {
    const f = path.join(d, bin + e);
    try { const st = fs.statSync(f); if (!st.isFile()) continue; if (!win) { fs.accessSync(f, fs.constants.X_OK); } else if (!e && !/\.\w+$/.test(bin)) continue; hits.push(f); } catch (_) {}
  }
  return hits;
}
const verKey = (n) => (n.match(/\d+/g) || []).map((x) => x.padStart(10, '0')).join('.');
const resolved = {};
// -> { cmd, pre, env } ready for spawn(cmd, [...pre, ...args], { shell: false })
export function resolveBin(bin, { win = WIN, env = process.env, node = process.execPath } = {}) {
  const key = bin + '|' + win; if (resolved[key]) return resolved[key];
  const hits = findOnPath(bin, env, win);
  if (!win) return (resolved[key] = { cmd: hits[0] || bin, pre: [], env: {} });
  const exe = hits.find((h) => /\.exe$/i.test(h)); if (exe) return (resolved[key] = { cmd: exe, pre: [], env: {} });
  const shim = hits.find((h) => /\.(cmd|bat)$/i.test(h));
  if (shim) {
    const dir = path.dirname(shim); let txt = ''; try { txt = fs.readFileSync(shim, 'utf8'); } catch (_) {}
    const js = txt.match(/"%~?dp0%?\\([^"]+?\.(?:c|m)?js)"/i); if (js) return (resolved[key] = { cmd: node, pre: [path.join(dir, ...js[1].split(/[\\/]/))], env: {} });
    const e2 = txt.match(/"%~?dp0%?\\([^"]+?\.exe)"/i); if (e2) return (resolved[key] = { cmd: path.join(dir, ...e2[1].split(/[\\/]/)), pre: [], env: {} });
    // Cursor: <dir>\cursor-agent.cmd -> cursor-agent.ps1 -> <dir>\versions\<newest>\node.exe index.js (or node.exe next to it)
    const inv = { CURSOR_INVOKED_AS: path.basename(shim) };
    if (fs.existsSync(path.join(dir, 'node.exe')) && fs.existsSync(path.join(dir, 'index.js'))) return (resolved[key] = { cmd: path.join(dir, 'node.exe'), pre: [path.join(dir, 'index.js')], env: inv });
    try {
      const vs = fs.readdirSync(path.join(dir, 'versions')).filter((v) => /^\d{4}\.\d{1,2}\.\d{1,2}/.test(v) && fs.existsSync(path.join(dir, 'versions', v, 'index.js'))).sort((a, b) => (verKey(a) < verKey(b) ? 1 : -1));
      if (vs.length) { const vd = path.join(dir, 'versions', vs[0]); const ne = path.join(vd, 'node.exe'); return (resolved[key] = { cmd: fs.existsSync(ne) ? ne : node, pre: [path.join(vd, 'index.js')], env: inv }); }
    } catch (_) {}
    const ps1 = shim.replace(/\.(cmd|bat)$/i, '.ps1');
    if (fs.existsSync(ps1)) return (resolved[key] = { cmd: path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), pre: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], env: inv });
    // last resort: through cmd.exe (fine for short arguments like `models`)
    return (resolved[key] = { cmd: env.ComSpec || 'cmd.exe', pre: ['/d', '/s', '/c', shim], env: {}, viaCmd: true });
  }
  return (resolved[key] = { cmd: hits[0] || bin, pre: [], env: {} });
}
// spawn that never throws: a failure comes back as an 'error' event, like a missing program does
function spawnCli(bin, args, opts = {}) {
  const r = resolveBin(bin);
  try {
    return spawn(r.cmd, [...r.pre, ...args], { ...opts, shell: false, windowsHide: true, windowsVerbatimArguments: false, env: { ...process.env, ...r.env, ...(opts.env || {}) } });
  } catch (e) {
    const fake = new (class extends EventEmitter {})(); fake.stdout = new EventEmitter(); fake.stderr = new EventEmitter();
    fake.stdin = { write() {}, end() {} }; fake.kill = () => {}; fake.exitCode = 1;
    setImmediate(() => { if (fake.listenerCount('error')) fake.emit('error', e); fake.emit('close', null); });
    return fake;
  }
}
const onPath = (bin) => findOnPath(bin).length > 0;
// agent id -> executable names to try (Cursor ships both `cursor-agent` and `agent`; WorkBuddy's CLI is CodeBuddy Code)
const BINS = { codex: ['codex'], claude: ['claude'], gemini: ['gemini'], pi: ['pi'], cursor: ['cursor-agent', 'agent'], codebuddy: ['codebuddy', 'cbc'] };
const AGENTS = Object.keys(BINS);
const binOf = (a) => (BINS[a] || []).find(onPath);
const has = (a) => !!binOf(a);
// ---- how each CLI is driven ----------------------------------------------------------
// ask: a one-off read-only question (the ? and ! pings). go/ship: continue the latest session in the project folder.
function plan(agent, mode, prompt, img, model) {
  const p = plan0(agent, mode, prompt, img);
  if (p && model) p.args.splice(p.modelAt ?? 0, 0, ...(agent === 'codex' || agent === 'gemini' ? ['-m', model] : ['--model', model]));
  if (p) p.bin = binOf(agent) || p.bin;
  return p;
}
function plan0(agent, mode, prompt, img) {
  const withImg = (p) => (img ? `${p}\n\n(Screenshot of the pinged spot: ${img})` : p);
  switch (agent) {
    case 'codex':
      if (mode === 'ask') return { modelAt: 1, bin: 'codex', args: ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-c', 'model_reasoning_effort=low', ...(img ? ['--image', img] : []), '-'], stdin: prompt, out: 'text' };
      return { modelAt: 1, bin: 'codex', args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', ...(mode === 'ship' ? ['-c', 'sandbox_workspace_write.network_access=true'] : []), 'resume', '--last', prompt], out: 'text' };
    case 'claude': {
      const base = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
      if (mode === 'ask') return { bin: 'claude', args: [...base, '--allowedTools', 'Read'], stdin: withImg(prompt), out: 'claude-json' };
      const tools = mode === 'ship' ? ['--allowedTools', 'Bash(git *),Bash(gh *),Read,Edit'] : ['--permission-mode', 'acceptEdits'];
      return { bin: 'claude', args: [...base, '--continue', ...tools], stdin: prompt, out: 'claude-json' };
    }
    case 'gemini':
      if (mode === 'ask') return { bin: 'gemini', args: ['-p', withImg(prompt)], out: 'text' };
      return { bin: 'gemini', args: ['-r', 'latest', '-p', prompt, '--approval-mode', mode === 'ship' ? 'yolo' : 'auto_edit'], out: 'text' };
    case 'pi':
      if (mode === 'ask') return { bin: 'pi', args: ['--no-session', '-p', ...(img ? ['@' + img] : []), prompt], out: 'text' };
      return { bin: 'pi', args: ['-c', '-p', prompt], out: 'text' };
    case 'cursor': // Cursor subscription: ask mode is read-only; go/ship continue the latest chat with --force
      if (mode === 'ask') return { bin: 'cursor-agent', args: ['-p', '--mode', 'ask', '--trust', '--output-format', 'text', withImg(prompt)], out: 'text' };
      return { bin: 'cursor-agent', args: ['-p', '--continue', '--force', '--trust', '--output-format', 'text', prompt], out: 'text' };
    case 'codebuddy': // WorkBuddy / CodeBuddy subscription
      if (mode === 'ask') return { bin: 'codebuddy', args: ['-p', withImg(prompt)], out: 'text' };
      return { bin: 'codebuddy', args: ['-c', '-p', prompt], out: 'text' };
  }
  return null;
}


// ---- which models each subscription can use ---------------------------------------------
// codex/pi/cursor are asked directly; claude/gemini take their documented aliases. Whatever happens, a list comes back:
// { models, source: 'live' | 'cache' | 'builtin' | 'static', error? } — error is a short reason the live list failed.
const BRIDGE_VERSION = 5;
// documented aliases + current full ids (Claude Code model-config docs, Gemini CLI models.ts) — checked Oct 2026
const STATIC_MODELS = {
  claude: ['opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  gemini: ['auto', 'pro', 'flash', 'flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'],
};
// shown when the CLI can't be asked (Codex `model/list` and Cursor `agent models` as of Sep/Oct 2026)
const BUILTIN_MODELS = {
  codex: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  cursor: ['auto', 'composer-2.5', 'composer-2.5-fast', 'gpt-5.6-sol-high', 'gpt-5.6-luna-high', 'claude-opus-5-thinking-high', 'claude-sonnet-5-thinking-high', 'gemini-3.7-flash-high', 'cursor-grok-4.5-high', 'gpt-5.5'],
  pi: [], codebuddy: [],
};
// run a listing command: { out, err, code, error } — never throws, never hangs past `ms`
const runOut = (bin, args, ms = 20000) => new Promise((ok) => {
  let out = '', err = '', done = false; const fin = (code, error) => { if (!done) { done = true; clearTimeout(t); ok({ out, err, code, error }); } };
  const c = spawnCli(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout && c.stdout.on('data', (d) => { out += d; }); c.stderr && c.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  c.on('close', (code) => fin(code)); c.on('error', (e) => fin(null, e.code ? `${e.code}` : String(e.message || e)));
  const t = setTimeout(() => { try { c.kill(); } catch (_) {} fin(null, `${Math.round(ms / 1000)} 秒没返回`); }, ms);
});
// ANSI colours, cursor moves, OSC titles/links, \r spinners
export const clean = (s) => String(s || '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '').replace(/\x1b[@-Z\\-_]/g, '').split(/\r?\n/).map((l) => l.split('\r').pop()).join('\n');
const short = (s) => { const ls = clean(s).split('\n').map((l) => l.trim()).filter(Boolean); return (ls.find((l) => /error|not found|unknown|unrecognized|denied|failed|cannot|无法|错误/i.test(l)) || ls[0] || '').slice(0, 140); };
export function parseCodex(raw) {
  const t = clean(raw); const i = t.indexOf('{'); if (i < 0) return [];
  try { const j = JSON.parse(t.slice(i, t.lastIndexOf('}') + 1)); return (j.models || j.data || []).filter((x) => x && x.visibility !== 'hide' && x.visibility !== 'hidden').map((x) => x.slug || x.id).filter(Boolean); } catch (_) { return []; }
}
export function parseCursor(raw) {
  const out = [];
  for (const line of clean(raw).split('\n')) {
    const l = line.trim(); if (!l || /^(available|loading|tip|no models|error)/i.test(l)) continue;
    // "auto - Auto", "gpt-5.5-high - GPT-5.5 High (current)", "- sonnet-4.5 - Claude 4.5 Sonnet", "* composer-2.5"
    const m = l.match(/^(?:[-*•]\s+)?([a-z0-9][\w.:\/-]*[\w](?:\[[\w=,.-]*\])?)(?:\s+[-–—:]\s+.*|\s+\((?:current|default)\).*|\s*)$/i);
    if (m && (/[\d.-]/.test(m[1]) || /^(auto|default)$/i.test(m[1]) || /\s[-–—]\s/.test(l))) out.push(m[1]);
  }
  return out;
}
export function parsePi(raw) {
  return clean(raw).split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 2 && c[0] !== 'provider' && /^[\w.-]+$/.test(c[0]) && /^[\w.:\/@-]+$/.test(c[1])).map((c) => c[0] + '/' + c[1]);
}
const modelCache = {};
// codex keeps a models cache and its chosen model on disk: used when `codex debug models` can't be run
const codexFiles = () => {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'); const out = [];
  try { const j = JSON.parse(fs.readFileSync(path.join(home, 'models_cache.json'), 'utf8')); const arr = Array.isArray(j) ? j : (j.models || j.data || []);
    for (const x of arr) { const s = typeof x === 'string' ? x : (x.slug || x.id || x.name); if (s && (!x.visibility || (x.visibility !== 'hide' && x.visibility !== 'hidden'))) out.push(s); } } catch (_) {}
  try { const t = fs.readFileSync(path.join(home, 'config.toml'), 'utf8'); for (const mm of t.matchAll(/^\s*model\s*=\s*"([^"]+)"/gm)) out.push(mm[1]); } catch (_) {}
  return out;
};
const uniq = (a) => [...new Set(a.filter(Boolean))];
async function listModels(agent) {
  if (STATIC_MODELS[agent]) return { models: STATIC_MODELS[agent], source: 'static' };
  const builtin = BUILTIN_MODELS[agent] || [];
  const bin = binOf(agent);
  if (!bin) return { models: builtin, source: 'builtin', error: `${agent} 不在 PATH 里` };
  if (modelCache[agent] && Date.now() - modelCache[agent].t < 6e5) return { models: modelCache[agent].m, source: 'live' };
  let m = [], r = null;
  if (agent === 'codex') { r = await runOut(bin, ['debug', 'models']); m = parseCodex(r.out); }
  else if (agent === 'pi') { r = await runOut(bin, ['--list-models']); m = parsePi(r.out); }
  else if (agent === 'cursor') { r = await runOut(bin, ['models']); m = parseCursor(r.out); if (!m.length) { const r2 = await runOut(bin, ['--list-models']); const m2 = parseCursor(r2.out); if (m2.length) { m = m2; r = r2; } } }
  m = uniq(m);
  if (m.length) { modelCache[agent] = { t: Date.now(), m }; return { models: m, source: 'live' }; }
  const why = r ? (r.error ? `${bin}: ${r.error}` : r.code ? `${bin} 退出码 ${r.code}${short(r.err) ? '：' + short(r.err) : ''}` : `${bin} 没输出模型列表${short(r.err || r.out) ? '：' + short(r.err || r.out) : ''}`) : `${bin} 不支持列出模型`;
  if (r) console.log(`  [huh] ${agent} model list failed (${why}); using the built-in list`);
  const disk = agent === 'codex' ? uniq(codexFiles()) : [];
  if (disk.length) return { models: uniq([...disk, ...builtin]), source: 'cache', error: why };
  return { models: builtin, source: 'builtin', error: why };
}

function run(res, agent, mode, prompt, image, cwd, model) {
  if (!AGENTS.includes(agent)) return end(res, 400, `unknown agent ${agent}`);
  if (!has(agent)) return end(res, 404, `${agent} is not installed (or not on PATH)`);
  let img = null;
  if (image && /^data:image\/\w+;base64,/.test(image)) {
    img = path.join(os.tmpdir(), `huh-ping-${Date.now()}.jpg`);
    fs.writeFileSync(img, Buffer.from(image.split(',')[1], 'base64'));
  }
  const p = plan(agent, mode, prompt, img, model && /^[\w.:\/@\[\]=-]{1,80}$/.test(model) ? model : '');
  const dir = cwd && fs.existsSync(cwd) ? cwd : DEFAULT_CWD;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', ...cors() });
  const child = spawnCli(p.bin, p.args, { cwd: dir });
  child.on('error', (e) => { if (!res.writableEnded) res.end(`\n[bridge] couldn't start ${p.bin}: ${e.message}`); });
  console.log(`[huh] ${agent} ${mode} in ${dir}`);
  let buf = '', errTail = '', wrote = false;
  child.stdout.on('data', (d) => {
    if (p.out === 'text') { wrote = true; if (!res.writableEnded) res.write(d); return; }
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const j = JSON.parse(line);
        if (j.type === 'stream_event' && j.event && j.event.delta && j.event.delta.type === 'text_delta') { wrote = true; res.write(j.event.delta.text); }
        else if (j.type === 'result' && !wrote && j.result) { wrote = true; res.write(String(j.result)); }
      } catch (_) {}
    }
  });
  child.stderr.on('data', (d) => { errTail = (errTail + d).slice(-1500); });
  child.on('close', (code) => {
    if (img) fs.rm(img, () => {});
    if (code && !wrote && !res.writableEnded) res.write(`[${agent} exited ${code}] ${errTail.trim().split('\n').slice(-6).join('\n')}`);
    if (!res.writableEnded) res.end();
  });
  try { if (p.stdin != null) child.stdin.write(p.stdin); child.stdin.end(); } catch (_) {}
  child.stdin.on && child.stdin.on('error', () => {});
  res.on('close', () => { if (child.exitCode == null) child.kill('SIGINT'); });
}

// ---- http -----------------------------------------------------------------------------
const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Huh, X-Huh-Ext', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
const end = (res, code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...cors() }); res.end(msg); };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...cors() }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 15e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (_) { ok({}); } }); req.on('error', () => ok({})); });
const PAIRED_OTHER = 'PAIRED_OTHER: 小桥配对的是另一个 Huh? Ping（换过插件文件夹会这样）。从这个插件文件夹里双击「启动小桥」，或者在小桥窗口输入 y 回车。';

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return end(res, 204, '');
    const origin = req.headers.origin || '';
    const url = new URL(req.url, 'http://x');
    // Websites can't fake a chrome-extension:// origin. Accept this folder's own extension and the ones paired before;
    // refuse everything else. (Chrome sends no Origin on the extension's GET /health, so that one is open and harmless.)
    const ext = origin.startsWith('chrome-extension://') ? origin.slice(19) : '';
    if (origin && !ext) return end(res, 403, 'only the Huh? Ping extension may call this bridge');
    if (!ext && url.pathname !== '/health') return end(res, 403, 'only the Huh? Ping extension may call this bridge');
    if (ext && pairState(ext) !== 'ok') return json(res, 403, { error: PAIRED_OTHER, code: 'PAIRED_OTHER' });
    if (req.method === 'GET' && url.pathname === '/health') {
      // the extension says who it is (X-Huh-Ext) so the settings page can tell "paired with another copy" before it asks for anything
      const claimed = String(req.headers['x-huh-ext'] || '');
      const you = /^[a-p]{32}$/.test(claimed) ? (conf.exts.includes(claimed) || selfIds.has(claimed) || !conf.exts.length ? 'ok' : 'other') : undefined;
      return json(res, 200, { ok: true, version: BRIDGE_VERSION, paired: conf.exts.length > 0, you, platform: process.platform, cwd: DEFAULT_CWD, agents: Object.fromEntries(AGENTS.map((a) => [a, has(a)])) });
    }
    if (req.method === 'POST' && url.pathname === '/models') { // POST so Chrome sends the extension's Origin
      const { agent } = await body(req);
      if (!AGENTS.includes(agent)) return json(res, 400, { models: [], source: 'none', error: `unknown agent ${agent}` });
      return json(res, 200, await listModels(agent));
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      const { agent, mode = 'ask', prompt = '', image, cwd, model } = await body(req);
      if (!['ask', 'go', 'ship'].includes(mode)) return end(res, 400, 'bad mode');
      return run(res, agent, mode, String(prompt), image, cwd, model);
    }
    end(res, 404, 'not found');
  } catch (e) {
    console.error('  [huh] request failed: ' + (e && e.stack || e));
    try { if (!res.headersSent) json(res, 500, { models: [], error: String(e && e.message || e) }); else if (!res.writableEnded) res.end(`\n[bridge error] ${e && e.message || e}`); } catch (_) {}
  }
});
// pids listening on a TCP port: netstat on Windows, lsof on macOS/Linux, /proc as a fallback on Linux without lsof
function listeners(port) {
  const mine = String(process.pid); let pids = [];
  if (WIN) {
    try { // netstat's state column is localized on some Windows languages, so "listening" is also recognised by the 0.0.0.0:0 / [::]:0 remote
      pids = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map((l) => l.trim().split(/\s+/))
        .filter((c) => c.length >= 5 && /^TCP/i.test(c[0]) && c[1].endsWith(':' + port) && (/LISTEN/i.test(c[3]) || /^(0\.0\.0\.0|\[::\]):0$/.test(c[2]))).map((c) => c[c.length - 1]);
    } catch (_) {}
  } else {
    try { pids = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\s+/); } catch (_) {}
    if (!pids.filter(Boolean).length && fs.existsSync('/proc/net/tcp')) try {
      const hex = port.toString(16).toUpperCase().padStart(4, '0'); const inodes = new Set();
      for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) { try { for (const l of fs.readFileSync(f, 'utf8').split('\n').slice(1)) { const c = l.trim().split(/\s+/); if (c[1] && c[1].endsWith(':' + hex) && c[3] === '0A') inodes.add(c[9]); } } catch (_) {} }
      for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) { try { for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) { const m = (fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/) || [])[1]; if (m && inodes.has(m)) { pids.push(pid); break; } } } catch (_) {} }
    } catch (_) {}
  }
  return [...new Set(pids.filter((p) => p && p !== mine && /^\d+$/.test(p)))];
}
// an older bridge still holding the port (the window you started before updating): stop it and take over
let tries = 0;
server.on('error', async (e) => {
  if (e.code !== 'EADDRINUSE' || tries >= 4) { console.error(`\n  [huh] ${e.message}` + (e.code === 'EADDRINUSE' ? `\n  The old bridge is still on port ${PORT}. Close its window (or end node.exe in Task Manager), then start this one again.\n  旧的小桥还占着端口 ${PORT}：关掉它的窗口（或在任务管理器里结束 node.exe），再双击「启动小桥」。` : '')); process.exit(1); }
  tries++;
  if (tries === 1) {
    let old = null; try { old = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json(); } catch (_) {}
    if (old && old.version >= BRIDGE_VERSION) { console.log(`\n  Huh? Bridge v${old.version} is already running on ${PORT}. Nothing to do; you can close this window.\n  新版小桥已经在运行了，这个窗口可以关掉。`); process.exit(0); }
    console.log(`  An older bridge${old && old.version ? ' (v' + old.version + ')' : ''} is using port ${PORT}; stopping it… / 旧版小桥占着端口，正在关掉它…`);
  }
  for (const pid of listeners(PORT)) { try { if (WIN) execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore', windowsHide: true }); else process.kill(+pid); } catch (_) {} }
  setTimeout(() => server.listen(PORT, '127.0.0.1'), 800);
});
if (MAIN) server.listen(PORT, '127.0.0.1', () => {
  const found = AGENTS.filter(has);
  console.log(`\n  Huh? Bridge v${BRIDGE_VERSION} on http://127.0.0.1:${PORT}`);
  console.log(conf.exts.length ? `  Paired with extension ${conf.exts.join(', ')}` : '  Open the Huh? Ping settings page; it pairs by itself.');
  console.log(`  This folder's extension ID: ${[...selfIds].join(' / ')} (always accepted)`);
  console.log('  Keep this window open while you use Huh? Ping.');
  console.log(`  Agents found: ${found.length ? found.join(', ') : 'none — install/sign in to codex, claude, gemini, pi, cursor-agent or codebuddy'}`);
  console.log(`  Default project folder: ${DEFAULT_CWD}\n`);
});
