// ORBIT Field Academy — static site generator.
// Reads the private student-labs markdown, sanitizes it for a public repo, and writes
// the GitHub Pages site to the repository root.
//
//   cd tools && npm install && node build.mjs            (LABS_DIR defaults to ../../student-labs)
//   LABS_DIR=/path/to/student-labs node build.mjs
//
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABS = path.resolve(process.env.LABS_DIR || path.join(ROOT, '..', 'student-labs'));
const IMG_OUT = path.join(ROOT, 'img');
const SITE = 'ORBIT Field Academy';

// ── Public-safety sanitization ──────────────────────────────────────────────
// The source labs live in a private repo. These values must never reach the public site.
const SANITIZE = [
  [/962804699607/g, '111122223333'],
  [/us-west-2_TZHtlxeIE/g, 'us-west-2_EXAMPLE'],
  [/5eq3s8mpp6j5506lq11pu5g0kl/g, 'EXAMPLECLIENTID'],
  [/orbit-academy-wn4dc/g, 'orbit-academy-xxxxx'],
  [/`?Orbit-Recruit-2026!`?/g, 'the temporary password your instructor gives you'],
  [/`?Ignition-Recruit-2026!`?/g, 'the temporary password your instructor gives you'],
];
const FORBIDDEN = ['962804699607', 'TZHtlxeIE', '5eq3s8mpp6j5506lq11pu5g0kl', 'wn4dc', 'Recruit-2026!'];
const sanitize = s => SANITIZE.reduce((t, [re, rep]) => t.replace(re, rep), s);

// ── Missions ────────────────────────────────────────────────────────────────
const MISSIONS = [
  { n: '01', slug: 'mission-01', hue: '#38BDF8', hue2: '#0EA5E9', tag: 'Foundations', module: 'Module 1 · AWS Foundations' },
  { n: '02', slug: 'mission-02', hue: '#FB923C', hue2: '#F97316', tag: 'First code', module: 'Module 1 · AWS Foundations' },
  { n: '03', slug: 'mission-03', hue: '#A78BFA', hue2: '#8B5CF6', tag: 'Retrieval', module: 'Module 2 · Bedrock fundamentals' },
  { n: '04', slug: 'mission-04', hue: '#2DD4BF', hue2: '#14B8A6', tag: 'Agent + tools', module: 'Modules 3, 4, 6 · AgentCore' },
  { n: '05', slug: 'mission-05', hue: '#34D399', hue2: '#10B981', tag: 'Identity', module: 'Module 5 · Authentication' },
  { n: '06', slug: 'mission-06', hue: '#F472B6', hue2: '#EC4899', tag: 'Production', module: 'Production readiness' },
];
const DEFAULT_NAMES = { '06': 'MISSION ASSURANCE' };
const NOTES = ['03', '04', '05'];

const labFiles = fs.readdirSync(LABS);
for (const m of MISSIONS) {
  m.file = labFiles.find(f => f.startsWith(m.n + '-ORBIT') && f.endsWith('.md'));
  m.present = !!m.file;
}
for (const m of MISSIONS) {
  const nf = path.join(LABS, 'companionguides', m.n + '-companion.md');
  m.notes = fs.existsSync(nf) ? nf : null;
}

// ── Markdown helpers ────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const slugify = s => strip(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 64) || 'section';
const titleCase = s => s.toLowerCase().replace(/(^|[\s·—-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const dropEmoji = s => s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();

const LANG_LABEL = { python: 'Python', py: 'Python', json: 'JSON', bash: 'Shell', sh: 'Shell', shell: 'Shell', text: 'Text', '': 'Text', sql: 'Logs Insights', cedar: 'Cedar', yaml: 'YAML', js: 'JavaScript', javascript: 'JavaScript', http: 'HTTP' };

function makeMarked(images) {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (l === 'mermaid') return `<figure class="diagram"><pre class="mermaid" data-src="${esc(text)}">${esc(text)}</pre></figure>\n`;
        let body;
        const looksInsights = /^\s*(fields|filter|stats|sort)\b/m.test(text) && /\|/.test(text);
        const hl = l && hljs.getLanguage(l) ? l : (looksInsights ? 'sql' : null);
        try { body = hl ? hljs.highlight(text, { language: hl, ignoreIllegals: true }).value : esc(text); } catch { body = esc(text); }
        const label = looksInsights && (!l || l === 'text') ? 'Logs Insights' : (LANG_LABEL[l] || l.toUpperCase());
        return `<div class="code"><div class="code-bar"><span class="code-lang">${esc(label)}</span><button class="copy" type="button" aria-label="Copy code">Copy</button></div><pre><code class="hljs${hl ? ' language-' + hl : ''}">${body}</code></pre></div>\n`;
      },
      image({ href, title, text }) {
        let src = href;
        const mm = /^(?:\.\/)?images\/([^)]+)\.(png|jpe?g)$/i.exec(href || '');
        if (mm) { images.add(mm[1] + '.' + mm[2]); src = 'img/' + mm[1] + '.webp'; }
        return `<img src="${esc(src)}" alt="${esc(text)}" loading="lazy" decoding="async"${title ? ` title="${esc(title)}"` : ''}>`;
      },
    },
  });
  return marked;
}

// GitHub alerts → callouts
const ALERTS = { NOTE: ['note', 'Note'], TIP: ['tip', 'Tip'], IMPORTANT: ['important', 'Important'], WARNING: ['warning', 'Warning'], CAUTION: ['caution', 'Caution'] };
const ALERT_ICON = {
  note: '<path d="M12 8h.01M11 12h1v5h1"/><circle cx="12" cy="12" r="9"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  important: '<path d="M12 7v6M12 17h.01"/><path d="M5 4h14v12H9l-4 4z"/>',
  warning: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  caution: '<path d="M12 8v5M12 16h.01"/><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/>',
};
function alerts(html) {
  return html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/blockquote>/g, (m, k, rest) => {
    const [cls, lbl] = ALERTS[k];
    const body = ('<p>' + rest).replace(/^<p>\s*<\/p>/, '');
    return `<aside class="callout ${cls}"><div class="callout-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ALERT_ICON[cls]}</svg></div><div class="callout-body"><span class="callout-lbl">${lbl}</span>${body}</div></aside>`;
  });
}
// Other blockquotes: analogy / quote style
function quotes(html) {
  return html.replace(/<blockquote>/g, '<blockquote class="pull">');
}

// <details> reveals
function reveals(html) {
  return html.replace(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g, (m, sum, body) => {
    const t = strip(sum);
    const cls = /hint/i.test(t) ? 'hint' : /answer|solution|key|reveal/i.test(t) ? 'answer' : 'plain';
    return `<details class="reveal ${cls}"><summary><span>${sum}</span></summary><div class="reveal-body">${body}</div></details>`;
  });
}

// "**🧩 Investigation checkpoint**" paragraphs + following task list → checkpoint card
function checkpoints(html) {
  html = html.replace(/<p><strong>([^<]*?(?:checkpoint|Checkpoint)[^<]*?)<\/strong><\/p>\s*(<ul>[\s\S]*?<\/ul>)/g,
    (m, title, list) => `<div class="checkpoint"><div class="checkpoint-hd"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>${esc(dropEmoji(strip(title)))}</div>${list}</div>`);
  return html;
}

// Task-list checkboxes become persistent, interactive checks
function tasks(html, page) {
  let i = 0;
  return html.replace(/<li>\s*<input (?:checked="" )?disabled="" type="checkbox"(?: checked="")?>\s*([\s\S]*?)<\/li>/g, (m, body) => {
    const id = `${page}:${i++}`;
    return `<li class="task"><input type="checkbox" class="chk" data-k="${id}" aria-label="Mark done"><div class="task-t">${body}</div></li>`;
  });
}

// Wrap images with figure + caption + lightbox affordance
function wrapTables(html) {
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
}
function figures(html) {
  return html.replace(/<p>\s*(<img [^>]+>)\s*<\/p>/g, (m, img) => {
    const alt = (/alt="([^"]*)"/.exec(img) || [])[1] || '';
    return `<figure class="shot"><button class="zoom" type="button" aria-label="Enlarge screenshot">${img}</button>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
  });
}

// Headings: ids, sections, TOC
function sections(html, opts = {}) {
  const toc = [];
  const used = new Set();
  const uid = s => { let id = slugify(s), k = id, n = 2; while (used.has(k)) k = `${id}-${n++}`; used.add(k); return k; };
  html = html.replace(/<hr>\s*(?=<h2>)/g, '').replace(/^\s*<hr>/, '').replace(/<hr>\s*$/, '');
  html = html.replace(/<h([123])>([\s\S]*?)<\/h\1>/g, (m, lvl, inner) => {
    const text = strip(inner);
    const phm = lvl === '2' && /Phase\s+(\d+)\s*[—–-]/.exec(text);
    const id = phm ? uid('phase-' + phm[1]) : uid(text.replace(/\(\s*\d+[^)]*minutes?[^)]*\)/, ''));
    if (lvl === '2') {
      const ph = /Phase\s+(\d+)\s*[—–-]\s*(.*?)(?:\s*\(([^)]*)\))?\s*$/.exec(dropEmoji(text));
      const q = /^\s*(\d+)\.\s*(.*)$/.exec(dropEmoji(text));
      if (ph) {
        toc.push({ id, label: ph[2], kind: 'phase', num: ph[1], time: ph[3] || '' });
        return `<h2 id="${id}" class="phase-h"><span class="phase-num">Phase ${ph[1]}</span><span class="phase-title">${esc(ph[2])}</span>${ph[3] ? `<span class="phase-time">${esc(ph[3])}</span>` : ''}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h2>`;
      }
      if (opts.notes && q) {
        toc.push({ id, label: q[2], kind: 'q', num: q[1] });
        return `<h2 id="${id}" class="q-h"><span class="q-num">${q[1]}</span><span class="q-title">${inner.replace(/^[\s\S]*?\d+\.\s*/, '')}</span><a class="anchor" href="#${id}" aria-label="Link to this question">#</a></h2>`;
      }
      const label = dropEmoji(text).replace(/\s*\(([^)]*)\)\s*$/, '');
      const time = (/\(([^)]*minutes?[^)]*)\)\s*$/.exec(text) || [])[1] || '';
      toc.push({ id, label, kind: 'sec', time });
      return `<h2 id="${id}"><span>${esc(label)}</span>${time ? `<span class="phase-time">${esc(time)}</span>` : ''}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h2>`;
    }
    if (lvl === '1') { // PART dividers in companion notes
      toc.push({ id, label: dropEmoji(text), kind: 'part' });
      return `<h2 id="${id}" class="part-h"><span>${esc(dropEmoji(text))}</span></h2>`;
    }
    return `<h3 id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h3>`;
  });
  // wrap h2 blocks in <section> so checkbox progress maps to phases
  const parts = html.split(/(?=<h2 id=")/);
  html = parts.map(p => {
    const mm = /^<h2 id="([^"]+)"/.exec(p);
    return mm ? `<section class="sec" data-sec="${mm[1]}">${p}</section>` : p;
  }).join('');
  return { html, toc };
}

// Parse the shared header of a lab file
function parseHeader(md) {
  const lines = md.split('\n');
  const out = { brand: '', mission: '', subtitle: '', meta: {}, story: '', alongside: [] };
  let i = 0;
  const take = re => { const m = re.exec(lines[i] || ''); if (m) { i++; return m; } return null; };
  while (i < lines.length && !lines[i].trim()) i++;
  let m;
  if ((m = take(/^#\s+(.*)$/))) out.brand = m[1];
  if ((m = take(/^##\s+(.*)$/))) out.mission = m[1];
  if ((m = take(/^###\s+(.*)$/))) out.subtitle = m[1];
  while (i < lines.length && !lines[i].trim()) i++;
  // header blockquote
  const bq = [];
  while (i < lines.length && /^>/.test(lines[i])) { bq.push(lines[i].replace(/^>\s?/, '')); i++; }
  const joined = bq.join('\n');
  const lv = /\*\*LEVEL:\*\*\s*([^·\n]*)/.exec(joined); if (lv) out.meta.level = lv[1].trim();
  const tt = /\*\*TARGET TIME:\*\*\s*([^·\n]*)/.exec(joined); if (tt) out.meta.time = tt[1].trim();
  const en = /\*\*ENVIRONMENT:\*\*\s*([^\n]*)/.exec(joined); if (en) out.meta.env = en[1].trim();
  const st = /\*\*THE STORY:\*\*\s*([\s\S]*?)(?:\n\*\*[A-Z ]+:\*\*|$)/.exec(joined); if (st) out.story = st[1].replace(/\n/g, ' ').trim();
  if (!lv && !st && bq.length) out.alongside = bq.filter(Boolean);
  out.rest = lines.slice(i).join('\n');
  return out;
}

const inline = new Marked({ gfm: true });
const md1 = s => inline.parseInline(s || '');

// ── Shared chrome ───────────────────────────────────────────────────────────
const FONTS = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23070B1A'/%3E%3Cellipse cx='32' cy='32' rx='24' ry='9' fill='none' stroke='%2338BDF8' stroke-width='3' transform='rotate(-24 32 32)'/%3E%3Ccircle cx='32' cy='32' r='9' fill='%23F472B6'/%3E%3Ccircle cx='53' cy='22' r='4' fill='%23FDE68A'/%3E%3C/svg%3E";

function patch(m, size = 120, cls = 'patch') {
  const name = (m.name || '').toUpperCase();
  const id = `arc-${m.n}-${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="--mc:${m.hue};--mc2:${m.hue2}">
<defs><path id="${id}" d="M19,60 A41,41 0 0,1 101,60"/><radialGradient id="g${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${m.hue}" stop-opacity=".38"/><stop offset=".55" stop-color="${m.hue2}" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
<circle cx="60" cy="60" r="57" class="p-disc"/><circle cx="60" cy="60" r="57" fill="url(#g${id})"/>
<circle cx="60" cy="60" r="52" class="p-ring"/><circle cx="60" cy="60" r="45" class="p-ring2"/>
<text class="p-arc"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>
<text x="60" y="80" text-anchor="middle" class="p-num">${m.n}</text>
<ellipse cx="60" cy="62" rx="56" ry="14" class="p-orbit" transform="rotate(-18 60 62)"/>
<circle cx="8.5" cy="78" r="4.2" class="p-sat"/><circle cx="104" cy="44" r="2" class="p-star"/><circle cx="26" cy="30" r="1.4" class="p-star"/>
</svg>`;
}

const LOGO = `<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#F472B6"/></linearGradient></defs><circle cx="20" cy="20" r="7.5" fill="url(#lg)"/><ellipse cx="20" cy="20" rx="17" ry="6.2" fill="none" stroke="url(#lg)" stroke-width="1.8" transform="rotate(-24 20 20)"/><circle cx="35" cy="13.4" r="2.4" fill="#FDE68A"/></svg>`;
const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>',
  id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="12" r="2.4"/><path d="M14 10h4M14 14h3"/></svg>',
};

function nav(current) {
  const items = MISSIONS.map(m => `<a class="nav-m${m.present ? '' : ' soon'}" href="${m.present ? m.slug + '.html' : 'index.html#missions'}" data-page="${m.slug}" style="--mc:${m.hue}"${current === m.slug ? ' aria-current="page"' : ''} title="Mission ${m.n} · ${esc(titleCase(m.name || ''))}"><span class="nav-dot"></span><span class="nav-n">${m.n}</span><span class="nav-name">${esc(titleCase(m.name || ''))}</span><span class="nav-star" aria-hidden="true">★</span></a>`).join('');
  return `<header class="topbar"><div class="topbar-in">
  <a class="brand" href="index.html">${LOGO}<span class="brand-t">ORBIT <b>Field Academy</b></span></a>
  <nav class="nav" aria-label="Missions">${items}<span class="nav-sep"></span><a class="nav-x" href="notes.html"${current?.startsWith('notes') ? ' aria-current="page"' : ''}>Field notes</a><a class="nav-x" href="field-guide.html">Quick ref</a></nav>
  <div class="tools">
    <button class="id-chip" type="button" data-open-id aria-haspopup="dialog">${ICON.id}<span class="id-chip-v" data-myid-label>Set your ID</span></button>
    <button class="iconbtn" id="theme" type="button" aria-label="Toggle light or dark theme"><span class="i-sun">${ICON.sun}</span><span class="i-moon">${ICON.moon}</span></button>
    <button class="iconbtn menu-btn" type="button" aria-label="Open menu" aria-expanded="false">${ICON.menu}</button>
  </div>
</div><div id="readbar" aria-hidden="true"></div></header>`;
}

const ID_DIALOG = `<dialog class="id-dialog" id="id-dialog" aria-labelledby="idd-t">
<form method="dialog" class="id-form">
  <h2 id="idd-t">Your mission ID</h2>
  <p>Every resource you create carries your personal <code>MY_ID</code>. Enter it once and every page, table and code block on this site shows <em>your</em> names, ready to copy.</p>
  <label>MY_ID <span>3–10 lowercase letters or digits, e.g. <code>p07x42</code></span><input name="myid" autocomplete="off" spellcheck="false" pattern="[a-z0-9]{3,10}" placeholder="p07x42" required></label>
  <label>AWS account ID <span>optional · 12 digits · top-right account menu in the console</span><input name="acct" inputmode="numeric" autocomplete="off" pattern="[0-9]{12}" placeholder="123456789012"></label>
  <p class="id-err" role="alert"></p>
  <div class="id-actions"><button value="clear" type="button" class="btn ghost" data-id-clear>Clear</button><button value="cancel" type="button" class="btn ghost" data-id-cancel>Cancel</button><button value="save" class="btn primary" data-id-save>Save</button></div>
</form></dialog>
<dialog class="lightbox" id="lightbox" aria-label="Screenshot"><button class="lb-close" type="button" aria-label="Close">×</button><img alt=""><p class="lb-cap"></p></dialog>`;

function shell({ id, title, desc, body, hue = '#38BDF8', hue2 = '#0EA5E9', bodyClass = '', extraHead = '' }) {
  return `<!doctype html>
<html lang="en" data-page="${id}" style="--mc:${hue};--mc2:${hue2}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#070B1A">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website">
<script>try{var t=localStorage.getItem('orbit:theme');document.documentElement.dataset.theme=t||'dark'}catch(e){document.documentElement.dataset.theme='dark'}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="assets/site.css">
<link rel="icon" href="${FAVICON}">
${extraHead}</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${nav(id)}
${body}
<footer class="foot"><div class="foot-in">
  <div class="foot-brand">${LOGO}<div><b>ORBIT Field Academy</b><span>Hands-on Amazon Bedrock AgentCore missions · AWS Console only</span></div></div>
  <p>Screenshots were captured in a real training account in US West (Oregon). Account IDs in text are shown as <code>111122223333</code>; set your own with the <button class="linkish" type="button" data-open-id>mission ID</button> button.</p>
</div></footer>
${ID_DIALOG}
<script>window.ORBIT_PAGES=${JSON.stringify(Object.fromEntries(Object.entries(PAGE_TOTALS)))};</script>
<script src="assets/site.js" defer></script>
<script type="module" src="assets/diagrams.js"></script>
</body></html>`;
}
const PAGE_TOTALS = {}; // page id → number of checkboxes (filled in as pages are built)

// ── Build mission pages ─────────────────────────────────────────────────────
const allImages = new Set();
const built = [];

for (const m of MISSIONS) {
  if (!m.present) { m.name = DEFAULT_NAMES[m.n] || ''; continue; }
  const raw = sanitize(fs.readFileSync(path.join(LABS, m.file), 'utf8'));
  const h = parseHeader(raw);
  m.name = (h.mission.split(/[·—]/)[1] || h.mission).trim();
  m.subtitle = h.subtitle;
  m.meta = h.meta;
  m.story = h.story;
  m.rest = h.rest;
}
for (const m of MISSIONS) if (!m.name) m.name = DEFAULT_NAMES[m.n] || 'Mission ' + m.n;

for (const [idx, m] of MISSIONS.entries()) {
  if (!m.present) continue;
  const imgs = new Set();
  const marked = makeMarked(imgs);
  let html = marked.parse(m.rest);
  html = alerts(html); html = quotes(html); html = reveals(html); html = checkpoints(html);
  html = tasks(html, m.slug); html = figures(html); html = wrapTables(html);
  const { html: secHtml, toc } = sections(html);
  html = secHtml;
  PAGE_TOTALS[m.slug] = (html.match(/class="chk"/g) || []).length;
  imgs.forEach(i => allImages.add(i));
  m.toc = toc;
  m.phases = toc.filter(t => t.kind === 'phase').length;
  m.html = html;
  m.imgCount = imgs.size;
}

function missionPage(m, idx) {
  const vis = MISSIONS.filter(x => x.present);
  const pos = vis.indexOf(m);
  const prev = vis[pos - 1], next = vis[pos + 1];
  const chips = [
    m.meta.level && `<span class="chip"><b>Level</b>${md1(m.meta.level)}</span>`,
    m.meta.time && `<span class="chip"><b>Time</b>${md1(m.meta.time)}</span>`,
    m.meta.env && `<span class="chip"><b>Where</b>${md1(m.meta.env)}</span>`,
    `<span class="chip"><b>Phases</b>${m.phases}</span>`,
  ].filter(Boolean).join('');
  const tocHtml = m.toc.map(t => `<li class="toc-${t.kind}"><a href="#${t.id}" data-toc="${t.id}">${t.kind === 'phase' ? `<span class="toc-n">${t.num}</span>` : '<span class="toc-n toc-dot"></span>'}<span class="toc-l">${esc(t.label)}</span><span class="toc-p" aria-hidden="true"></span></a></li>`).join('');
  const notesLink = m.notes ? `<a class="side-link" href="notes-${m.n}.html">Field notes for Mission ${m.n} →</a>` : '';
  const body = `
<section class="mast" style="--mc:${m.hue};--mc2:${m.hue2}">
  <canvas class="mast-fx" aria-hidden="true"></canvas>
  <div class="mast-in">
    <div class="mast-patch">${patch(m, 148)}</div>
    <div class="mast-text">
      <p class="eyebrow">Mission ${m.n} of ${MISSIONS.length} · ${esc(m.tag)} · ${esc(m.module)}</p>
      <h1>${esc(titleCase(m.name))}</h1>
      <p class="sub">${md1(m.subtitle)}</p>
      ${m.story ? `<p class="story"><span class="story-k">The story</span>${md1(m.story)}</p>` : ''}
      <div class="chips">${chips}</div>
      <div class="mast-actions"><a class="btn primary" href="#${m.toc.find(t => t.kind === 'phase')?.id || m.toc[0]?.id}">Start the mission</a><button class="btn ghost" type="button" data-print>${ICON.print}Print handout</button><span class="mission-progress" data-progress="${m.slug}"><span class="mp-bar"><i></i></span><span class="mp-t">0%</span></span></div>
    </div>
  </div>
</section>
<div class="page" style="--mc:${m.hue};--mc2:${m.hue2}">
  <aside class="side" aria-label="On this page">
    <div class="side-in">
      <p class="side-h">On this page</p>
      <ol class="toc">${tocHtml}</ol>
      ${notesLink}
    </div>
  </aside>
  <main id="main" class="prose" data-page="${m.slug}">
${m.html}
    <nav class="pager" aria-label="Mission navigation">
      ${prev ? `<a class="pg prev" href="${prev.slug}.html" style="--mc:${prev.hue}"><small>← Previous mission</small><span>${prev.n} · ${esc(titleCase(prev.name))}</span></a>` : '<a class="pg prev" href="index.html"><small>← Back</small><span>Mission control</span></a>'}
      ${next ? `<a class="pg next" href="${next.slug}.html" style="--mc:${next.hue}"><small>Next mission →</small><span>${next.n} · ${esc(titleCase(next.name))}</span></a>` : '<a class="pg next" href="index.html"><small>All done →</small><span>Mission control</span></a>'}
    </nav>
  </main>
</div>`;
  return shell({ id: m.slug, title: `Mission ${m.n} · ${titleCase(m.name)} — ${SITE}`, desc: strip(md1(m.story || m.subtitle)).slice(0, 220), body, hue: m.hue, hue2: m.hue2, bodyClass: 'mission' });
}

// ── Companion field notes ───────────────────────────────────────────────────
function notesPage(m) {
  const raw = sanitize(fs.readFileSync(m.notes, 'utf8'));
  const h = parseHeader(raw);
  const imgs = new Set();
  const marked = makeMarked(imgs);
  let html = marked.parse(h.rest);
  html = alerts(html); html = quotes(html); html = reveals(html); html = checkpoints(html);
  html = tasks(html, 'notes-' + m.n); html = figures(html); html = wrapTables(html);
  const { html: secHtml, toc } = sections(html, { notes: true });
  imgs.forEach(i => allImages.add(i));
  const qs = toc.filter(t => t.kind === 'q').length;
  const tocHtml = toc.map(t => `<li class="toc-${t.kind}"><a href="#${t.id}" data-toc="${t.id}">${t.kind === 'q' ? `<span class="toc-n">${t.num}</span>` : t.kind === 'part' ? '' : '<span class="toc-n toc-dot"></span>'}<span class="toc-l">${esc(t.label)}</span></a></li>`).join('');
  const along = h.alongside.map(l => `<li>${md1(l)}</li>`).join('');
  const body = `
<section class="mast notes-mast" style="--mc:${m.hue};--mc2:${m.hue2}">
  <canvas class="mast-fx" aria-hidden="true"></canvas>
  <div class="mast-in">
    <div class="mast-patch">${patch(m, 120)}</div>
    <div class="mast-text">
      <p class="eyebrow">Field notes · Mission ${m.n} companion · ${qs} questions answered</p>
      <h1>${esc(titleCase(m.name))}: the questions recruits ask</h1>
      <p class="sub">${md1(dropEmoji(h.subtitle))}</p>
      ${along ? `<ul class="along">${along}</ul>` : ''}
      <div class="mast-actions"><a class="btn primary" href="${m.slug}.html">Open Mission ${m.n}</a><button class="btn ghost" type="button" data-print>${ICON.print}Print notes</button></div>
    </div>
  </div>
</section>
<div class="page notes" style="--mc:${m.hue};--mc2:${m.hue2}">
  <aside class="side" aria-label="Questions">
    <div class="side-in">
      <p class="side-h">Questions</p>
      <label class="q-filter"><input type="search" placeholder="Filter questions…" data-q-filter aria-label="Filter questions"></label>
      <ol class="toc">${tocHtml}</ol>
    </div>
  </aside>
  <main id="main" class="prose" data-page="notes-${m.n}">
${secHtml}
    <nav class="pager"><a class="pg prev" href="notes.html"><small>← All field notes</small><span>Field notes</span></a><a class="pg next" href="${m.slug}.html" style="--mc:${m.hue}"><small>Back to the mission →</small><span>${m.n} · ${esc(titleCase(m.name))}</span></a></nav>
  </main>
</div>`;
  return shell({ id: 'notes-' + m.n, title: `Field notes · Mission ${m.n} — ${SITE}`, desc: `Companion Q&A for Mission ${m.n}, ${titleCase(m.name)}.`, body, hue: m.hue, hue2: m.hue2, bodyClass: 'notes-page' });
}

// ── Landing page ────────────────────────────────────────────────────────────
function landing() {
  const totalMin = MISSIONS.reduce((a, m) => {
    const t = (m.meta?.time || '').match(/(\d+)\s*[–-]\s*(\d+)/);
    return a + (t ? (Number(t[1]) + Number(t[2])) / 2 : (m.present ? 0 : 150));
  }, 0);
  const hours = Math.round(totalMin / 60);
  const stations = MISSIONS.map((m, i) => `
    <li class="station${m.present ? '' : ' soon'}" style="--mc:${m.hue};--mc2:${m.hue2};--i:${i}">
      <a href="${m.present ? m.slug + '.html' : '#missions'}" class="station-card" data-page="${m.slug}">
        <div class="station-top">${patch(m, 84, 'patch sm')}<div><p class="station-k">Mission ${m.n} · ${esc(m.tag)}</p><h3>${esc(titleCase(m.name))}</h3></div><span class="station-star" aria-label="Completed">★</span></div>
        <p class="station-sub">${m.present ? md1(m.subtitle) : 'Guardrails, Cedar policy on the gateway, action gates, invocation limits, observability and online evaluations.'}</p>
        <div class="station-meta">${m.present ? `<span>${esc((m.meta?.time || '').replace(/\s*\(.*\)\s*$/, ''))}</span><span>${m.phases} phases</span><span>${esc(m.meta?.level || '')}</span>` : '<span>In preparation</span>'}</div>
        <div class="station-progress" data-progress="${m.slug}"><span class="mp-bar"><i></i></span><span class="mp-t"></span></div>
      </a>
    </li>`).join('');
  const notes = MISSIONS.filter(m => m.notes).map(m => `<a class="note-card" href="notes-${m.n}.html" style="--mc:${m.hue}"><span class="note-n">${m.n}</span><span><b>${esc(titleCase(m.name))}</b><small>Companion Q&amp;A</small></span></a>`).join('');
  const body = `
<section class="hero">
  <canvas class="hero-fx" aria-hidden="true"></canvas>
  <div class="hero-in">
    <p class="eyebrow">AWS Agentic AI microcredential · Amazon Bedrock AgentCore</p>
    <h1 class="hero-h">Build an AI agent <em>you would trust</em> with a customer.</h1>
    <p class="hero-lede">Six hands-on missions in the AWS Console. You start with Regions and IAM, give a model a knowledge base and tools, put a real identity perimeter around it, and finish by making it production-grade: guardrails, policy, observability and evaluations. No laptop installs. Real AWS, real errors, real fixes.</p>
    <div class="hero-actions"><a class="btn primary lg" href="#missions">Choose a mission</a><button class="btn ghost lg" type="button" data-open-id>${ICON.id}Set your mission ID</button></div>
    <dl class="facts">
      <div><dt>${MISSIONS.length}</dt><dd>missions, each building on the last</dd></div>
      <div><dt>~${hours} h</dt><dd>of guided work, plus challenges</dd></div>
      <div><dt>1</dt><dd>shared account in <code>us-west-2</code></dd></div>
      <div><dt>&lt;$1</dt><dd>per participant, end to end</dd></div>
    </dl>
  </div>
</section>

<main id="main" class="home">
  <section class="band" id="missions">
    <div class="band-hd"><p class="eyebrow">The flight plan</p><h2>Six missions, one agent</h2><p>Each mission ends with checkpoints, challenge exercises and a cleanup list. Tick the checkpoints as you go; your progress is saved in this browser and shows as a star when a mission is complete.</p></div>
    <ol class="orbit">${stations}</ol>
  </section>

  <section class="band arch">
    <div class="band-hd"><p class="eyebrow">What you will build</p><h2>The ORBIT support agent, end to end</h2><p>One managed agent on AgentCore, with every layer a production team would ask about. Each layer is a mission.</p></div>
    <figure class="arch-fig">${ARCH_SVG}</figure>
  </section>

  <section class="band setup" id="start">
    <div class="band-hd"><p class="eyebrow">Before you start</p><h2>Five things to have ready</h2></div>
    <ol class="steps">
      <li><b>Your sign-in.</b> Your instructor gives you an IAM user name and password for the shared training account.</li>
      <li><b>Region: US West (Oregon), <code>us-west-2</code>.</b> Check the Region selector every time you open a new service.</li>
      <li><b>Your <code>MY_ID</code>.</b> Your seat number plus two random characters, lowercase, for example <code>p07x42</code>. Use the same one in every mission. <button class="linkish" type="button" data-open-id>Enter it here</button> and every page shows your real resource names.</li>
      <li><b>Shared-account manners.</b> Never edit or delete anything that does not contain your <code>MY_ID</code>. Resources that start with <code>orbit-academy-</code> are shared and read-only.</li>
      <li><b>A browser.</b> Current Chrome, Edge or Firefox. No installs; AWS CloudShell covers the few terminal steps.</li>
    </ol>
    <div class="id-card">
      <div><h3>Your mission ID</h3><p>Type it once. Every <code>MY_ID</code> on this site, including inside code you copy, becomes yours.</p></div>
      <div class="id-card-v"><span class="id-big" data-myid-label>not set</span><button class="btn primary" type="button" data-open-id>Set ID</button></div>
    </div>
  </section>

  <section class="band notes-band">
    <div class="band-hd"><p class="eyebrow">Go deeper</p><h2>Field notes and quick reference</h2><p>The field notes answer the questions recruits actually ask, one card at a time. The quick reference is the one-page field guide with diagrams, glossary and the fault finder.</p></div>
    <div class="note-grid">${notes}<a class="note-card ref" href="field-guide.html" style="--mc:#FDE68A"><span class="note-n">★</span><span><b>Quick reference</b><small>One-page field guide</small></span></a></div>
  </section>
</main>`;
  return shell({ id: 'home', title: `${SITE} — hands-on Amazon Bedrock AgentCore labs`, desc: 'Six AWS Console missions: IAM, Lambda, Bedrock, knowledge bases, an AgentCore agent with tools, a JWT perimeter, then guardrails, policy, observability and evaluations.', body, bodyClass: 'home-page' });
}

function notesIndex() {
  const cards = MISSIONS.filter(m => m.notes).map(m => `<li style="--mc:${m.hue};--mc2:${m.hue2}"><a class="station-card" href="notes-${m.n}.html"><div class="station-top">${patch(m, 72, 'patch sm')}<div><p class="station-k">Mission ${m.n} companion</p><h3>${esc(titleCase(m.name))}</h3></div></div><p class="station-sub">${md1(m.subtitle)}</p></a></li>`).join('');
  const body = `<section class="mast slim"><canvas class="mast-fx" aria-hidden="true"></canvas><div class="mast-in"><div class="mast-text"><p class="eyebrow">Field notes</p><h1>Questions recruits ask</h1><p class="sub">Read these alongside a mission when the console shows you a word you have never seen. Each note answers one question in plain language, with the AWS term in bold.</p></div></div></section>
<main id="main" class="home"><section class="band"><ol class="orbit three">${cards}</ol></section></main>`;
  return shell({ id: 'notes', title: `Field notes — ${SITE}`, desc: 'Companion Q&A for the ORBIT missions.', body, bodyClass: 'home-page' });
}

const ARCH_SVG = `<svg viewBox="0 0 1100 520" role="img" aria-labelledby="arch-t arch-d" class="arch-svg">
<title id="arch-t">ORBIT agent architecture</title><desc id="arch-d">A caller obtains a JWT from Amazon Cognito and invokes the AgentCore harness. The harness runs Claude Haiku through a Bedrock guardrail, calls tools through AgentCore Gateway where a Cedar policy engine decides each call, and the gateway invokes a Lambda order tool and the knowledge base. Lifecycle hooks, observability and online evaluations surround the agent.</desc>
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="a-head"/></marker>
<linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#2DD4BF"/><stop offset="1" stop-color="#38BDF8"/></linearGradient>
</defs>
<g class="a-ring"><rect x="290" y="40" width="520" height="440" rx="34"/></g>
<text x="550" y="70" class="a-cap" text-anchor="middle">Amazon Bedrock AgentCore</text>
<g class="a-node" style="--c:#34D399"><rect x="30" y="200" width="200" height="110" rx="18"/><text x="130" y="238" text-anchor="middle" class="a-t">Caller app</text><text x="130" y="262" text-anchor="middle" class="a-s">Bearer JWT · M05</text><text x="130" y="284" text-anchor="middle" class="a-s">or IAM · M04</text></g>
<g class="a-node" style="--c:#34D399"><rect x="30" y="360" width="200" height="90" rx="18"/><text x="130" y="398" text-anchor="middle" class="a-t">Amazon Cognito</text><text x="130" y="422" text-anchor="middle" class="a-s">issues tokens · M02 M05</text></g>
<g class="a-node hero-node" style="--c:#2DD4BF"><rect x="340" y="190" width="200" height="130" rx="20"/><text x="440" y="232" text-anchor="middle" class="a-t">Harness</text><text x="440" y="256" text-anchor="middle" class="a-s">managed agent loop</text><text x="440" y="278" text-anchor="middle" class="a-s">limits · allowed tools</text><text x="440" y="300" text-anchor="middle" class="a-s">M04 M06</text></g>
<g class="a-node" style="--c:#F472B6"><rect x="340" y="96" width="200" height="66" rx="16"/><text x="440" y="124" text-anchor="middle" class="a-t">Guardrail</text><text x="440" y="146" text-anchor="middle" class="a-s">prompt attacks · PII · topics</text></g>
<g class="a-node" style="--c:#FB923C"><rect x="340" y="360" width="200" height="90" rx="18"/><text x="440" y="398" text-anchor="middle" class="a-t">Claude Haiku 4.5</text><text x="440" y="422" text-anchor="middle" class="a-s">Amazon Bedrock · M02 M03</text></g>
<g class="a-node" style="--c:#F472B6"><rect x="600" y="96" width="180" height="66" rx="16"/><text x="690" y="124" text-anchor="middle" class="a-t">Lifecycle hooks</text><text x="690" y="146" text-anchor="middle" class="a-s">action gate · M06</text></g>
<g class="a-node" style="--c:#2DD4BF"><rect x="600" y="190" width="180" height="130" rx="20"/><text x="690" y="232" text-anchor="middle" class="a-t">Gateway</text><text x="690" y="256" text-anchor="middle" class="a-s">MCP tools · M04</text><text x="690" y="284" text-anchor="middle" class="a-s a-pol">Cedar policy · M06</text></g>
<g class="a-node" style="--c:#A78BFA"><rect x="600" y="360" width="180" height="90" rx="18"/><text x="690" y="398" text-anchor="middle" class="a-t">Knowledge base</text><text x="690" y="422" text-anchor="middle" class="a-s">policy evidence · M03</text></g>
<g class="a-node" style="--c:#FB923C"><rect x="870" y="190" width="200" height="110" rx="18"/><text x="970" y="228" text-anchor="middle" class="a-t">Lambda tools</text><text x="970" y="252" text-anchor="middle" class="a-s">lookup_order · issue_refund</text><text x="970" y="276" text-anchor="middle" class="a-s">M02 M04 M06</text></g>
<g class="a-node" style="--c:#38BDF8"><rect x="870" y="360" width="200" height="120" rx="18"/><text x="970" y="396" text-anchor="middle" class="a-t">Observe + evaluate</text><text x="970" y="420" text-anchor="middle" class="a-s">traces · Logs Insights</text><text x="970" y="442" text-anchor="middle" class="a-s">LLM judges · alarms</text><text x="970" y="464" text-anchor="middle" class="a-s">M02 M06</text></g>
<g class="a-node" style="--c:#38BDF8"><rect x="870" y="70" width="200" height="90" rx="18"/><text x="970" y="106" text-anchor="middle" class="a-t">IAM roles</text><text x="970" y="130" text-anchor="middle" class="a-s">one per principal · M01</text></g>
<g class="a-edges">
<path d="M230 255H340" marker-end="url(#ah)"/><path d="M130 360V310" marker-end="url(#ah)"/>
<path d="M440 190V162" marker-end="url(#ah)"/><path d="M440 320V360" marker-end="url(#ah)"/>
<path d="M540 255H600" marker-end="url(#ah)"/><path d="M540 215C570 180 590 150 600 140" marker-end="url(#ah)"/>
<path d="M690 320V360" marker-end="url(#ah)"/><path d="M780 245H870" marker-end="url(#ah)"/>
<path class="dash" d="M780 300C820 340 840 380 870 400"/><path class="dash" d="M540 300H560Q572 300 572 312V486Q572 498 584 498H846Q858 498 862 488L868 470"/>
</g>
</svg>`;

// ── Images ──────────────────────────────────────────────────────────────────
function convertImages() {
  fs.mkdirSync(IMG_OUT, { recursive: true });
  const srcDir = path.join(LABS, 'images');
  let made = 0, missing = [];
  for (const f of allImages) {
    const src = path.join(srcDir, f);
    const out = path.join(IMG_OUT, f.replace(/\.(png|jpe?g)$/i, '.webp'));
    if (!fs.existsSync(src)) { missing.push(f); continue; }
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '1600', '0', src, '-o', out]);
    made++;
  }
  // drop stale webp files no page references any more
  for (const f of fs.readdirSync(IMG_OUT)) {
    const base = f.replace(/\.webp$/, '');
    if (![...allImages].some(i => i.replace(/\.(png|jpe?g)$/i, '') === base)) fs.unlinkSync(path.join(IMG_OUT, f));
  }
  return { made, missing };
}

// ── Write everything ────────────────────────────────────────────────────────
const outputs = {};
for (const [i, m] of MISSIONS.entries()) if (m.present) outputs[m.slug + '.html'] = () => missionPage(m, i);
for (const m of MISSIONS) if (m.notes) outputs[`notes-${m.n}.html`] = () => notesPage(m);
// notes pages add to PAGE_TOTALS/images, so render them before shells that embed totals
const rendered = {};
for (const [f, fn] of Object.entries(outputs)) rendered[f] = fn();
// re-render missions so every page carries complete PAGE_TOTALS
for (const [i, m] of MISSIONS.entries()) if (m.present) rendered[m.slug + '.html'] = missionPage(m, i);
for (const m of MISSIONS) if (m.notes) rendered[`notes-${m.n}.html`] = notesPage(m);
rendered['index.html'] = landing();
rendered['notes.html'] = notesIndex();

let bad = [];
for (const [f, html] of Object.entries(rendered)) {
  for (const s of FORBIDDEN) if (html.includes(s)) bad.push(`${f}: ${s}`);
  fs.writeFileSync(path.join(ROOT, f), html);
}
// field guide: sanitized already; check it too
const fg = fs.readFileSync(path.join(ROOT, 'field-guide.html'), 'utf8');
for (const s of FORBIDDEN) if (fg.includes(s)) bad.push(`field-guide.html: ${s}`);
if (bad.length) { console.error('SANITIZATION FAILED — private values in output:\n  ' + bad.join('\n  ')); process.exit(1); }

const { made, missing } = convertImages();
console.log(`built ${Object.keys(rendered).length} pages from ${LABS}`);
for (const m of MISSIONS) console.log(`  ${m.present ? '✓' : '·'} mission ${m.n} ${m.name}${m.present ? ` — ${m.phases} phases, ${PAGE_TOTALS[m.slug]} checks, ${m.imgCount} images` : ' (not yet written: listed as coming)'}`);
console.log(`images: ${allImages.size} referenced, ${made} converted${missing.length ? `, MISSING: ${missing.join(', ')}` : ''}`);
