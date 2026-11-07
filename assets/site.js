/* ORBIT Field Academy — interactions (vanilla JS, no dependencies) */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem('orbit:' + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { v === null ? localStorage.removeItem('orbit:' + k) : localStorage.setItem('orbit:' + k, v); } catch {} },
  };
  const root = document.documentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => mqReduce.matches;

  /* ── Theme ───────────────────────────────────────────── */
  $('#theme')?.addEventListener('click', () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = t; store.set('theme', t);
    document.dispatchEvent(new CustomEvent('orbit:theme', { detail: t }));
  });

  /* ── Mobile menu ─────────────────────────────────────── */
  const menuBtn = $('.menu-btn'), navEl = $('.nav');
  const setMenu = open => { navEl?.classList.toggle('open', open); menuBtn?.setAttribute('aria-expanded', String(open)); };
  menuBtn?.addEventListener('click', () => setMenu(!navEl.classList.contains('open')));
  addEventListener('keydown', e => { if (e.key === 'Escape' && navEl?.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });

  /* ── Mission ID personalizer ─────────────────────────── */
  // Every literal MY_ID / 111122223333 in page text becomes a slot. To print the placeholder itself,
  // the markdown puts a zero-width space inside it (MY​_ID), which this regex does not match.
  const ID_RE = /^[a-z0-9]{3,10}$/, ACCT_RE = /^\d{12}$/;
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
    $$('[data-myid-label]').forEach(el => { el.textContent = id || (el.closest('.id-chip') ? 'Set your ID' : 'not set'); });
    $$('.id-chip, .console-id').forEach(c => c.classList.toggle('is-set', !!id));
    document.dispatchEvent(new CustomEvent('orbit:id', { detail: { id, acct } }));
  }
  ['#main', '.mast', '.side', '.stepper'].forEach(s => $$(s).forEach(wrapSlots));
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
    const lbl = $('span', btn) || btn;
    lbl.textContent = 'Copied'; btn.classList.add('ok');
    setTimeout(() => { lbl.textContent = 'Copy'; btn.classList.remove('ok'); }, 1600);
  }));

  /* ── Lightbox gallery ────────────────────────────────── */
  const lb = $('#lightbox');
  const shots = $$('figure.shot');
  if (lb && shots.length) {
    const img = $('.lb-stage img', lb), cap = $('.lb-cap', lb), num = $('.lb-n', lb);
    let cur = 0;
    const show = i => {
      cur = (i + shots.length) % shots.length;
      const s = $('img', shots[cur]);
      img.src = s.currentSrc || s.src; img.alt = s.alt;
      lb.classList.remove('actual');
      cap.textContent = s.alt;
      num.textContent = `Fig ${shots[cur].dataset.fig || ''} · ${cur + 1} of ${shots.length}`;
      const pre = $('img', shots[(cur + 1) % shots.length]); if (pre) { const p = new Image(); p.src = pre.currentSrc || pre.src; }
    };
    shots.forEach((f, i) => $('.zoom', f)?.addEventListener('click', () => { show(i); lb.showModal(); }));
    $('.lb-prev', lb).addEventListener('click', () => show(cur - 1));
    $('.lb-next', lb).addEventListener('click', () => show(cur + 1));
    $('.lb-close', lb).addEventListener('click', () => lb.close());
    img.addEventListener('click', () => lb.classList.toggle('actual'));
    lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-stage')) lb.close(); });
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1); });
    let tx = null;
    lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); tx = null; });
  }

  /* ── Print ───────────────────────────────────────────── */
  $$('[data-print]').forEach(b => b.addEventListener('click', () => {
    $$('details.reveal').forEach(d => d.dataset.wasOpen = d.open ? '1' : '');
    $$('details.reveal').forEach(d => d.open = true);
    $$('img[loading="lazy"]').forEach(i => i.loading = 'eager');
    setTimeout(() => window.print(), 60);
  }));
  window.addEventListener('afterprint', () => $$('details.reveal').forEach(d => d.open = d.dataset.wasOpen === '1'));

  /* ── Checkboxes, progress, patches ───────────────────── */
  const pages = window.ORBIT_PAGES || {};
  const missions = window.ORBIT_MISSIONS || [];
  const pageDone = page => { let n = 0; for (let i = 0; i < (pages[page] || 0); i++) if (store.get('chk:' + page + ':' + i) === '1') n++; return n; };
  const pct = page => pages[page] ? pageDone(page) / pages[page] : 0;
  const isDone = page => pages[page] > 0 && pageDone(page) === pages[page];

  function refreshProgress() {
    $$('[data-page]').forEach(el => { const p = el.dataset.page; if (pages[p]) { el.classList.toggle('done', isDone(p)); el.classList.toggle('started', pageDone(p) > 0); } });
    $$('[data-ring]').forEach(el => {
      const p = el.dataset.ring, v = pct(p);
      el.style.setProperty('--p', v);
      el.classList.toggle('full', v >= 1);
      const t = $('.ring-t', el); if (t) t.textContent = v >= 1 ? '★' : Math.round(v * 100) + '%';
    });
    $$('[data-progress-t]').forEach(el => {
      const p = el.dataset.progressT, d = pageDone(p), t = pages[p] || 0;
      el.textContent = !d ? 'not started' : d === t ? 'complete' : `${d} of ${t} checks`;
    });
    // per-section rings in the TOC + phase stepper
    $$('section.sec').forEach(sec => {
      const boxes = $$('.chk', sec);
      const a = $(`.toc a[data-toc="${sec.dataset.sec}"]`), st = $(`.stepper a[data-step="${sec.dataset.sec}"]`);
      if (!boxes.length) return;
      const n = boxes.filter(b => b.checked).length;
      for (const el of [a, st]) { if (!el) continue; el.classList.add('has-p'); el.style.setProperty('--p', n / boxes.length); el.classList.toggle('complete', n === boxes.length); }
    });
    $$('.checkpoint').forEach(cp => {
      const boxes = $$('.chk', cp), n = boxes.filter(b => b.checked).length;
      const c = $('.checkpoint-n', cp); if (c && boxes.length) c.textContent = `${n}/${boxes.length}`;
      cp.classList.toggle('complete', boxes.length > 0 && n === boxes.length);
    });
    // skill constellation: stars light in step with progress
    let lit = 0;
    $$('[data-skills]').forEach(col => {
      const v = pct(col.dataset.skills);
      $$('li[data-k]', col).forEach(li => { const on = v > 0 && v >= (+li.dataset.k + 1) / +li.dataset.of - 1e-9; li.classList.toggle('lit', on); if (on) lit++; });
      col.classList.toggle('done', v >= 1);
    });
    const litEl = $('[data-skills-lit]'); if (litEl) litEl.textContent = lit;
    // patches + next mission
    const main = missions.filter(m => m.track === 'main');
    const earned = main.filter(m => isDone(m.slug)).length;
    const pn = $('[data-patches-n]'); if (pn) pn.textContent = earned;
    $$('[data-shelf]').forEach(s => s.classList.toggle('earned', isDone(s.dataset.shelf)));
    const nx = $('[data-next-mission]');
    if (nx) {
      const next = main.find(m => m.present && !isDone(m.slug));
      if (next) { nx.href = next.slug + '.html'; nx.style.setProperty('--mc', next.hue); $('b', nx).textContent = `${pageDone(next.slug) ? 'Resume' : 'Start'} ${next.n} · ${next.name}`; }
      else if (earned) { $('b', nx).textContent = 'Every live mission complete'; }
    }
    const db = $('[data-debrief]');
    if (db) {
      const p = db.dataset.debrief, left = (pages[p] || 0) - pageDone(p), m = missions.find(x => x.slug === p);
      db.classList.toggle('done', left === 0 && pages[p] > 0);
      $('[data-debrief-h]', db).textContent = left === 0 ? `${m?.name || 'Mission'} patch earned` : `${left} check${left === 1 ? '' : 's'} between you and the ${m?.name || ''} patch`;
      $('[data-debrief-p]', db).textContent = left === 0 ? 'Every checkpoint is ticked. Clean up the resources listed above, then head for the next mission.' : 'Tick every checkpoint above. Your progress is saved in this browser; finish them all to earn the patch.';
    }
    $$('.mast').forEach(ms => { const p = root.dataset.page; ms.classList.toggle('earned', isDone(p)); });
  }
  $$('.chk').forEach(cb => {
    cb.checked = store.get('chk:' + cb.dataset.k) === '1';
    cb.addEventListener('change', () => {
      const page = cb.dataset.k.split(':')[0], before = isDone(page);
      store.set('chk:' + cb.dataset.k, cb.checked ? '1' : null);
      refreshProgress();
      if (!before && isDone(page)) award(page);
    });
  });
  refreshProgress();
  addEventListener('storage', e => { if (e.key?.startsWith('orbit:chk:')) refreshProgress(); });

  /* ── Achievement: patch award + confetti ─────────────── */
  const aw = $('#award');
  function award(page) {
    const m = missions.find(x => x.slug === page);
    if (!aw || !m) return;
    store.set('award:' + page, new Date().toISOString().slice(0, 10));
    const src = $('.mast-patch svg.patch') || $(`svg.patch[data-patch="${m.n}"]`);
    const slot = $('.award-patch', aw); slot.innerHTML = '';
    if (src) slot.append(src.cloneNode(true));
    aw.style.setProperty('--mc', m.hue);
    const bf = m.track === 'breakfix';
    $('.award-sub', aw).textContent = `${m.label || 'Mission ' + m.n} · ${m.name}. Every check ticked. The patch now shows on ${bf ? 'the break-fix track' : 'your flight path'}.`;
    const same = missions.filter(x => x.present && (bf ? x.track === 'breakfix' : x.track !== 'breakfix'));
    const next = same[same.indexOf(m) + 1];
    const nl = $('[data-award-next]', aw);
    if (next) { nl.href = next.slug + '.html'; nl.textContent = `On to ${next.n} · ${next.name}`; } else { nl.href = bf ? 'break-fix.html' : 'index.html#flight-path'; nl.textContent = bf ? 'Back to the break-fix track' : 'Back to the flight path'; }
    aw.showModal();
    if (!reduceMotion()) confetti($('.award-fx', aw), m.hue);
  }
  aw?.querySelector('[data-award-close]')?.addEventListener('click', () => aw.close());
  aw?.addEventListener('click', e => { if (e.target === aw) aw.close(); });
  function confetti(canvas, hue) {
    const ctx = canvas.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = [hue, '#FDE68A', '#FFFFFF', '#38BDF8', '#F472B6', '#A78BFA'];
    const bits = Array.from({ length: 170 }, (_, i) => ({
      x: W / 2, y: H * .42, vx: (Math.random() - .5) * 15, vy: -Math.random() * 15 - 4,
      r: Math.random() * 6.28, vr: (Math.random() - .5) * .35, w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
      c: cols[i % cols.length], star: i % 7 === 0,
    }));
    const t0 = performance.now();
    (function frame(now) {
      const t = (now - t0) / 1000; ctx.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.vy += .32; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.globalAlpha = Math.max(0, 1 - t / 3.4); ctx.fillStyle = b.c;
        if (b.star) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2.6 : 6.5, a = k * Math.PI / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill(); }
        else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
        ctx.restore();
      }
      if (t < 3.6 && aw.open) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  /* ── Reading bar + scrollspy (TOC + phase stepper) ───── */
  const bar = $('#readbar');
  const tocLinks = $$('.toc a[data-toc]');
  const stepLinks = $$('.stepper a[data-step]');
  const stepNow = $('[data-step-now]'), stepTitle = $('[data-step-title]');
  const targets = tocLinks.map(a => document.getElementById(a.dataset.toc)).filter(Boolean);
  const stepTargets = stepLinks.map(a => document.getElementById(a.dataset.step)).filter(Boolean);
  const stepper = $('.stepper');
  let ticking = false, lastStep = null;
  function onScroll() {
    ticking = false;
    const h = document.documentElement;
    if (bar) bar.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
    if (stepper) stepper.classList.toggle('stuck', stepper.getBoundingClientRect().top <= 70);
    if (targets.length) {
      let cur = targets[0];
      for (const t of targets) { if (t.getBoundingClientRect().top < 170) cur = t; else break; }
      tocLinks.forEach(a => a.classList.toggle('active', a.dataset.toc === cur.id));
      const act = tocLinks.find(a => a.dataset.toc === cur.id);
      const side = $('.side-in');
      if (act && side && side.scrollHeight > side.clientHeight) {
        const r = act.getBoundingClientRect(), sr = side.getBoundingClientRect();
        if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) side.scrollTop += r.top - sr.top - sr.height / 3;
      }
    }
    if (stepTargets.length) {
      let ci = -1;
      stepTargets.forEach((t, i) => { if (t.getBoundingClientRect().top < 190) ci = i; });
      stepLinks.forEach((a, i) => { a.classList.toggle('active', i === ci); a.classList.toggle('passed', i < ci); });
      if (ci !== lastStep) {
        lastStep = ci;
        const a = stepLinks[Math.max(0, ci)];
        if (stepNow) stepNow.textContent = $('.st-dot span', a).textContent;
        if (stepTitle) stepTitle.textContent = $('.st-l', a).textContent;
        const rail = $('.steps-rail');
        if (rail && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: a.offsetLeft - rail.clientWidth / 2 + a.offsetWidth / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ── Field-notes filter ──────────────────────────────── */
  const qfs = $$('[data-q-filter]');
  const runFilter = src => {
    const q = src.value.trim().toLowerCase();
    qfs.forEach(o => { if (o !== src) o.value = src.value; });
    let shown = 0, total = 0;
    $$('section.sec').forEach(sec => {
      const isQ = sec.classList.contains('sec-q');
      const hit = !q || sec.innerText.toLowerCase().includes(q);
      sec.hidden = !hit;
      if (isQ) { total++; if (hit) shown++; }
      const a = $(`.toc a[data-toc="${sec.dataset.sec}"]`); if (a) a.parentElement.hidden = !hit;
    });
    $$('[data-q-count]').forEach(c => c.textContent = q ? `${shown}/${total}` : '');
    const empty = $('.q-empty'); if (empty) empty.hidden = shown > 0 || !q;
  };
  qfs.forEach(qf => qf.addEventListener('input', () => runFilter(qf)));

  /* ── Glossary tooltips (first use of a term per page) ── */
  const GLOSSARY = [
    ['AgentCore', /\bAgentCore\b/, 'Amazon Bedrock AgentCore: managed AWS services to host and operate AI agents (runtime, gateway, identity, memory, observability, policy, evaluations).'],
    ['Harness', /\bHarness(?:es)?\b/, 'An AgentCore Harness is an agent you define by configuration (model, instructions, tools); AgentCore runs the agent loop for you.'],
    ['Gateway', /\bGateway\b/, 'AgentCore Gateway: a managed tool server. It turns Lambda functions and APIs into MCP tools and checks who may call them.'],
    ['MCP', /\bMCP\b/, 'Model Context Protocol: an open standard for how an agent discovers tools and calls them.'],
    ['RAG', /\bRAG\b/, 'Retrieval-augmented generation: fetch relevant passages first, then have the model answer from that evidence.'],
    ['JWT', /\bJWTs?\b/, 'JSON Web Token: a signed token that says who the caller is and which scopes they hold. Anyone can read it; only the issuer can sign it.'],
    ['Cedar', /\bCedar\b/, 'Cedar: an open-source policy language. On AgentCore Gateway it permits or forbids each individual tool call.'],
    ['Guardrail', /\bGuardrails?\b/, 'Amazon Bedrock Guardrails screen prompts and responses for prompt attacks, sensitive data (PII) and denied topics.'],
    ['IAM', /\bIAM\b/, 'AWS Identity and Access Management: who can call which AWS APIs on which resources.'],
    ['execution role', /\bexecution roles?\b/, 'The IAM role a service assumes while running your code or agent. It decides what that code may do in AWS.'],
    ['trust policy', /\btrust polic(?:y|ies)\b/, 'The part of an IAM role that says who may assume it, for example lambda.amazonaws.com.'],
    ['least privilege', /\bleast[- ]privilege\b/, 'Grant only the actions and resources a principal needs, nothing more.'],
    ['Lambda', /\bLambda\b/, 'AWS Lambda runs your function on demand: an event goes in, a result comes out, billed per invocation.'],
    ['CloudShell', /\bCloudShell\b/, 'A browser terminal inside the AWS Console with the AWS CLI installed, already signed in as you.'],
    ['Cognito', /\bCognito\b/, 'Amazon Cognito user pools sign in users and apps and issue OAuth 2.0 / OpenID Connect tokens.'],
    ['Logs Insights', /\bLogs Insights\b/, 'CloudWatch Logs Insights: a query language to filter, parse and aggregate log events.'],
    ['prompt injection', /\b(?:indirect )?prompt injections?\b/i, 'Text that tries to override an agent\'s instructions. Indirect injection hides it in data the agent reads, such as a ticket or web page.'],
    ['knowledge base', /\bknowledge bases?\b/i, 'An index of your documents that a model can search, so answers can cite real evidence (retrieval).'],
    ['Code Interpreter', /\bCode Interpreter\b/, 'AgentCore Code Interpreter: an isolated sandbox where an agent can write and run code.'],
    ['SigV4', /\bSigV4\b/, 'AWS Signature Version 4: how every AWS API request is signed with your credentials.'],
    ['OAuth', /\bOAuth(?: 2\.0)?\b/, 'OAuth 2.0: the standard for an app to obtain an access token, here with the client-credentials flow.'],
    ['ARN', /\bARNs?\b/, 'Amazon Resource Name: the full, unique address of one AWS resource, such as arn:aws:lambda:us-west-2:…:function:my-function.'],
    ['environment variable', /\benvironment variables?\b/i, 'A named setting (NAME=value) a program reads when it starts. Change it and the program behaves differently without new code.'],
    ['VPC', /\bVPCs?\b/, 'Virtual Private Cloud: your own private network inside AWS, divided into subnets.'],
    ['PrivateLink', /\bPrivateLink\b/, 'AWS PrivateLink: reach an AWS service through a private endpoint inside your VPC instead of over the internet.'],
    ['interface endpoint', /\binterface endpoints?\b/i, 'A private network entrance to one AWS service, placed inside your subnets (AWS PrivateLink).'],
    ['PII', /\bPII\b/, 'Personally identifiable information: data that identifies a person, such as a username, email address or password.'],
    ['regex', /\bregex(?:es)?\b/i, 'Regular expression: a pattern that matches text. DISC-[A-Z]{3}-\\d{4} means DISC-, three capital letters, a dash, four digits.'],
    ['embedding', /\bembeddings?\b/i, 'A list of numbers that captures the meaning of some text, so text with similar meaning gets similar numbers.'],
    ['namespace', /\bnamespaces?\b/i, 'A folder-like path where AgentCore Memory files its records, for example supplychain/user/{actorId}/preferences.'],
    ['authorizer', /\bauthorizers?\b/i, 'The part of a service that checks each incoming token before it lets the request through.'],
  ];
  const prose = $('main.prose');
  if (prose) {
    const seen = new Set();
    const tip = document.createElement('div'); tip.id = 'gl-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.append(tip);
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest('pre,code,a,h1,h2,h3,h4,button,summary,figcaption,th,.callout-lbl,.checkpoint-hd,.gl,.mermaid,.debrief,.pager,.myid-slot,.acct-slot,label')) return NodeFilter.FILTER_REJECT;
        if (!p.closest('p,li,td')) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
      for (const [key, re, def] of GLOSSARY) {
        if (seen.has(key) || !node) continue;
        const m = re.exec(node.nodeValue); if (!m) continue;
        seen.add(key);
        const after = node.splitText(m.index); const rest = after.splitText(m[0].length);
        const span = document.createElement('span'); span.className = 'gl'; span.tabIndex = 0; span.dataset.def = def; span.setAttribute('aria-describedby', 'gl-tip');
        span.textContent = after.nodeValue; after.replaceWith(span);
        node = rest;
      }
    }
    let hideT;
    const showTip = el => {
      clearTimeout(hideT); tip.textContent = el.dataset.def; tip.hidden = false;
      const r = el.getBoundingClientRect(), tw = Math.min(320, innerWidth - 24);
      tip.style.width = tw + 'px';
      const left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2));
      const below = r.top < 140;
      tip.style.left = left + 'px'; tip.style.top = (below ? r.bottom + 10 : r.top - 10) + 'px';
      tip.classList.toggle('below', below);
    };
    const hideTip = () => { hideT = setTimeout(() => { tip.hidden = true; }, 80); };
    prose.addEventListener('mouseover', e => { const g = e.target.closest?.('.gl'); if (g) showTip(g); });
    prose.addEventListener('mouseout', e => { if (e.target.closest?.('.gl')) hideTip(); });
    prose.addEventListener('focusin', e => { if (e.target.classList?.contains('gl')) showTip(e.target); });
    prose.addEventListener('focusout', e => { if (e.target.classList?.contains('gl')) hideTip(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') tip.hidden = true; });
    addEventListener('scroll', () => { if (!tip.hidden) tip.hidden = true; }, { passive: true });
  }

  /* ── Reveal-on-scroll for big landing elements ───────── */
  const rev = $$('.mcard, .sk-col, .fp-node, .pcard, .note-card, .steps li');
  if (rev.length && 'IntersectionObserver' in window && !reduceMotion()) {
    rev.forEach(el => el.classList.add('pre-in'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach(el => io.observe(el));
  }

  /* ── Space canvases: starfield, planet, orbits ───────── */
  function sky(canvas, opts) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = 1, stars = [], raf = 0, visible = true, last = 0, mx = 0, my = 0, tmx = 0, tmy = 0, shoot = null;
    const host = canvas.closest('[style*="--mc"]') || root;
    const hue = getComputedStyle(host).getPropertyValue('--mc').trim() || '#38BDF8';
    const hue2 = getComputedStyle(host).getPropertyValue('--mc2').trim() || hue;
    let sats = []; try { sats = JSON.parse(canvas.dataset.sats || '[]'); } catch {}
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight; if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(520, Math.round(w * h / (opts.hero ? 2300 : 3600)));
      stars = Array.from({ length: n }, () => { const z = Math.random(); return { x: Math.random() * w, y: Math.random() * h, z, r: .25 + z * z * 1.5, p: Math.random() * 6.28, s: .3 + Math.random() * 1.4, tint: Math.random() < .12 ? (Math.random() < .5 ? '186,230,253' : '253,224,200') : '226,232,255' }; });
    }
    const ell = (cx, cy, rx, ry, rot, a) => [cx + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot), cy + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot)];
    function draw(now) {
      raf = 0;
      if (!w) return;
      if (now - last < 30 && !reduceMotion()) { schedule(); return; }
      last = now;
      const t = now / 1000;
      mx += (tmx - mx) * .05; my += (tmy - my) * .05;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = .25 + s.z * .55 + Math.sin(t * s.s + s.p) * .25 * s.z;
        let x = (s.x - t * (2 + s.z * 6) + mx * s.z * 18) % w; if (x < 0) x += w;
        const y = s.y + my * s.z * 12;
        ctx.fillStyle = `rgba(${s.tint},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
      }
      // shooting star
      if (!reduceMotion()) {
        if (!shoot && Math.random() < .004) shoot = { x: Math.random() * w * .7, y: Math.random() * h * .4, vx: 9 + Math.random() * 6, vy: 3 + Math.random() * 3, life: 1 };
        if (shoot) {
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9);
          g.addColorStop(0, `rgba(255,255,255,${shoot.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9); ctx.stroke();
          shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= .022; if (shoot.life <= 0) shoot = null;
        }
      }
      if (opts.hero) planet(t); else orbit(t);
      schedule();
    }
    function planet(t) {
      const narrow = w < 900, phone = w < 640;
      const R = phone ? w * .16 : narrow ? Math.min(w, h) * .16 : Math.min(h * .2, w * .13);
      const cx = (phone ? w * .9 : narrow ? w * .84 : w * .8) + mx * 8, cy = (phone ? 64 : narrow ? 150 : h * .3) + my * 6;
      const rot = -.38;
      // atmosphere glow
      let g = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 2.1);
      g.addColorStop(0, 'rgba(56,189,248,.28)'); g.addColorStop(.4, 'rgba(129,140,248,.10)'); g.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2.1, 0, 6.283); ctx.fill();
      const rings = [[1.55, .34, 'rgba(125,211,252,.55)', 1.2], [1.72, .38, 'rgba(167,139,250,.35)', 6], [1.9, .42, 'rgba(244,114,182,.22)', 2], [2.02, .45, 'rgba(253,230,138,.18)', 1]];
      const ringPass = back => rings.forEach(([k, e, col, lw]) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.ellipse(0, 0, R * k, R * k * e, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI); ctx.stroke(); ctx.restore();
      });
      // satellites on wide orbits, depth-sorted around the planet
      const orbitsN = sats.length || 6;
      const satPos = Array.from({ length: orbitsN }, (_, i) => {
        const RX = R * (2.4 + i * .42), RY = RX * (.2 + (i % 3) * .05), rr = rot + (i % 2 ? .1 : -.06);
        const a = t * (.11 - i * .011) + i * 1.9;
        return { i, RX, RY, rr, a, front: Math.sin(a) > 0, col: sats[i] || hue };
      });
      const drawOrbit = s => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.rr); ctx.strokeStyle = s.col + '26'; ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.ellipse(0, 0, s.RX, s.RY, 0, 0, 6.283); ctx.stroke(); ctx.restore();
      };
      const drawSat = s => {
        for (let k = 14; k >= 0; k--) { // trail
          const [x, y] = ell(cx, cy, s.RX, s.RY, s.rr, s.a - k * .02);
          ctx.fillStyle = s.col + Math.round((1 - k / 14) * 120).toString(16).padStart(2, '0');
          ctx.beginPath(); ctx.arc(x, y, 1.6 * (1 - k / 18), 0, 6.283); ctx.fill();
        }
        const [x, y] = ell(cx, cy, s.RX, s.RY, s.rr, s.a);
        const gl = ctx.createRadialGradient(x, y, 0, x, y, 14); gl.addColorStop(0, s.col); gl.addColorStop(1, s.col + '00');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, 6.283); ctx.fill();
      };
      satPos.forEach(drawOrbit);
      satPos.filter(s => !s.front).forEach(drawSat);
      ringPass(true);
      // planet body
      g = ctx.createRadialGradient(cx - R * .45, cy - R * .5, R * .05, cx, cy, R);
      g.addColorStop(0, '#E0F2FE'); g.addColorStop(.25, '#7DD3FC'); g.addColorStop(.6, '#4F46E5'); g.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
      // bands
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.clip();
      ctx.translate(cx, cy); ctx.rotate(rot * .6);
      [[-.35, .08, 'rgba(255,255,255,.10)'], [-.05, .05, 'rgba(244,114,182,.16)'], [.25, .1, 'rgba(30,27,75,.25)'], [.5, .04, 'rgba(255,255,255,.07)']].forEach(([y, hh, c]) => { ctx.fillStyle = c; ctx.fillRect(-R, y * R, R * 2, hh * R); });
      ctx.restore();
      // terminator shadow
      g = ctx.createLinearGradient(cx - R * .2, cy - R * .4, cx + R, cy + R * .7);
      g.addColorStop(0, 'rgba(3,5,14,0)'); g.addColorStop(.55, 'rgba(3,5,14,.35)'); g.addColorStop(1, 'rgba(3,5,14,.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
      // rim light
      ctx.strokeStyle = 'rgba(186,230,253,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R - .6, Math.PI * .85, Math.PI * 1.6); ctx.stroke();
      ringPass(false);
      satPos.filter(s => s.front).forEach(drawSat);
    }
    function orbit(t) {
      const cx = w * .86, cy = h * .34;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .4);
      g.addColorStop(0, hue + '22'); g.addColorStop(1, hue + '00');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      [[.3, .5, .55], [.42, .62, .3], [.18, .34, .4]].forEach(([kx, ky, al], i) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.32);
        ctx.strokeStyle = (i === 1 ? hue2 : hue) + Math.round(al * 120).toString(16).padStart(2, '0'); ctx.lineWidth = 1; ctx.setLineDash([2, 7]);
        ctx.beginPath(); ctx.ellipse(0, 0, w * kx, h * ky, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        const ang = t / (26 + i * 11) * 6.283 + i * 2;
        const x = Math.cos(ang) * w * kx, y = Math.sin(ang) * h * ky;
        const gl = ctx.createRadialGradient(x, y, 0, x, y, 12); gl.addColorStop(0, hue); gl.addColorStop(1, hue + '00');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.283); ctx.fill();
        ctx.restore();
      });
    }
    const schedule = () => { if (!raf && visible && !reduceMotion() && !document.hidden) raf = requestAnimationFrame(draw); };
    size(); draw(performance.now() + 1000);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); last = 0; draw(performance.now()); }, 120); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); }).observe(canvas);
    document.addEventListener('visibilitychange', schedule);
    mqReduce.addEventListener?.('change', () => { last = 0; draw(performance.now()); });
    if (opts.hero && matchMedia('(pointer: fine)').matches) canvas.parentElement.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - .5; tmy = (e.clientY - r.top) / r.height - .5; }, { passive: true });
  }
  $$('.hero-fx').forEach(c => sky(c, { hero: true }));
  $$('.mast-fx').forEach(c => sky(c, { hero: false }));
})();
