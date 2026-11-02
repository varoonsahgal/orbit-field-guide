/* ORBIT Field Academy — interactions (vanilla JS, no dependencies) */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('orbit:' + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { v === null ? localStorage.removeItem('orbit:' + k) : localStorage.setItem('orbit:' + k, v); } catch {} },
  };
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Theme ───────────────────────────────────────────── */
  $('#theme')?.addEventListener('click', () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = t; store.set('theme', t);
    document.dispatchEvent(new CustomEvent('orbit:theme', { detail: t }));
  });

  /* ── Mobile menu ─────────────────────────────────────── */
  const menuBtn = $('.menu-btn'), navEl = $('.nav');
  menuBtn?.addEventListener('click', () => {
    const open = navEl.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  /* ── Mission ID personalizer ─────────────────────────── */
  const ID_RE = /^[a-z0-9]{3,10}$/, ACCT_RE = /^\d{12}$/;
  const TOKENS = [{ re: /MY_ID/g, cls: 'myid-slot', orig: 'MY_ID' }, { re: /111122223333/g, cls: 'acct-slot', orig: '111122223333' }];
  function wrapSlots(scope) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest('script,style,textarea,input,.mermaid,dialog,.myid-slot,.acct-slot')) return NodeFilter.FILTER_REJECT;
        return /MY_ID|111122223333/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      const text = node.nodeValue;
      const re = /MY_ID|111122223333/g; let last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.append(text.slice(last, m.index));
        const span = document.createElement('span');
        span.className = m[0] === 'MY_ID' ? 'myid-slot' : 'acct-slot';
        span.textContent = m[0];
        frag.append(span); last = m.index + m[0].length;
      }
      if (last < text.length) frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  }
  function applyId() {
    const id = store.get('myid'), acct = store.get('acct');
    $$('.myid-slot').forEach(s => { s.textContent = id || 'MY_ID'; s.classList.toggle('myid', !!id); });
    $$('.acct-slot').forEach(s => { s.textContent = acct || '111122223333'; s.classList.toggle('myid', !!acct); s.classList.toggle('acct', !!acct); });
    $$('[data-myid-label]').forEach(el => { el.textContent = id || (el.classList.contains('id-big') ? 'not set' : 'Set your ID'); });
    $$('.id-chip').forEach(c => c.classList.toggle('is-set', !!id));
    document.dispatchEvent(new CustomEvent('orbit:id', { detail: { id, acct } }));
  }
  ['#main', '.mast', '.side'].forEach(s => $$(s).forEach(wrapSlots));
  applyId();
  window.ORBIT_ID = () => ({ id: store.get('myid'), acct: store.get('acct') });

  const dlg = $('#id-dialog');
  if (dlg) {
    const f = $('form', dlg), err = $('.id-err', dlg);
    const open = () => { f.myid.value = store.get('myid') || ''; f.acct.value = store.get('acct') || ''; err.textContent = ''; dlg.showModal(); setTimeout(() => f.myid.focus(), 30); };
    $$('[data-open-id]').forEach(b => b.addEventListener('click', open));
    $('[data-id-cancel]', dlg).addEventListener('click', () => dlg.close());
    $('[data-id-clear]', dlg).addEventListener('click', () => { store.set('myid', null); store.set('acct', null); applyId(); dlg.close(); });
    f.addEventListener('submit', e => {
      const id = f.myid.value.trim().toLowerCase(), acct = f.acct.value.replace(/\s|-/g, '');
      if (!ID_RE.test(id)) { e.preventDefault(); err.textContent = 'MY_ID must be 3 to 10 lowercase letters or digits, for example p07x42.'; return; }
      if (id === 'my_id' || id === 'myid') { e.preventDefault(); err.textContent = 'Use your own ID, not the placeholder.'; return; }
      if (acct && !ACCT_RE.test(acct)) { e.preventDefault(); err.textContent = 'An AWS account ID is exactly 12 digits.'; return; }
      store.set('myid', id); store.set('acct', acct || null); applyId();
    });
  }

  /* ── Copy buttons ────────────────────────────────────── */
  $$('.code .copy').forEach(btn => btn.addEventListener('click', async () => {
    const text = btn.closest('.code').querySelector('pre').innerText.replace(/\n$/, '');
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    btn.textContent = 'Copied'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 1600);
  }));

  /* ── Lightbox ────────────────────────────────────────── */
  const lb = $('#lightbox');
  if (lb) {
    $$('figure.shot .zoom').forEach(b => b.addEventListener('click', () => {
      const img = $('img', b); $('img', lb).src = img.currentSrc || img.src; $('img', lb).alt = img.alt;
      $('.lb-cap', lb).textContent = img.alt; lb.showModal();
    }));
    lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-close') || e.target.tagName === 'IMG') lb.close(); });
  }

  /* ── Print ───────────────────────────────────────────── */
  $$('[data-print]').forEach(b => b.addEventListener('click', () => {
    $$('details.reveal').forEach(d => d.dataset.wasOpen = d.open ? '1' : '');
    $$('details.reveal').forEach(d => d.open = true);
    window.print();
  }));
  window.addEventListener('afterprint', () => $$('details.reveal').forEach(d => d.open = d.dataset.wasOpen === '1'));

  /* ── Checkboxes + progress ───────────────────────────── */
  const pages = window.ORBIT_PAGES || {};
  const pageDone = page => { let n = 0; for (let i = 0; i < (pages[page] || 0); i++) if (store.get('chk:' + page + ':' + i) === '1') n++; return n; };
  function refreshProgress() {
    // nav stars + station cards (any page)
    $$('[data-page]').forEach(el => {
      const p = el.dataset.page; if (!pages[p]) return;
      const done = pageDone(p) === pages[p];
      el.classList.toggle('done', done);
    });
    $$('[data-progress]').forEach(el => {
      const p = el.dataset.progress, total = pages[p]; if (!total) return;
      const pct = Math.round(pageDone(p) / total * 100);
      $('.mp-bar i', el).style.width = pct + '%';
      $('.mp-t', el).textContent = pct + '%';
    });
    // per-section rings in the TOC
    $$('section.sec').forEach(sec => {
      const boxes = $$('.chk', sec), a = $(`.toc a[data-toc="${sec.dataset.sec}"]`);
      if (!a || !boxes.length) return;
      const n = boxes.filter(b => b.checked).length;
      a.classList.add('has-p'); a.style.setProperty('--p', n / boxes.length);
      a.classList.toggle('complete', n === boxes.length);
    });
  }
  $$('.chk').forEach(cb => {
    cb.checked = store.get('chk:' + cb.dataset.k) === '1';
    cb.addEventListener('change', () => { store.set('chk:' + cb.dataset.k, cb.checked ? '1' : null); refreshProgress(); });
  });
  refreshProgress();

  /* ── Reading bar + scrollspy ─────────────────────────── */
  const bar = $('#readbar');
  const tocLinks = $$('.toc a[data-toc]');
  const targets = tocLinks.map(a => document.getElementById(a.dataset.toc)).filter(Boolean);
  let ticking = false;
  function onScroll() {
    ticking = false;
    const h = document.documentElement;
    if (bar) bar.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
    if (!targets.length) return;
    let cur = targets[0];
    for (const t of targets) { if (t.getBoundingClientRect().top < 140) cur = t; else break; }
    tocLinks.forEach(a => a.classList.toggle('active', a.dataset.toc === cur.id));
    const act = tocLinks.find(a => a.dataset.toc === cur.id);
    const side = $('.side-in');
    if (act && side) {
      const r = act.getBoundingClientRect(), sr = side.getBoundingClientRect();
      if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) side.scrollTop += r.top - sr.top - sr.height / 3;
    }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ── Field-notes filter ──────────────────────────────── */
  const qf = $('[data-q-filter]');
  qf?.addEventListener('input', () => {
    const q = qf.value.trim().toLowerCase();
    $$('section.sec').forEach(sec => {
      const hit = !q || sec.innerText.toLowerCase().includes(q);
      sec.hidden = !hit;
      const a = $(`.toc a[data-toc="${sec.dataset.sec}"]`); if (a) a.parentElement.hidden = !hit;
    });
  });

  /* ── Starfield + orbits ──────────────────────────────── */
  function sky(canvas, opts) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, stars = [], t0 = performance.now();
    const hue = getComputedStyle(canvas.closest('[style*="--mc"]') || root).getPropertyValue('--mc').trim() || '#38BDF8';
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(w * h / (opts.hero ? 2600 : 4200));
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + .2, p: Math.random() * 6.28, s: .4 + Math.random() * 1.6 }));
    }
    function draw(now) {
      const t = (now - t0) / 1000, light = root.dataset.theme === 'light';
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = (light ? .18 : .55) + Math.sin(t * s.s + s.p) * (light ? .1 : .35);
        ctx.fillStyle = light ? `rgba(30,41,80,${a})` : `rgba(226,232,255,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      if (opts.hero) {
        const narrow = w < 760, k = narrow ? .55 : 1, cx = narrow ? w * .86 : w * .78, cy = narrow ? h * .07 : h * .46, rings = [[.42, .16, -.32, '#38BDF8', 26], [.30, .11, -.32, '#A78BFA', 18], [.55, .21, -.32, '#F472B6', 40]];
        // planet
        const g = ctx.createRadialGradient(cx - 18, cy - 22, 4, cx, cy, Math.min(w, h) * .12);
        g.addColorStop(0, light ? '#FFFFFF' : '#E0F2FE'); g.addColorStop(.35, '#7DD3FC'); g.addColorStop(1, light ? 'rgba(56,189,248,.15)' : 'rgba(14,30,80,.2)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * .085 * k, 0, 6.283); ctx.fill();
        rings.forEach(([rx, ry, rot, col, per], i) => {
          const RX = w * rx * .55 * (narrow ? 1.4 : 1), RY = h * ry * 1.4 * k;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
          ctx.strokeStyle = col + (light ? '55' : '66'); ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
          ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
          const ang = (t / per) * 6.283 + i * 2.1, x = Math.cos(ang) * RX, y = Math.sin(ang) * RY;
          const gl = ctx.createRadialGradient(x, y, 0, x, y, 16); gl.addColorStop(0, col); gl.addColorStop(1, col + '00');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill();
          ctx.restore();
        });
      } else {
        ctx.save(); ctx.translate(w * .86, h * .3); ctx.rotate(-.3);
        ctx.strokeStyle = hue + (light ? '40' : '55'); ctx.setLineDash([2, 8]);
        ctx.beginPath(); ctx.ellipse(0, 0, w * .26, h * .42, 0, 0, 6.283); ctx.stroke();
        const ang = t / 30 * 6.283; ctx.setLineDash([]); ctx.fillStyle = hue;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * w * .26, Math.sin(ang) * h * .42, 3, 0, 6.283); ctx.fill();
        ctx.restore();
      }
      if (!reduceMotion && visible) raf = requestAnimationFrame(draw);
    }
    let raf, visible = true;
    size(); draw(performance.now());
    addEventListener('resize', () => { size(); draw(performance.now()); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduceMotion) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } }).observe(canvas);
    document.addEventListener('orbit:theme', () => draw(performance.now()));
  }
  $$('.hero-fx').forEach(c => sky(c, { hero: true }));
  $$('.mast-fx').forEach(c => sky(c, { hero: false }));
})();
