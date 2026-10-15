// Huh? Ping PDF reader: pdf.js pages with a real text layer, so Alt+click works on PDFs too.
import * as pdfjs from './lib/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';
const $ = (s) => document.querySelector(s), pages = $('#pages');
const src = new URLSearchParams(location.search).get('file') || '';
const root = document.documentElement;
if (/Mac/i.test(navigator.platform || navigator.userAgent)) $('.alt').textContent = 'Option';
let doc = null, scale = 1, fit = true, io = null;
const nameOf = (u) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop()) || u; } catch (_) { return u; } };
const msg = (title, body, btn) => { pages.innerHTML = `<div class="msg"><b>${title}</b>${body || ''}${btn ? `<br><button>${btn}</button>` : ''}</div>`; const b = pages.querySelector('button'); if (b) b.onclick = () => $('#file').click(); };

async function open(data, name) {
  try { doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise; }
  catch (e) { msg('这份 PDF 打不开', String(e && e.message || e)); return; }
  let title = name;
  try { const m = await doc.getMetadata(); if (m && m.info && m.info.Title && m.info.Title.trim().length > 3) title = m.info.Title.trim(); } catch (_) {}
  document.title = title; $('.nm').textContent = title;
  try { const p1 = await doc.getPage(1); const tc = await p1.getTextContent(); const t = tc.items.map((i) => i.str).join(' ');
    if (/\babstract\b|\breferences\b|et al\.|arxiv|\bdoi\b|摘要|参考文献|关键词/i.test(t)) root.dataset.huhPaper = '1'; } catch (_) {}
  await layout();
}
async function layout() {
  const keep = pages.querySelector('.page') ? currentPage() : 1;
  pages.innerHTML = ''; if (io) io.disconnect();
  const first = await doc.getPage(1), base = first.getViewport({ scale: 1 });
  if (fit) scale = Math.min(1.9, Math.max(.5, (Math.min(innerWidth - 48, 1080)) / base.width));
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) draw(e.target); }), { rootMargin: '900px 0px' });
  for (let n = 1; n <= doc.numPages; n++) {
    const d = document.createElement('div'); d.className = 'page'; d.dataset.n = n;
    const vp = base.clone({ scale });
    d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px'; d.style.setProperty('--scale-factor', scale);
    pages.appendChild(d); io.observe(d);
  }
  const k = pages.querySelector(`.page[data-n="${keep}"]`); if (k && keep > 1) k.scrollIntoView();
  pg();
}
async function draw(d) {
  if (d.dataset.done) return; d.dataset.done = '1';
  const page = await doc.getPage(+d.dataset.n), vp = page.getViewport({ scale });
  d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px';
  const dpr = Math.min(devicePixelRatio || 1, 2.5), cv = document.createElement('canvas');
  cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr); d.appendChild(cv);
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
  const tl = document.createElement('div'); tl.className = 'textLayer'; d.appendChild(tl);
  try { await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render(); } catch (_) {}
}
const currentPage = () => { const ps = [...pages.querySelectorAll('.page')]; const mid = innerHeight / 3; const p = ps.find((x) => x.getBoundingClientRect().bottom > mid); return p ? +p.dataset.n : 1; };
const pg = () => { if (doc) $('.pg').textContent = `${currentPage()} / ${doc.numPages}`; };
addEventListener('scroll', () => requestAnimationFrame(pg), { passive: true });
let rt = 0; addEventListener('resize', () => { if (!doc || !fit) return; clearTimeout(rt); rt = setTimeout(layout, 250); });
const zoom = (f) => { if (!doc) return; fit = false; scale = Math.min(4, Math.max(.4, scale * f)); layout(); };
$('#zi').onclick = () => zoom(1.15); $('#zo').onclick = () => zoom(1 / 1.15);
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1.15); } if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoom(1 / 1.15); } if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); fit = true; layout(); } });
$('#openf').onclick = () => $('#file').click();
const local = async (f) => { if (!f) return; root.dataset.huhSrc = 'file:' + f.name; history.replaceState(null, '', location.pathname); $('#raw').style.display = 'none'; open(new Uint8Array(await f.arrayBuffer()), f.name); };
$('#file').onchange = (e) => local(e.target.files[0]);
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag'); });
addEventListener('dragleave', () => document.body.classList.remove('drag'));
addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('drag'); local([...e.dataTransfer.files].find((f) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name))); });

if (!src) { $('#raw').style.display = 'none'; msg('把 PDF 拖进来', '或者点「打开…」选一个文件。', '打开 PDF'); }
else {
  root.dataset.huhSrc = src; $('#raw').href = src + (src.includes('#') ? '' : '#huh-raw'); $('.nm').textContent = nameOf(src); document.title = nameOf(src);
  msg('正在打开…');
  fetch(src, { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((b) => open(new Uint8Array(b), nameOf(src)))
    .catch((e) => msg('读不到这份 PDF', src.startsWith('file:') ? '本地文件需要先在 chrome://extensions 里给 Huh? Ping 打开「允许访问文件网址」，或者直接把文件拖进来。' : String(e && e.message || e), '打开本地 PDF'));
}
