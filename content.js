// Huh? Ping — content script. Alt/G + click = "?" ping on that exact spot; Alt/G + hold or drag = 5-slice ping wheel.
(() => {
  const alive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } }; // false once the extension is reloaded
  if (window.__huhPing && window.__huhPing()) return; window.__huhPing = alive;
  const URL_ = (p) => chrome.runtime.getURL(p);
  const IS_SUB = window.top !== window; // inside an iframe: ping here, answer in the top page's sidebar
  let frameOff = null; // set while a subframe takes a screenshot: where this frame sits in the tab
  const A = {
    q: URL_('assets/missing_art.webp'), x: URL_('assets/danger_art.webp'), go: URL_('assets/go_art.webp'), ship: URL_('assets/ship_art.webp'),
  };
  const SND = {
    q: URL_('assets/missing_sound.mp3'), x: URL_('assets/danger_sound.mp3'), tick: URL_('assets/tick_sound.mp3'),
    ok: URL_('assets/got_sound.mp3'), go: URL_('assets/go_sound.mp3'), ship: URL_('assets/ship_sound.mp3'), eli5: URL_('assets/eli5_sound.mp3'),
  };
  let cfg = { choices: [], pick: '', termAgent: 'none', termFirst: false, sound: true, lang: '中文', continueText: '继续', shipText: '好，commit、push 并合并到 main。', alwaysShot: false, bubbleFirst: true };
  let pdfChecked = false;
  const loadCfg = () => chrome.runtime.sendMessage({ type: 'cfg' }, (c) => { if (c) cfg = c; if (!pdfChecked) { pdfChecked = true; pdfTakeover(); } });
  // Chrome's own PDF viewer is closed to extensions, so PDFs open in our pdf.js reader (pdf.html), where pings work
  const pdfTakeover = () => {
    if (IS_SUB || document.contentType !== 'application/pdf' || /huh-raw/.test(location.hash) || cfg.pdfReader === false) return;
    location.replace(URL_('pdf.html') + '?file=' + encodeURIComponent(location.href));
  };
  loadCfg(); chrome.storage.onChanged.addListener((ch) => { const k = Object.keys(ch); if (k.includes('conns')) menuCache = null; if (k.some((x) => !['hist', 'availCache', 'sidePos', 'hintShown'].includes(x))) loadCfg(); });
  const play = (k) => { if (!cfg.sound || !SND[k]) return; const a = new Audio(SND[k]); a.volume = 0.8; a.play().catch(() => {}); };

  // ---------- overlay (shadow DOM, scrolls with the page) ----------
  const host = document.createElement('huh-ping-root');
  host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = URL_('content.css'); root.appendChild(css);
  const layer = document.createElement('div'); layer.className = 'layer'; root.appendChild(layer);
  const mount = () => { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const toast = (text) => {
    mount(); const t = el('div', 'toast'); t.textContent = text;
    t.style.left = (scrollX + innerWidth / 2) + 'px'; t.style.top = (scrollY + 24) + 'px';
    layer.appendChild(t); setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
  };

  // ---------- marks: pinned to the element under them, so they follow scrolling boxes, reflow and video players ----------
  const marks = [];
  let lastMark = null;
  // look through our own UI at the page underneath. visibility (not display:none) so the shadow tree keeps its
  // boxes: display:none + the forced layout of elementFromPoint restarted every CSS animation in it on each ping.
  const under = (fn) => { const v = host.style.visibility; host.style.visibility = 'hidden'; try { return fn(); } finally { host.style.visibility = v; } };
  const anchorAt = (cx, cy) => {
    const t = under(() => document.elementFromPoint(cx, cy));
    if (!t || t === document.documentElement || t === document.body) return null;
    const r = t.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const clips = []; for (let n = t.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) { const st = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(st.overflowX + st.overflowY)) clips.push(n); }
    return { el: t, rx: (cx - r.left) / r.width, ry: (cy - r.top) / r.height, clips };
  };
  const placeMark = (m) => {
    const a = m._a; if (!a) return;
    if (!a.el.isConnected) { m.classList.add('gone'); return; }
    const r = a.el.getBoundingClientRect();
    if (!r.width && !r.height) { m.classList.add('gone'); return; }
    const x = r.left + a.rx * r.width, y = r.top + a.ry * r.height;
    const hidden = a.clips.some((c) => { const k = c.getBoundingClientRect(); return x < k.left - 1 || x > k.right + 1 || y < k.top - 1 || y > k.bottom + 1; }); // scrolled out of its box
    m.classList.toggle('gone', hidden); m.classList.toggle('flip', x > innerWidth - 320);
    m.style.left = (x + scrollX) + 'px'; m.style.top = (y + scrollY) + 'px';
  };
  let placeQ = false;
  const placeAll = () => { if (placeQ) return; placeQ = true; requestAnimationFrame(() => { placeQ = false; marks.forEach(placeMark); }); };
  addEventListener('scroll', placeAll, { capture: true, passive: true }); addEventListener('resize', placeAll, { passive: true });
  setInterval(() => { if (marks.length && !document.hidden) placeAll(); }, 500); // layout shifts, lazy images, players resizing
  const dropMark = (kind, cx, cy) => {
    mount();
    const m = el('div', `mark k-${kind}`, `<div class="ring"></div><div class="ring r2"></div><div class="ground"></div><img src="${A[kind] || A.q}" alt="" draggable="false"><button class="mx" title="移除">×</button>`);
    m._a = anchorAt(cx, cy);
    m.style.left = (cx + scrollX) + 'px'; m.style.top = (cy + scrollY) + 'px';
    m.style.setProperty('--tilt', `${Math.round((Math.random() * 2 - 1) * 8)}deg`);
    marks.forEach((x) => x.classList.add('old')); layer.appendChild(m); marks.push(m); lastMark = { m, t: Date.now() };
    if (marks.length > 14) dropOne(marks[0]);
    bindMark(m);
    return m;
  };
  function bindMark(m) {
    const img = m.querySelector('img');
    m.querySelector('.mx').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    m.querySelector('.mx').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (m._card) m._card.close(); else dropOne(m); });
    m.addEventListener('pointerenter', () => { if (m._card) m._card.el.classList.add('hl'); });
    m.addEventListener('pointerleave', () => { if (m._card) m._card.el.classList.remove('hl'); });
    img.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.altKey || gHeld) return;
      e.preventDefault(); e.stopPropagation(); img.setPointerCapture(e.pointerId);
      const x0 = e.clientX, y0 = e.clientY, l0 = parseFloat(m.style.left), t0 = parseFloat(m.style.top); let moved = false;
      const mv = (ev) => { const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!moved && Math.hypot(dx, dy) < 5) return; moved = true; m.classList.add('drag'); m.style.left = (l0 + dx) + 'px'; m.style.top = (t0 + dy) + 'px'; };
      const up = (ev) => {
        img.removeEventListener('pointermove', mv); img.removeEventListener('pointerup', up); m.classList.remove('drag');
        if (!moved) { if (m._card) m._card.reveal(); return; }
        const cx = parseFloat(m.style.left) - scrollX, cy = parseFloat(m.style.top) - scrollY;
        m._a = anchorAt(cx, cy); placeMark(m);
        if (m._card && m._card.repin) m._card.repin(cx, cy); // moved = ask about the new spot
      };
      img.addEventListener('pointermove', mv); img.addEventListener('pointerup', up);
    });
  }
  const dropOne = (m) => { const i = marks.indexOf(m); if (i < 0) return; marks.splice(i, 1); m.classList.add('leave'); setTimeout(() => m.remove(), 700); };
  const takeMark = () => { const l = lastMark; lastMark = null; return l && Date.now() - l.t < 8000 && marks.includes(l.m) ? l.m : null; };
  const clearAll = () => {
    marks.splice(0).forEach((m, i) => { m.style.animationDelay = `${i * 40}ms`; m.classList.add('leave'); setTimeout(() => m.remove(), 700 + i * 40); });
    cards.splice(0).forEach((c) => c.close());
  };

  // ---------- spam lock (6 pings in 5s → locked 6/12/16/20/24s) ----------
  const LOCKS = [6, 12, 16, 20, 24]; let pingTimes = [], lockUntil = 0, lockLvl = 0;
  const locked = () => { if (Date.now() < lockUntil) { toast(`Too many pings. Pinging locked for ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`); return true; } return false; };
  const countPing = () => {
    const now = Date.now(); pingTimes = pingTimes.filter((t) => now - t < 5000); pingTimes.push(now);
    if (pingTimes.length >= 6) { const s = LOCKS[Math.min(lockLvl++, LOCKS.length - 1)]; lockUntil = now + s * 1000; pingTimes = []; toast(`Too many pings. Pinging locked for ${s}s.`); }
  };

  // ---------- what did the user point at? ----------
  const isEditable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const caretAt = (x, y) => {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
    return null;
  };
  const BLOCK = 'p,li,td,th,pre,code,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,figcaption,article,section,div';
  // the heading the spot sits under: picks the right meaning of an ambiguous word ("token" in an ML post vs a crypto one)
  const sectionOf = (t) => {
    let best = ''; const hs = document.querySelectorAll('h1,h2,h3');
    for (let i = 0; i < hs.length && i < 600; i++) { const h = hs[i]; if (h.contains(t) || (h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) best = h.innerText; else break; }
    return best.replace(/\s+/g, ' ').trim().slice(0, 160);
  };
  const spotKind = (t, text) => {
    if (!t || !t.closest) return '';
    if (t.closest('.katex,.MathJax,mjx-container,math,.math,[class*=latex]')) return 'math';
    if (/(Error|Exception|Traceback|ERR_[A-Z_]+|errno|exit code \d|status code [45]\d\d|\b(404|403|500|502|503) (Not Found|Forbidden|Internal|Bad Gateway|Service)|报错|错误码|失败：)/.test(text) && text.length < 800) return 'error';
    if (t.closest('pre,code,.highlight,[class*=language-],.cm-content,.monaco-editor,.blob-code')) return 'code';
    if (t.closest('button,a[href],input,select,label,summary,[role=button],[role=menuitem],[role=tab],[role=switch],[role=checkbox]')) return 'ui';
    if (t.closest('table,[role=grid],[role=table]')) return 'table';
    return '';
  };
  const contextAt = (x, y) => {
    const [target, c] = under(() => [document.elementFromPoint(x, y), caretAt(x, y)]);
    const sel = String(getSelection() || '').trim();
    let word = '', sentence = '';
    if (c && c.node && c.node.nodeType === 3) {
      const s = c.node.textContent, o = c.off;
      const L = s.slice(0, o).search(/[\w\u4e00-\u9fff\-']+$/u), R = s.slice(o).match(/^[\w\u4e00-\u9fff\-']*/u);
      word = (L >= 0 ? s.slice(L, o) : '') + (R ? R[0] : '');
      const a = Math.max(s.lastIndexOf('. ', o - 1), s.lastIndexOf('。', o - 1), s.lastIndexOf('！', o - 1), s.lastIndexOf('？', o - 1), s.lastIndexOf('\n', o - 1));
      const ends = ['. ', '。', '！', '？', '\n'].map((d) => s.indexOf(d, o)).filter((i) => i >= 0);
      sentence = s.slice(a + 1, ends.length ? Math.min(...ends) + 1 : s.length).trim();
    }
    let block = target && target.closest ? target.closest(BLOCK) : null;
    while (block && block.innerText && block.innerText.trim().length < 40 && block.parentElement && block.parentElement !== document.body) block = block.parentElement.closest(BLOCK) || null;
    let para = block ? block.innerText.trim().replace(/\n{3,}/g, '\n\n').slice(0, 2500) : '';
    const tl = target && target.closest && target.closest('.textLayer');
    if (tl) { // a PDF page: every line is its own span, so take the lines around the cursor instead of the whole page
      const sp = [...tl.querySelectorAll('span:not(.markedContent)')]; const at = Math.max(0, sp.indexOf(target.closest('span') || target));
      para = sp.slice(Math.max(0, at - 18), at + 22).map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').replace(/- (?=[a-z])/g, '').trim().slice(0, 2500);
      if (!sentence || sentence.length < 25) { const i = para.indexOf((target.textContent || '').trim().slice(0, 30)); const a = Math.max(para.lastIndexOf('. ', i), para.lastIndexOf('。', i)); const e = para.slice(Math.max(0, i)).search(/[.。](\s|$)/); sentence = para.slice(a + 1, e >= 0 ? i + e + 1 : undefined).trim().slice(0, 600); }
    }
    const visual = target && target.closest && target.closest('img,canvas,svg,video,picture,figure');
    const vid = visual && visual.tagName === 'VIDEO' ? visual : (target && target.closest && target.closest('[class*=player],[id*=player]') || { querySelector: () => null }).querySelector('video');
    const fmt = (t) => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), ss = String(t % 60).padStart(2, '0'); return (h ? h + ':' + String(mm).padStart(2, '0') : mm) + ':' + ss; };
    const media = vid ? `Video under the cursor, paused at ${fmt(vid.currentTime)} of ${fmt(vid.duration)}${vid.paused ? '' : ' (playing)'}. The screenshot shows the current frame.`
      : visual && visual.tagName === 'IMG' ? `Image under the cursor: ${visual.alt ? `alt="${visual.alt.slice(0, 200)}", ` : ''}file ${(visual.currentSrc || visual.src || '').split(/[?#]/)[0].split('/').pop().slice(0, 80)}` : '';
    const mediaQuote = vid ? `🎬 视频 ${fmt(vid.currentTime)} 这一帧` : visual && visual.tagName === 'IMG' ? `🖼 ${visual.alt ? visual.alt.slice(0, 60) : '这张图片'}` : visual ? '🖼 画面里的这一处' : '';
    const text = sel || sentence || para;
    return {
      section: target ? sectionOf(target) : '', desc: ((document.querySelector('meta[name=description],meta[property="og:description"]') || {}).content || '').slice(0, 240),
      spot: visual || vid ? 'visual' : spotKind(target, text), isVideo: !!vid, isImage: !vid && !!visual,
      img: (() => { const im = !vid && visual && (visual.tagName === 'IMG' ? visual : visual.querySelector && visual.querySelector('img')); if (!im) return null; const r = im.getBoundingClientRect(); return { el: im, src: im.currentSrc || im.src, rx: Math.round((x - r.left) / r.width * 100), ry: Math.round((y - r.top) / r.height * 100) }; })(),
      foreign: /中文|chinese/i.test(cfg.lang || '') && text.length > 15 && (text.match(/[\u4e00-\u9fff]/g) || []).length / text.length < 0.05 && /[a-z]{3}/i.test(text),
      title: document.title, url: document.documentElement.dataset.huhSrc || location.href, selection: sel.slice(0, 2000), word, sentence: sentence.slice(0, 600), paragraph: para,
      element: target ? `<${target.tagName.toLowerCase()}${target.alt ? ` alt="${target.alt}"` : ''}>` : '',
      media, mediaQuote, needsShot: cfg.alwaysShot || !!visual || !!vid || (!para && !sel),
    };
  };
  const shotAround = (x, y) => new Promise((res) => {
    host.style.visibility = 'hidden';
    setTimeout(() => chrome.runtime.sendMessage({ type: 'shot' }, (r) => {
      host.style.visibility = '';
      if (!r || !r.url) return res(null);
      const img = new Image(); img.onload = () => {
        const o = frameOff || { x: 0, y: 0, vw: innerWidth }; x += o.x; y += o.y;
        const k = img.width / o.vw, W = 720, H = 480;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
        const sx = Math.max(0, Math.min(img.width - W * k, x * k - W * k / 2)), sy = Math.max(0, Math.min(img.height - H * k, y * k - H * k / 2));
        g.drawImage(img, sx, sy, W * k, H * k, 0, 0, W, H);
        const px = (x * k - sx) / k, py = (y * k - sy) / k;
        g.strokeStyle = '#ff2d55'; g.lineWidth = 4; g.beginPath(); g.arc(px, py, 22, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#ff2d55'; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
        res(cv.toDataURL('image/jpeg', 0.82));
      }; img.onerror = () => res(null); img.src = r.url;
    }), 30);
  });


  // ---------- sidebar: every answer lands here; drag the header to move it, it snaps to the nearer edge ----------
  let side = null;
  function ensureSide(quiet) {
    mount();
    if (side && side.isConnected) { if (!quiet) side.classList.remove('min'); return side.querySelector('.feed'); }
    side = el('div', 'side', `<div class="sh"><span class="grip" title="拖动"><i></i><i></i><i></i><i></i><i></i><i></i></span><img src="${A.q}" alt=""><b>Huh?</b><em class="n"></em><button class="sb hs" title="历史"><svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button><button class="sb mn" title="收起">–</button><button class="sb cx" title="全部关掉">×</button></div><div class="feed"></div><div class="hlist"></div><div class="rz" title="拖动调宽度"></div>`);
    root.appendChild(side); if (quiet) side.classList.add('min');
    if (!menuCache) chrome.runtime.sendMessage({ type: 'menu' }, (g) => { if (g && g.length) menuCache = g; }); // model menu opens instantly later
    const rz = side.querySelector('.rz');
    rz.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); rz.setPointerCapture(e.pointerId);
      const r = side.getBoundingClientRect(), x0 = e.clientX, left = side.classList.contains('dock-l');
      side.classList.add('drag');
      const mv = (ev) => { const w = Math.max(300, Math.min(Math.min(720, innerWidth - 24), r.width + (left ? ev.clientX - x0 : x0 - ev.clientX))); side.style.width = w + 'px'; };
      const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); side.classList.remove('drag');
        chrome.storage.local.get('sidePos', ({ sidePos }) => chrome.storage.local.set({ sidePos: { ...(sidePos || { edge: 'r', top: 16 }), w: Math.round(side.getBoundingClientRect().width) } })); };
      rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
    });
    chrome.storage.local.get('sidePos', ({ sidePos }) => place(sidePos || { edge: 'r', top: 16 }));
    const sh = side.querySelector('.sh');
    sh.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); sh.setPointerCapture(e.pointerId);
      const r = side.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      // pin the current left before dropping right, or the box jumps to its static position (the left edge) on a plain click
      side.classList.add('drag'); side.style.left = r.left + 'px'; side.style.right = 'auto';
      let moved = false;
      const mv = (ev) => { if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return; moved = true;
        side.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + 'px'; side.style.top = Math.max(0, Math.min(innerHeight - 48, ev.clientY - oy)) + 'px'; };
      const up = (ev) => {
        sh.removeEventListener('pointermove', mv); sh.removeEventListener('pointerup', up); side.classList.remove('drag');
        const rr = side.getBoundingClientRect(), mini = side.classList.contains('min');
        chrome.storage.local.get('sidePos', ({ sidePos }) => {
          const old = sidePos || { edge: 'r', top: 16 };
          if (!moved) return place(old); // a click (e.g. on the pill to open it), not a drag: stay where it was
          const pos = { edge: rr.left + rr.width / 2 < innerWidth / 2 ? 'l' : 'r', top: Math.round(rr.top) };
          const w = mini ? old.w : Math.round(rr.width); if (w) pos.w = w; // the pill's own width is not the sidebar's width
          place(pos); chrome.storage.local.set({ sidePos: pos });
        });
      };
      sh.addEventListener('pointermove', mv); sh.addEventListener('pointerup', up);
    });
    sh.addEventListener('click', (e) => { if (side.classList.contains('min') && !e.target.closest('.cx')) side.classList.remove('min'); });
    side.querySelector('.mn').onclick = (e) => { e.stopPropagation(); side.classList.toggle('min'); };
    side.querySelector('.hs').onclick = (e) => { e.stopPropagation(); side.classList.remove('min'); if (side.classList.toggle('hist')) drawHist(); else sideCount(); };
    side.querySelector('.cx').onclick = (e) => { e.stopPropagation(); clearAll(); };
    return side.querySelector('.feed');
  }
  // visible viewport height: innerHeight counts a horizontal page scrollbar, which would sit over the sidebar's bottom
  const viewH = () => { const d = document.documentElement; return document.compatMode === 'CSS1Compat' && d && d.clientHeight > 0 ? Math.min(innerHeight, d.clientHeight) : innerHeight; };
  function place(pos) {
    if (!side) return;
    side.classList.toggle('dock-l', pos.edge === 'l'); side.classList.toggle('dock-r', pos.edge !== 'l');
    side.style.left = pos.edge === 'l' ? '12px' : 'auto'; side.style.right = pos.edge === 'l' ? 'auto' : '12px';
    if (pos.w) side.style.width = pos.w + 'px';
    const vh = viewH(), t = Math.max(8, Math.min(vh - 120, pos.top || 16)); side.style.top = t + 'px'; side.style.maxHeight = (vh - t - 12) + 'px';
  }
  addEventListener('pointerdown', (e) => { const m = root.querySelector('.menu'); if (m && !e.composedPath().some((n) => n === m || (n.classList && n.classList.contains('mdl')))) m.remove(); }, true);
  addEventListener('resize', () => { if (side) chrome.storage.local.get('sidePos', ({ sidePos }) => place(sidePos || { edge: 'r', top: 16 })); }, { passive: true });
  const sideCount = () => { if (!side) return; const n = cards.length; side.querySelector('.n').textContent = n > 1 ? n : ''; if (!n && !side.classList.contains('hist') && !side.querySelector('.gate')) { side.classList.add('out'); const s0 = side; side = null; setTimeout(() => s0.remove(), 200); } };

  // ---------- AI answer cards ----------
  const cards = [];
  const HINT = {
    code: 'It is code. Say what this line or snippet does in plain words, what goes in and what comes out, and the one gotcha worth knowing.',
    math: 'It is a formula. Line 1 says what it computes. Then read it out in words, say what each symbol stands for here, and give the intuition.',
    error: 'It is an error message. Line 1 says what went wrong in plain words. Then the most likely cause and the first fix to try.',
    ui: 'It is a control on the page (a button, link or field). Line 1 says what using it will do. Then anything to watch out for before using it.',
    table: 'It is data in a table. Say what this cell or row means and what it tells the reader.',
    visual: 'Look at the screenshot: the red ring marks the exact spot. Name what is there, then explain it.',
  };
  const ASK = {
    q: (l, c = {}) => `The user pinged "?" (Huh?) at this spot: "what is this / what does it mean / I don't get it". ${HINT[c.spot] || 'Explain the pointed word, phrase or thing as it is used here.'}${c.foreign ? ` The text is not in ${l}: line 1 is a natural ${l} translation of it, then explain anything still unclear.` : ''} Answer in ${l}.`,
    eli5: (l) => `The user still doesn't get it. Explain it again like they're 5: line 1 is one very short sentence, then one everyday analogy. No jargon. Answer in ${l}.`,
    x: (l) => `The user pinged "!" (That's wrong) at this spot. Check the pointed claim or code. Line 1 is the verdict (wrong / risky / actually correct) and what is right, in one sentence. Then the reason, briefly. Answer in ${l}.`,
    go: (l) => `Continue from where you stopped. Answer in ${l}.`,
  };
  // "? 还是不懂" climbs a ladder: simpler, then another analogy, then a worked example
  const LADDER = [
    { label: '? 还是不懂', q: '还是不懂，说简单点', p: (l) => ASK.eli5(l) },
    { label: '? 换个比喻', q: '换个说法', p: (l) => `Still not clear. Try a completely different angle: line 1 is one vivid everyday analogy, then map each part of the analogy back to the real thing, one short line each. Answer in ${l}.` },
    { label: '? 一步步举例', q: '一步步举个例子', p: (l) => `Still not clear. Walk through it with a tiny concrete example (real numbers or a real scenario): line 1 sets up the example, then 3 to 5 short numbered steps. Answer in ${l}.` },
  ];
  const SYS = `You are Huh? Ping. The user points at ONE exact spot on a web page and wants to get it instantly.
Rules:
- Explain THAT spot as it is used on this page. Use the page title, section and surrounding text to pick the right meaning.
- Line 1 is the whole answer in one plain sentence (about 25 words or 40 汉字 at most). It must stand on its own. No preamble, no restating the question, no markdown on line 1.
- Then a blank line and at most 3 short lines or bullets: what it means here, why it matters, and one concrete example or everyday analogy. Stop there; the user can ask for more.
- Wrap 1 to 3 key terms the reader may not know either in [[double brackets]] the first time they appear after line 1, e.g. [[SSR]].
- No LaTeX. Write maths with plain characters (x², √, ≤, ×).
- If the spot is ambiguous, answer your best reading in line 1. Never ask the user a question back.
- If you are not sure, say so plainly in line 1 (e.g. 「不太确定，可能是……」). Never invent facts, numbers, quotes or sources.`;
  const ctxText = (c) => [
    `Page: ${c.title}\nURL: ${c.url}`,
    c.desc && `Page description: ${c.desc}`,
    c.section && `Section heading: ${c.section}`,
    c.selection && `Selected text: """${c.selection}"""`,
    c.word && `Word under the cursor: "${c.word}"`,
    c.sentence && `Sentence under the cursor: """${c.sentence}"""`,
    c.paragraph && `Surrounding block: """${c.paragraph}"""`,
    c.media,
    c.element && `Element under the cursor: ${c.element}`,
  ].filter(Boolean).join('\n\n');
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const inline = (s) => s.replace(/\[\[([^\[\]\n]{1,48})\]\]/g, '<button class="term" data-t="$1" title="这又是什么？">$1</button>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const md = (src) => {
    const out = []; const parts = String(src).split(/```/);
    parts.forEach((part, i) => {
      if (i % 2) { out.push(`<div class="cb"><button class="cbc">复制</button><pre>${esc(part.replace(/^[\w+-]*\n/, '').replace(/\n$/, ''))}</pre></div>`); return; }
      let list = null;
      const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
      for (const raw of esc(part).split('\n')) {
        const line = raw.trimEnd(); let m;
        if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
        if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
        close();
        if ((m = line.match(/^#{1,4}\s+(.*)/))) { out.push(`<h4>${inline(m[1])}</h4>`); continue; }
        if (!line.trim()) { out.push('<div class="gap"></div>'); continue; }
        out.push(`<div class="ln">${inline(line)}</div>`);
      }
      close();
    });
    return out.join('');
  };

  const plain = (s) => String(s).replace(/\[\[([^\]\n]+)\]\]/g, '$1');
  const gistOf = (a) => plain((String(a).split('\n').find((l) => l.trim()) || '')).replace(/^\s*(#+|[-*•]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').trim();
  const LABEL = { x: "THAT'S WRONG", eli5: 'SIMPLER', go: 'KEEP GOING', ship: 'PUSH & MERGE' };
  // scene packs: the chips under an answer change with what you pinged (a paper, English, an image, a video, code, an error, a button, data)
  const BUILTIN_PRESETS = "[通用]\n翻译 = 把我指的这段翻译成{lang}，术语保留原文\n举个例子 = 举一个具体的例子说明\n总结 = 用三句话总结\n展开讲讲 = 讲得更详细一些\n出处 = 这个说法可以去哪里核实？给出具体的网站、文档或文献名，没把握就直说\n[论文]\n讲人话 = 用外行也能听懂的话，重讲我指的这段在说什么\n翻译 = 把这段译成{lang}，学术术语保留原文并在括号里解释\n方法拆解 = 把这里的方法拆成 3 到 5 步，每步一句话\n新在哪 = 和以前的做法比，这里新在哪里，为什么重要\n局限 = 这个说法或方法有什么前提、局限或可疑的地方\n[英语]\n翻译 = 自然地翻译成{lang}，不要翻译腔\n生词语法 = 挑出难词和难点语法，每个一行：原文 - 意思 - 一个例句\n语气 = 这句话是什么语气，有没有潜台词（客气、催促、不满、讽刺……）\n怎么回 = 如果这是发给我的，给我一句得体的英文回复，并附上{lang}意思\n怎么读 = 给出难词的音标和重音，并标出整句在哪里停顿\n[图片]\n这是什么 = 详细说说图里我指的这一处是什么\n风格手法 = 这是什么风格，用了什么构图、光线、配色和手法\n反推提示词 = 根据原图反推 AI 生图提示词，分成这几段，每段的提示词各放进一个代码块：## Midjourney（英文，结尾带 --ar 画幅 --v 7 --style raw 等参数）；## Flux / SD（英文自然语言长描述：主体、动作、构图、镜头焦段、光线、配色、材质、风格、画质词）；## Nano Banana / GPT Image（英文，一段完整的指令式描述）；## 反向提示词（SD 用）；## 关键参数（画幅比例、景别、可能的风格或 LoRA）。最后一行用{lang}说你最拿不准的地方\n图中文字 = 把图里的文字原样抄出来，再翻译成{lang}\n[视频]\n这一帧 = 这一帧画面里正在发生什么\n怎么做的 = 这个镜头、转场或特效大概是怎么拍、怎么做的\n反推提示词 = 根据这一帧反推 AI 视频提示词，分段放进代码块：## Kling / Veo / Sora（英文：主体、动作、运镜、景别、光线、风格、时长）；## 首帧生图提示词（英文）；## 运镜和节奏（用{lang}说）\n[代码]\n逐行解释 = 逐行解释这段代码，每行一句\n有 bug 吗 = 这段代码有没有 bug、边界情况或安全问题\n怎么用 = 给一个最小的调用例子\n改简洁 = 改写得更简洁易读，并说明改了什么\n[报错]\n怎么修 = 按顺序给出要尝试的修复步骤，附上要运行的命令\n为什么 = 解释为什么会出现这个错误\n[按钮]\n安全吗 = 这个按钮、链接或弹窗安全吗？有没有诈骗、扣费或隐私风险\n点了会怎样 = 点了之后具体会发生什么，能不能撤销\n[数据]\n说明什么 = 这个数据说明了什么，结论靠不靠谱\n有误导吗 = 这个图表或数字有没有误导人的地方";
  const PACK_TAG = { 论文: '📄 论文', 英语: '🔤 英语', 图片: '🖼 图片', 视频: '🎬 视频', 代码: '⌨ 代码', 报错: '⚠ 报错', 按钮: '🛡 按钮', 数据: '📊 数据' };
  const parsePacks = (txt) => {
    const packs = {}; let cur = '通用';
    for (const raw of String(txt || '').split('\n')) {
      const l = raw.trim(); if (!l) continue;
      const h = l.match(/^[\[【]\s*(.+?)\s*[\]】]$/); if (h) { cur = h[1]; continue; }
      const i = l.indexOf('='); (packs[cur] = packs[cur] || []).push(i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, l]);
    }
    return packs;
  };
  const presets = (pack) => { const mine = parsePacks(cfg.presets), base = parsePacks(BUILTIN_PRESETS); return ((pack && (mine[pack] || base[pack])) || mine['通用'] || base['通用'] || []).slice(0, 6); };
  const PAPER_RE = /arxiv\.org|openreview\.net|semanticscholar\.org|scholar\.google|aclanthology|ieeexplore|dl\.acm\.org|springer|sciencedirect|nature\.com|science\.org|pubmed|ncbi\.nlm|researchgate|biorxiv|medrxiv|ssrn\.com|cnki|wanfangdata|paperswithcode|huggingface\.co\/papers|alphaxiv/i;
  const isPaper = () => document.documentElement.dataset.huhPaper === '1' || PAPER_RE.test(document.documentElement.dataset.huhSrc || location.href) || !!document.querySelector('meta[name=citation_title],meta[name=citation_doi],meta[name="dc.identifier"]');
  const packOf = (c) => c.isVideo ? '视频' : c.isImage ? '图片' : c.spot === 'error' ? '报错' : c.spot === 'code' ? '代码' : c.spot === 'ui' ? '按钮'
    : (c.spot === 'math' || isPaper()) ? '论文' : c.spot === 'table' ? '数据' : (c.foreign || /[a-z]{3,}(\s+[a-z']+){3,}/i.test(c.selection || c.sentence || '')) && /中文|chinese/i.test(cfg.lang || '中文') && !/[\u4e00-\u9fff]/.test(c.selection || c.sentence || '') ? '英语' : '';
  const ICON_SEND = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 16 16" width="12" height="12"><rect x="3" y="3" width="10" height="10" rx="2.2" fill="currentColor"/></svg>';

  const textOnly = (msgs) => (msgs || []).map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n') + '\n[the screenshot or image from the first ask is not kept in history]' }));
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
  function drawHist() {
    const box = side && side.querySelector('.hlist'); if (!box) return;
    chrome.storage.local.get({ hist: [] }, ({ hist }) => {
      const here = location.href.split('#')[0];
      box.innerHTML = `<div class="hh"><b>历史</b><span>${hist.length ? hist.length + ' 条，只存在这台电脑上' : ''}</span>${hist.length ? '<button class="hclr">清空</button>' : ''}</div>` + (hist.length ? hist.map((h, i) => `<button class="hi ${h.url === here ? 'here' : ''}" data-i="${i}"><b>${esc(gistOf((h.turns[0] || {}).a || '') || h.quote || '（空）')}</b><span>${esc(h.quote || '')}</span><em>${h.url === here ? '这个页面' : esc(h.title || h.url)} · ${ago(h.t)}</em></button>`).join('') : '<div class="hn">还没有记录。打过的问号和回答会存在这里。</div>');
      box.onclick = (e) => {
        if (e.target.closest('.hclr')) { chrome.storage.local.set({ hist: [] }, drawHist); return; }
        const b = e.target.closest('.hi'); if (!b) return; const h = hist[+b.dataset.i];
        if (h.url !== here) { window.open(h.url, '_blank', 'noopener'); return; }
        const open = cards.find((c) => c.id === h.id); side.classList.remove('hist');
        if (open) { open.reveal(); return; }
        openCard(h.kind || 'q', 0, 0, null, null, h.quote, h.pack, h);
      };
    });
  }
  function openCard(kind, cx, cy, messages, agentJob, quote, pack, restore) {
    const myMark = restore ? null : takeMark();
    const bubbleOn = !!(myMark && cfg.bubbleFirst !== false && !agentJob && kind !== 'go' && kind !== 'ship');
    const feed = ensureSide(bubbleOn);
    const card = el('div', `card k-${kind}`, `<div class="hd"><img src="${A[kind === 'eli5' ? 'q' : kind] || A.q}" alt=""><span>${LABEL[kind] || 'HUH?'}${agentJob ? ' · ' + esc(agentJob.agent.toUpperCase()) : ''}</span><button class="mdl" title="换个模型再问一次"></button><button class="cl" title="关掉（问号也会一起消失）">×</button></div><button class="qt" title="回到这里"></button><div class="bd"></div><div class="pre"></div><div class="ask"><textarea rows="1" placeholder="接着问…"></textarea><button class="send" title="发送（Enter）" disabled>${ICON_SEND}</button></div><div class="ft"><button class="simpler">? 还是不懂</button><button class="copy">复制</button><span class="meta"></span></div>`);
    feed.prepend(card); feed.scrollTo({ top: 0, behavior: 'smooth' });
    let px = cx + scrollX, py = cy + scrollY;
    const qb = card.querySelector('.qt'), bd = card.querySelector('.bd'), meta = card.querySelector('.meta'), preBox = card.querySelector('.pre');
    const setQuote = (q) => { qb.textContent = q || ''; qb.style.display = q ? '' : 'none'; };
    setQuote(quote);
    // the bubble: line 1 of the answer, right next to the ? on the page. Click it for the whole card.
    const bub = bubbleOn ? myMark.appendChild(el('button', 'bub', '<span class="g"></span><i>›</i>')) : null;
    const setBub = (html, cls) => { if (!bub) return; bub.className = 'bub ' + (cls || ''); bub.querySelector('.g').innerHTML = html; };
    if (bub) {
      bub.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
      bub.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); obj.reveal(); });
    }
    qb.onclick = () => { const m = myMark && marks.includes(myMark) ? myMark : null; if (m) { placeMark(m); px = parseFloat(m.style.left); py = parseFloat(m.style.top); }
      scrollTo({ left: Math.max(0, px - innerWidth / 2), top: Math.max(0, py - innerHeight / 3), behavior: 'smooth' }); if (m) { m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); } };
    card.addEventListener('pointerenter', () => myMark && myMark.classList.add('hl'));
    card.addEventListener('pointerleave', () => myMark && myMark.classList.remove('hl'));
    let turns = [], port = null, busy = false, t0 = 0, tick = null, raf = 0, curAn = null, userScrolled = false, lastErr = null;
    feed.addEventListener('wheel', () => { if (busy) userScrolled = true; }, { passive: true });
    const obj = {
      el: card, id: restore ? restore.id : Math.random().toString(36).slice(2), pack, messages, pick: cfg.pick, req: messages, kind, mark: myMark,
      get busy() { return busy; },
      close() { stopRun(true); card.classList.add('out'); setTimeout(() => card.remove(), 200); if (myMark) dropOne(myMark); const i = cards.indexOf(obj); if (i >= 0) cards.splice(i, 1); sideCount(); },
      reveal() { ensureSide(); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); },
      // mode: 'new' (first ask), 'follow' (a follow-up turn with question q), 'redo' (same question again, e.g. another model)
      run(msgs, mode = 'new', job, q) {
        stopRun(true);
        obj.req = msgs; obj.messages = msgs; lastErr = null;
        if (mode === 'new') { turns = []; bd.innerHTML = ''; }
        if (mode === 'redo' && turns.length) { const t = turns.pop(); t.el.remove(); q = t.q; }
        const t = { q, a: '', el: el('div', 'turn') };
        if (q) t.el.appendChild(el('div', 'uq')).textContent = q;
        curAn = t.el.appendChild(el('div', 'an think', '<span class="dots"><i></i><i></i><i></i></span><span class="tm"></span>'));
        bd.appendChild(t.el); turns.push(t);
        if (turns.length === 1) setBub('<span class="dots"><i></i><i></i><i></i></span>', 'think');
        if (q && !userScrolled) t.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        busy = true; userScrolled = false; sendBtn(); chipText(); drawPresets();
        t0 = performance.now(); meta.textContent = '';
        const tm = curAn.querySelector('.tm'); tick = setInterval(() => { const sec = (performance.now() - t0) / 1000; if (tm.isConnected && sec >= 1.5) tm.textContent = `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`; }, 100);
        port = chrome.runtime.connect({ name: 'huh-chat' });
        const myPort = port;
        myPort.onDisconnect.addListener(() => { if (port === myPort) finish(); });
        myPort.onMessage.addListener((m) => {
          if (port !== myPort) return;
          if (m.delta) { if (!t.a) curAn.classList.remove('think'); t.a += m.delta; paint(t, true); }
          if (m.done) { obj.messages = [...msgs, { role: 'assistant', content: t.a }]; finish(); }
          let err = '';
          if (m.error === 'NO_KEY') err = '还没接入任何模型。<button class="opt">打开设置</button>';
          else if (m.error === 'NO_BRIDGE') err = '还没配对本地小桥。<button class="opt">打开设置</button>';
          else if (m.error === 'NO_BRIDGE_RUNNING') err = '小桥没开。双击插件文件夹里的 bridge/启动小桥，开着窗口就行。<button class="opt">打开设置</button><button class="opt rt">重试</button>';
          else if (m.error) err = `<span class="err">出错了：${esc(String(m.error).slice(0, 300))}</span><button class="opt rt">重试</button>`;
          if (err) {
            lastErr = { msgs, q }; finish(); curAn.classList.remove('think'); curAn.innerHTML = err;
            if (turns[0] === t) setBub('没答上来，点开看看', 'bad');
            const o = curAn.querySelector('.opt:not(.rt)'); if (o) o.onclick = () => chrome.runtime.sendMessage({ type: 'options' });
            const r = curAn.querySelector('.rt'); if (r) r.onclick = () => obj.run(msgs, 'redo', job);
          }
        });
        myPort.postMessage(job ? { agent: job } : { messages: msgs, pick: obj.pick });
        function finish() {
          if (port !== myPort) return;
          port = null; busy = false; clearInterval(tick); cancelAnimationFrame(raf); raf = 0;
          try { myPort.disconnect(); } catch (_) {}
          if (t.a) { curAn.classList.remove('think'); paint(t, false); saveHist(); }
          else if (!lastErr && curAn.classList.contains('think')) { curAn.classList.remove('think'); curAn.innerHTML = '<span class="err">没有收到回答。</span><button class="opt rt">重试</button>'; curAn.querySelector('.rt').onclick = () => obj.run(msgs, 'redo', job); if (turns[0] === t) setBub('没答上来，点开看看', 'bad'); }
          const sec = (performance.now() - t0) / 1000; meta.textContent = `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
          sendBtn(); drawPresets();
        }
      },
      follow(q, prompt) { if (!q.trim() || busy) return; play('eli5'); obj.run([...obj.messages, { role: 'user', content: prompt || q }], 'follow', null, q); },
      repin(nx, ny) { // the ? was dragged somewhere else: ask about the new spot
        px = nx + scrollX; py = ny + scrollY;
        buildAsk(kind, nx, ny).then(({ msgs, quote, pack: pk }) => { setQuote(quote); obj.pack = pk; obj.run(msgs, 'new'); });
      },
    };
    if (myMark) myMark._card = obj;
    function saveHist() {
      if (agentJob) return;
      const entry = { id: obj.id, url: location.href.split('#')[0], title: document.title.slice(0, 140), quote: qb.textContent, kind, pack: obj.pack || '', t: Date.now(),
        turns: turns.filter((x) => x.a).map((x) => ({ q: x.q || '', a: x.a })), messages: textOnly(obj.messages) };
      chrome.storage.local.get({ hist: [] }, ({ hist }) => { hist = hist.filter((h) => h.id !== entry.id); hist.unshift(entry); chrome.storage.local.set({ hist: hist.slice(0, 100) }); });
    }
    function stopRun(silent) {
      if (!port) return;
      const p0 = port; port = null; try { p0.disconnect(); } catch (_) {}
      busy = false; clearInterval(tick); cancelAnimationFrame(raf); raf = 0;
      const t = turns[turns.length - 1];
      if (t && !silent) { curAn.classList.remove('think'); paint(t, false); curAn.insertAdjacentHTML('beforeend', '<span class="stopped">已停止</span>'); if (t.a) obj.messages = [...obj.req, { role: 'assistant', content: t.a }]; }
      sendBtn(); drawPresets();
    }
    // stream paint: at most once per frame, only the turn that is growing
    function paint(t, streaming) {
      const doit = () => {
        raf = 0;
        const near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        curAn.innerHTML = md(streaming ? t.a.replace(/\[\[(?=[^\]]*$)/, '') : t.a) + (streaming ? '<span class="caret"></span>' : '');
        if (bub && turns[0] === t) { const g = gistOf(t.a); const lineDone = !streaming || /\n\s*\S/.test(t.a.trim()) || t.a.includes('\n\n'); setBub(esc(g) + (lineDone ? '' : '<span class="caret"></span>'), lineDone ? 'ok' : 'live'); }
        if (streaming && turns.length > 1 && near && !userScrolled) feed.scrollTop = feed.scrollHeight;
      };
      if (!streaming) { cancelAnimationFrame(raf); doit(); return; }
      if (!raf) raf = requestAnimationFrame(doit);
    }
    function drawPresets() {
      const ps = agentJob ? [] : presets(obj.pack);
      const tag = obj.pack && PACK_TAG[obj.pack] ? `<span class="pk">${PACK_TAG[obj.pack]}</span>` : '';
      preBox.innerHTML = tag + ps.map(([n], i) => `<button data-i="${i}">${esc(n)}</button>`).join('');
      preBox.classList.toggle('on', !!(ps.length && !busy && turns.length && turns[turns.length - 1].a));
    }
    bd.addEventListener('click', (e) => { // a [[term]] in the answer: explain that too, in the same card
      const cc = e.target.closest('.cbc');
      if (cc) { navigator.clipboard.writeText(cc.parentElement.querySelector('pre').textContent).then(() => { cc.textContent = '已复制 ✓'; cc.classList.add('ok'); setTimeout(() => { cc.textContent = '复制'; cc.classList.remove('ok'); }, 1300); }); return; }
      const b = e.target.closest('.term'); if (!b || busy) return; const w = b.dataset.t;
      obj.follow(`「${w}」是什么？`, `What is "${w}", as used in your answer? Same format: line 1 is one plain sentence, then at most 3 short lines with an example. Answer in ${cfg.lang}.`);
    });
    preBox.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const [n, pr] = presets(obj.pack)[+b.dataset.i]; obj.follow(n, pr.replace(/\{lang\}/g, cfg.lang || '中文') + `\n\n(This is a follow-up task about the same spot: do it fully. The 3-line limit does not apply here, but keep line 1 as the gist. Answer in ${cfg.lang || '中文'}.)`); };
    const ta = card.querySelector('.ask textarea'), sb = card.querySelector('.ask .send');
    function sendBtn() {
      card.classList.toggle('busy', busy);
      sb.innerHTML = busy ? ICON_STOP : ICON_SEND; sb.title = busy ? '停止（Esc）' : '发送（Enter）';
      sb.disabled = !busy && !ta.value.trim();
    }
    const grow = () => { ta.style.height = '0px'; ta.style.height = Math.min(Math.max(ta.scrollHeight, 20), 120) + 'px'; };
    ta.oninput = () => { grow(); sendBtn(); };
    const submit = () => { const v = ta.value.trim(); if (!v || busy) return; ta.value = ''; grow(); obj.follow(v); };
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); if (busy) stopRun(); else ta.blur(); }
    });
    ['keyup', 'keypress'].forEach((ev) => ta.addEventListener(ev, (e) => e.stopPropagation()));
    sb.onclick = () => (busy ? stopRun() : submit());
    requestAnimationFrame(grow);
    card.querySelector('.cl').onclick = () => obj.close();
    // model chip: every connected account's models, side by side; picking one re-asks the same question with it
    const chip = card.querySelector('.mdl');
    function chipText() {
      const all = cfg.choices || []; const c = all.find((x) => x.value === obj.pick) || all[0];
      if (agentJob || !c) { chip.style.display = 'none'; return; }
      chip.textContent = obj.pickLabel || `${c.conn} · ${c.model}`;
    }
    chip.onclick = (e) => {
      e.stopPropagation(); const old = root.querySelector('.menu'); if (old) { old.remove(); if (old.dataset.for === obj.id) return; }
      const menu = el('div', 'menu'); menu.dataset.for = obj.id; const cr = chip.getBoundingClientRect();
      menu.style.top = Math.min(cr.bottom + 6, innerHeight - 320) + 'px'; menu.style.left = Math.max(8, Math.min(cr.right - 250, innerWidth - 258)) + 'px'; root.appendChild(menu);
      menu.onclick = (ev) => ev.stopPropagation();
      menu.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') menu.remove(); if (ev.key === 'Enter') { const f = menu.querySelector('.ls button'); if (f) f.click(); } });
      const cur = obj.pick || ((cfg.choices || [])[0] || {}).value;
      const render = (groups, loading) => {
        if (!menu.isConnected) return;
        if (!groups || !groups.length) { menu.innerHTML = loading ? '<i>正在拉取模型…</i>' : '<i>设置里还没接任何账号</i>'; return; }
        const total = groups.reduce((n, g) => n + g.models.length, 0);
        const oldQ = menu.querySelector('input'); const qv = oldQ ? oldQ.value : '';
        menu.innerHTML = '<input placeholder="搜索，或直接输入模型名…" spellcheck="false"><div class="ls"></div>';
        const ls = menu.querySelector('.ls'), q = menu.querySelector('input');
        const draw = (f = '') => {
          f = f.toLowerCase();
          ls.innerHTML = groups.map((g) => {
            const ms = g.models.filter((m) => !f || m.toLowerCase().includes(f) || g.conn.toLowerCase().includes(f));
            if (!ms.length && !(g.note && !f)) return '';
            return `<h6>${esc(g.conn)}</h6>` + (g.note && !f ? `<p class="nt">${esc(g.note)}</p>` : '') + ms.slice(0, 80).map((m) => { const v = g.id + '::' + m; return `<button data-v="${esc(v)}" data-l="${esc(g.conn + ' · ' + (m || '默认'))}" class="${v === cur ? 'on' : ''} ${m ? '' : 'def'}">${m ? esc(m) : '默认模型'}</button>`; }).join('');
          }).join('');
          // typed a name that isn't listed: offer it on the current account (it's remembered for next time)
          const typed = f && /^[\w.:\/@-]{1,80}$/.test(q.value.trim()) && !groups.some((g) => g.models.some((m) => m.toLowerCase() === f));
          if (typed) { const g = groups.find((x) => cur.startsWith(x.id + '::')) || groups[0]; const m = q.value.trim(); ls.innerHTML += `<h6>手动输入</h6><button data-v="${esc(g.id + '::' + m)}" data-l="${esc(g.conn + ' · ' + m)}" data-add="${esc(g.id)}">用 ${esc(m)}（${esc(g.conn)}）</button>`; }
          if (!ls.innerHTML) ls.innerHTML = '<i>没有匹配的模型</i>';
        };
        draw(qv); if (q) { q.value = qv; q.oninput = () => draw(q.value); q.focus(); }
        ls.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; if (b.dataset.add) { chrome.runtime.sendMessage({ type: 'addModel', id: b.dataset.add, model: b.dataset.v.split('::').slice(1).join('::') }); menuCache = null; } obj.pick = b.dataset.v; obj.pickLabel = b.dataset.l; chipText(); menu.remove(); obj.run(obj.req, 'redo'); };
      };
      render(menuCache, true); // instant from cache, then refresh
      chrome.runtime.sendMessage({ type: 'menu' }, (groups) => { if (groups && groups.length) { menuCache = groups; render(groups); } else if (!menuCache) render(null); });
    };
    const copyBtn = card.querySelector('.copy');
    copyBtn.onclick = () => navigator.clipboard.writeText(plain((turns[turns.length - 1] || {}).a || '')).then(() => { copyBtn.textContent = '已复制 ✓'; copyBtn.classList.add('ok'); setTimeout(() => { copyBtn.textContent = '复制'; copyBtn.classList.remove('ok'); }, 1300); });
    let rung = 0; const simplerBtn = card.querySelector('.simpler');
    simplerBtn.onclick = () => { if (busy) return; const r = LADDER[Math.min(rung, LADDER.length - 1)]; rung++; simplerBtn.textContent = LADDER[Math.min(rung, LADDER.length - 1)].label; obj.follow(r.q, r.p(cfg.lang)); };
    cards.push(obj); if (cards.length > 12) cards[0].close(); sideCount();
    if (agentJob) { card.querySelector('.simpler').remove(); card.querySelector('.ask').remove(); }
    if (restore) { // a card from history: show its turns, follow-ups keep working (text only)
      for (const r of restore.turns) { const t = { q: r.q, a: r.a, el: el('div', 'turn') }; if (r.q) t.el.appendChild(el('div', 'uq')).textContent = r.q; curAn = t.el.appendChild(el('div', 'an', md(r.a))); bd.appendChild(t.el); turns.push(t); }
      obj.messages = restore.messages; obj.req = restore.messages.slice(0, -1); meta.textContent = '历史 · ' + ago(restore.t); qb.onclick = null; qb.style.cursor = 'default'; sendBtn(); chipText(); drawPresets();
    } else obj.run(messages, 'new', agentJob);
    return obj;
  }
  let menuCache = null;

  // the real image file, not a crop of the screen: the background fetches it (no CORS), shrunk to 1280px
  const origImage = (im) => new Promise((res) => {
    const done = (v) => { clearTimeout(to); res(v); }; const to = setTimeout(() => res(null), 7000);
    const local = () => { try { const n = im.el, k = Math.min(1, 1280 / Math.max(n.naturalWidth, n.naturalHeight)); if (!n.naturalWidth) return done(null); const cv = document.createElement('canvas'); cv.width = Math.round(n.naturalWidth * k); cv.height = Math.round(n.naturalHeight * k); cv.getContext('2d').drawImage(n, 0, 0, cv.width, cv.height); done({ url: cv.toDataURL('image/jpeg', 0.86), w: n.naturalWidth, h: n.naturalHeight }); } catch (_) { done(null); } };
    if (/^blob:/.test(im.src)) return local();
    chrome.runtime.sendMessage({ type: 'img', url: im.src }, (r) => (r && r.url ? done(r) : local()));
  });
  async function buildAsk(kind, cx, cy) {
    const c = contextAt(cx, cy);
    const sys = { role: 'system', content: SYS };
    const parts = [{ type: 'text', text: ASK[kind](cfg.lang, c) + '\n\n' + ctxText(c) }];
    let big = c.img && c.img.src ? await origImage(c.img) : null;
    if (big) parts.push({ type: 'text', text: `The original image file (full frame, ${big.w}×${big.h}). The user pointed at ${c.img.rx}% from the left and ${c.img.ry}% from the top of it.` }, { type: 'image_url', image_url: { url: big.url } });
    else if (c.needsShot) { const shot = await shotAround(cx, cy); if (shot) parts.push({ type: 'text', text: 'Screenshot around the spot; the red ring marks exactly where the user pinged.' }, { type: 'image_url', image_url: { url: shot } }); }
    const quote = (c.selection || c.mediaQuote || c.sentence || c.word || (c.needsShot ? '🖼 画面里的这一处' : '')).replace(/\s+/g, ' ').trim().slice(0, 90);
    return { msgs: [sys, { role: 'user', content: parts.length === 1 ? parts[0].text : parts }], quote, pack: packOf(c) };
  }

  // privacy: on listed sites nothing leaves the page until you say so (lines with ! allow a site)
  const globRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  const hostMatch = (p, h) => p.includes('*') ? globRe(p).test(h) : (h === p || h.endsWith('.' + p));
  const privateHere = (h = location.hostname) => {
    if (!h) return false; const lines = String(cfg.privateSites || '').split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean);
    if (lines.some((l) => l[0] === '!' && hostMatch(l.slice(1), h))) return false;
    return lines.some((l) => l[0] !== '!' && hostMatch(l, h));
  };
  function gate(kind, cx, cy, relay) {
    const m = lastMark && lastMark.m; const feed = ensureSide(); const gh = relay ? relay.host : location.hostname;
    const g = el('div', 'card gate', `<div class="gt"><b>🔒 这个网站在隐私名单里</b><span>页面内容和截图还没有发出去。</span></div><div class="gb"><button class="go1">这次发送</button><button class="goA">这个网站以后都发</button><button class="no">算了</button></div>`);
    feed.prepend(g);
    const fire = () => { g.remove(); let x = cx, y = cy; if (m && marks.includes(m)) { x = parseFloat(m.style.left) - scrollX; y = parseFloat(m.style.top) - scrollY; lastMark = { m, t: Date.now() }; }
      if (relay) chrome.runtime.sendMessage({ type: 'relayGo', frameId: relay.frameId, kind, x: relay.lx, y: relay.ly }); else askAt(kind, x, y, true); };
    g.querySelector('.go1').onclick = fire;
    g.querySelector('.goA').onclick = () => { const v = String(cfg.privateSites || '') + '\n!' + gh; cfg.privateSites = v; chrome.storage.local.set({ privateSites: v }); fire(); };
    g.querySelector('.no').onclick = () => { g.remove(); if (m) dropOne(m); sideCount(); };
  }
  // ---------- iframes: find where this frame sits in the tab (postMessage up the chain), then hand the ask to the top page ----------
  const offWait = {}, offFwd = {};
  const frameOffset = () => new Promise((res) => {
    const id = Math.random().toString(36).slice(2), to = setTimeout(() => { delete offWait[id]; res({ x: 0, y: 0, vw: innerWidth, none: true }); }, 600);
    offWait[id] = (v) => { clearTimeout(to); res(v); }; parent.postMessage({ __huh: 'off', id, x: 0, y: 0 }, '*');
  });
  addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object' || !d.__huh) return;
    if (d.__huh === 'off') {
      const f = [...document.querySelectorAll('iframe,frame')].find((x) => x.contentWindow === e.source); if (!f) return;
      const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
      const x = d.x + r.left + f.clientLeft + (parseFloat(cs.paddingLeft) || 0), y = d.y + r.top + f.clientTop + (parseFloat(cs.paddingTop) || 0);
      if (!IS_SUB) e.source.postMessage({ __huh: 'offR', id: d.id, x, y, vw: innerWidth }, '*');
      else { offFwd[d.id] = e.source; parent.postMessage({ __huh: 'off', id: d.id, x, y }, '*'); }
    } else if (d.__huh === 'offR') {
      if (offWait[d.id]) { offWait[d.id](d); delete offWait[d.id]; } else if (offFwd[d.id]) { offFwd[d.id].postMessage(d, '*'); delete offFwd[d.id]; }
    }
  });
  const topHost = () => { try { const a = location.ancestorOrigins; return a && a.length ? new URL(a[a.length - 1]).hostname : ''; } catch (_) { return ''; } };
  async function relayAsk(kind, cx, cy, force) {
    const off = await frameOffset(), base = { type: 'relay', kind, x: cx + off.x, y: cy + off.y, lx: cx, ly: cy, host: location.hostname };
    if (!force) chrome.runtime.sendMessage({ ...base, stage: 'mark' });
    if (!force && (privateHere() || privateHere(topHost()))) { chrome.runtime.sendMessage({ ...base, stage: 'gate' }); return; }
    frameOff = off; let r; try { r = await buildAsk(kind, cx, cy); } finally { frameOff = null; }
    chrome.runtime.sendMessage({ ...base, stage: 'ask', msgs: r.msgs, quote: r.quote, pack: r.pack });
  }
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (!m) return;
    if (m.type === 'hostVis' && !IS_SUB) { if (host) host.style.visibility = m.v ? '' : 'hidden'; reply(true); return; }
    if (m.type === 'relayGo' && IS_SUB) { relayAsk(m.kind, m.x, m.y, true); return; }
    if (m.type !== 'relay' || IS_SUB) return;
    if (m.stage === 'mark') { dropMark(m.kind, m.x, m.y); countPing(); return; }
    if (m.stage === 'gate') { gate(m.kind, m.x, m.y, m); return; }
    if (m.stage === 'ask') { if (lastMark) lastMark.t = Date.now(); openCard(m.kind, m.x, m.y, m.msgs, null, m.quote, m.pack); }
  });
  async function askAt(kind, cx, cy, force) {
    if (IS_SUB) return relayAsk(kind, cx, cy, force);
    if (!force && privateHere()) { gate(kind, cx, cy); return; }
    const hit = cards.find((c) => { const r = c.el.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
    if (hit && kind === 'q') { if (!hit.busy) hit.el.querySelector('.simpler').click(); return; } // ? on an answer = say it simpler
    const { msgs, quote, pack } = await buildAsk(kind, cx, cy);
    openCard(kind, cx, cy, msgs, null, quote, pack);
  }


  // ---------- chat sites: send "继续" / "commit push 合并" into the composer ----------
  const COMPOSERS = ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea#chat-input', 'textarea[placeholder]', '[contenteditable="true"][role="textbox"]', 'textarea'];
  const findComposer = () => {
    const a = document.activeElement; if (isEditable(a) && a.tagName !== 'SELECT' && a.type !== 'password') return a;
    for (const s of COMPOSERS) { const list = [...document.querySelectorAll(s)].filter((e) => e.offsetParent); if (list.length) return list[list.length - 1]; }
    return null;
  };
  const sendToChat = (text) => {
    const box = findComposer(); if (!box) return false;
    box.focus();
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value').set; set.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else { document.execCommand('selectAll', false); document.execCommand('insertText', false, text); }
    setTimeout(() => {
      const btn = document.querySelector('button[data-testid="send-button"],button[aria-label*="Send" i],button[aria-label*="发送"],button[type="submit"]:not([disabled])');
      if (btn && !btn.disabled) btn.click();
      else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }, 120);
    return true;
  };

  // ---------- actions ----------
  function act(k, cx, cy) {
    if (!k) return;
    if (k === 'ok') { play('ok'); clearAll(); return; }
    if (k === 'go' || k === 'ship') {
      play(k); dropMark(k, cx, cy);
      const onCard = cards.find((c) => { const r = c.el.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
      if (k === 'go' && onCard) { if (marks.length) dropOne(marks[marks.length - 1]); onCard.follow('继续', ASK.go(cfg.lang)); return; } // keep going on an answer card = continue that answer
      const text = k === 'go' ? cfg.continueText : cfg.shipText;
      if (cfg.termAgent && cfg.termAgent !== 'none' && (cfg.termFirst || !findComposer())) { openCard(k, cx, cy, [], { agent: cfg.termAgent, mode: k, prompt: text }); return; } // terminal agent via bridge
      if (!sendToChat(text)) toast(k === 'go' ? '这里没有能继续的对话框（可以在设置里接上终端 agent）' : '这里没有能发消息的对话框（可以在设置里接上终端 agent）');
      return;
    }
    if (locked()) return;
    play(k); if (!IS_SUB) { dropMark(k, cx, cy); countPing(); } // in an iframe the top page draws the mark
    askAt(k, cx, cy);
  }

  // ---------- first run: one hint, once ----------
  if (window.top === window) chrome.storage.local.get('hintShown', ({ hintShown }) => {
    if (hintShown) return; chrome.storage.local.set({ hintShown: true });
    const mac = /Mac/i.test(navigator.platform || navigator.userAgent);
    setTimeout(() => { mount(); const t = el('div', 'toast hint', `<img src="${A.q}" alt=""><span>按住 <kbd>${mac ? 'Option' : 'Alt'}</kbd> 点一下任何看不懂的地方<br><small>按住拖动会出现轮盘 · 也可以按住 G</small></span>`);
      t.style.left = (scrollX + innerWidth / 2) + 'px'; t.style.top = (scrollY + 24) + 'px'; layer.appendChild(t); setTimeout(() => t.classList.add('out'), 7000); setTimeout(() => t.remove(), 7600); }, 900);
  });

  // ---------- wheel ----------
  const SLOTS = [
    { k: 'x', a: -90, label: "THAT'S WRONG", c: '#ff5a46' },
    { k: 'go', a: -18, label: 'KEEP GOING', c: '#f2b320' },
    { k: 'ok', a: 54, label: 'GOT IT', c: '#7fd04b' },
    { k: 'ship', a: 126, label: 'PUSH & MERGE', c: '#56d43c' },
    { k: 'q', a: 198, label: 'HUH?', c: '#f2b320' },
  ];
  const C = 120, R0 = 36, R1 = 88, R2 = 112, RI = 62, HALF = 36;
  const pol = (r, a) => [C + r * Math.cos(a * Math.PI / 180), C + r * Math.sin(a * Math.PI / 180)];
  const sector = (r0, r1, a0, a1) => { const [x0, y0] = pol(r1, a0), [x1, y1] = pol(r1, a1), [x2, y2] = pol(r0, a1), [x3, y3] = pol(r0, a0); return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`; };
  const THUMB = '<svg x="-15" y="-15" width="30" height="30" viewBox="0 0 20 20"><path d="M6.5 9 L9.4 3.6 C10.6 3.2 11.6 4 11.4 5.4 L10.9 8 L15.4 8 C16.6 8 17.4 9.1 17 10.2 L15.3 15.4 C15 16.3 14.2 16.8 13.3 16.8 L6.5 16.8 Z" fill="#c9f29a" stroke="#244a12" stroke-width="1.3" stroke-linejoin="round"/><rect x="2.6" y="8.6" width="3.9" height="8.4" rx="1" fill="#9edb5f" stroke="#244a12" stroke-width="1.3"/></svg>';
  let wheel = null;
  const slotAt = (dx, dy) => {
    if (Math.hypot(dx, dy) < R0) return null; const a = Math.atan2(dy, dx) * 180 / Math.PI;
    return SLOTS.reduce((b, s) => { const d = Math.abs(((a - s.a + 540) % 360) - 180); return d < b.d ? { d, k: s.k } : b; }, { d: 999, k: null }).k;
  };
  const openWheel = (cx, cy) => {
    mount(); closeWheel();
    const w = el('div', 'wheel');
    const wedges = SLOTS.map((s) => `<g class="wedge" data-k="${s.k}" style="--c:${s.c}"><path class="ext" d="${sector(R1, R2, s.a - HALF / 2, s.a + HALF / 2)}" fill="url(#hp-ext)"/><path class="bg" d="${sector(R0 + 1, R1, s.a - HALF + .6, s.a + HALF - .6)}"/><path class="hi" d="${sector(R0 + 1, R1, s.a - HALF + .6, s.a + HALF - .6)}"/></g>`).join('');
    const icons = SLOTS.map((s) => { const [ix, iy] = pol(RI, s.a); return `<g class="ico" data-k="${s.k}" transform="translate(${ix} ${iy})">${s.k === 'ok' ? THUMB : `<image href="${A[s.k]}" x="-15" y="-15" width="30" height="30"/>`}</g>`; }).join('');
    const lines = SLOTS.map((s) => { const [x0, y0] = pol(R0 + 2, s.a + HALF), [x1, y1] = pol(R1, s.a + HALF); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#c8aa6e" stroke-opacity=".45"/>`; }).join('');
    w.innerHTML = `<svg viewBox="0 0 240 240"><defs><radialGradient id="hp-hub" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#1d5a63"/><stop offset=".7" stop-color="#0b2a30"/><stop offset="1" stop-color="#061418"/></radialGradient><radialGradient id="hp-ext" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${R2}"><stop offset="${R1 / R2}" stop-color="#0b1d22" stop-opacity=".7"/><stop offset="1" stop-color="#0b1d22" stop-opacity="0"/></radialGradient></defs>${wedges}${icons}${lines}<circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="#c8aa6e" stroke-opacity=".35"/><circle cx="${C}" cy="${C}" r="${R0}" fill="url(#hp-hub)" stroke="#c8aa6e" stroke-width="2.6"/><text class="lbl" x="${C}" y="${C + 2}" text-anchor="middle">PING</text></svg>`;
    w.style.left = (cx + scrollX) + 'px'; w.style.top = (cy + scrollY) + 'px';
    layer.appendChild(w); wheel = { el: w, cx, cy, hot: null };
  };
  const setHot = (k) => {
    if (!wheel || k === wheel.hot) return; wheel.hot = k; if (k) play('tick');
    wheel.el.querySelectorAll('[data-k]').forEach((g) => g.classList.toggle('hot', g.dataset.k === k));
    const s = SLOTS.find((x) => x.k === k), t = wheel.el.querySelector('.lbl'); t.textContent = s ? s.label : 'PING'; t.style.fill = s ? s.c : '#1fa9e0';
  };
  const closeWheel = () => { if (wheel) { wheel.el.remove(); wheel = null; } };

  // ---------- input: Alt or G held + mouse ----------
  let gHeld = false, gesture = null, eatClick = false, altUsed = false;
  addEventListener('keydown', (e) => {
    const tgt = e.composedPath()[0] || e.target;
    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !isEditable(tgt)) gHeld = true;
    if (e.key === 'Escape' && wheel) { closeWheel(); gesture = null; }
    else if (e.key === 'Escape' && (marks.length || cards.length) && !isEditable(tgt)) clearAll();
  }, true);
  addEventListener('keyup', (e) => { if (e.key === 'g' || e.key === 'G') gHeld = false; if (e.key === 'Alt' && (gesture || wheel || altUsed)) { e.preventDefault(); altUsed = false; } }, true); // Windows: stop Alt from focusing Chrome's menu after a ping
  addEventListener('blur', () => { gHeld = false; });
  addEventListener('pointerdown', (e) => {
    if (!alive() || e.button !== 0 || e.pointerType === 'touch' || !(e.altKey || gHeld)) return;
    if (e.altKey) altUsed = true;
    if (e.composedPath().includes(host) && !(e.altKey || gHeld)) return;
    e.preventDefault(); e.stopPropagation(); eatClick = true;
    const g = gesture = { x0: e.clientX, y0: e.clientY, open: false };
    g.t = setTimeout(() => { if (gesture === g && !g.open) { g.open = true; openWheel(g.x0, g.y0); } }, 200);
  }, true);
  addEventListener('pointermove', (e) => {
    const g = gesture; if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.open) { if (Math.hypot(dx, dy) > 10) { g.open = true; clearTimeout(g.t); openWheel(g.x0, g.y0); } return; }
    setHot(slotAt(dx, dy)); e.preventDefault();
  }, true);
  addEventListener('pointerup', (e) => {
    const g = gesture; gesture = null; if (!g) return; clearTimeout(g.t);
    setTimeout(() => { eatClick = false; }, 0); // only swallow the click this very gesture produces
    e.preventDefault(); e.stopPropagation();
    if (!g.open) { act('q', g.x0, g.y0); return; }
    const k = slotAt(e.clientX - g.x0, e.clientY - g.y0); closeWheel(); act(k, g.x0, g.y0);
  }, true);
  addEventListener('click', (e) => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } }, true); // also stops Chrome-on-Mac's Option+click download
  addEventListener('auxclick', (e) => { if (eatClick) { e.preventDefault(); e.stopPropagation(); } }, true);
  addEventListener('mousedown', (e) => { if (gesture) { e.preventDefault(); e.stopPropagation(); } }, true);
  addEventListener('selectstart', (e) => { if (gesture) e.preventDefault(); }, true);
})();
