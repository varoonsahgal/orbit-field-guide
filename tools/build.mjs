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
// Hand-authored presentation metadata. Any `NN-ORBIT-*.md` in LABS is picked up automatically;
// a number missing here gets a fallback hue. `track: 'foundation'` missions are the optional
// pre-flight track (smaller cards, own section); everything else is the main flight path.
// `soon` is shown only while the mission has no markdown yet; the markdown header always wins.
const REGISTRY = {
  '01': { hue: '#38BDF8', hue2: '#0EA5E9', tag: 'Regions + IAM', module: 'Optional AWS foundations', track: 'foundation', emblem: 'globe',
    skills: ['Regions and Availability Zones', 'Read an IAM policy', 'Trust vs permissions policy', 'Create an execution role', 'Signed API calls from CloudShell'] },
  '02': { hue: '#FB923C', hue2: '#F97316', tag: 'Lambda + CloudWatch', module: 'Optional AWS foundations', track: 'foundation', emblem: 'flame',
    skills: ['Deploy and test a Lambda function', 'Read logs and run Logs Insights', 'Call Bedrock from code', 'Fix AccessDenied with least privilege', 'Tour Cognito and OpenSearch'] },
  '03': { hue: '#A78BFA', hue2: '#8B5CF6', tag: 'Retrieval', module: 'Module 2 · Bedrock fundamentals', track: 'main', emblem: 'key',
    skills: ['Model vs chatbot vs agent', 'Build a managed knowledge base', 'Retrieve before you generate', 'Catch an unsupported answer'] },
  '04': { hue: '#2DD4BF', hue2: '#14B8A6', tag: 'Agent + tools', module: 'Modules 3, 4, 6 · AgentCore', track: 'main', emblem: 'rocket',
    skills: ['Host an agent as a Harness', 'Build a Lambda tool', 'Expose tools through a Gateway (MCP)', 'Debug the permission wall', 'Trace a run in CloudWatch'] },
  '05': { hue: '#34D399', hue2: '#10B981', tag: 'Identity', module: 'Module 5 · Authentication', track: 'main', emblem: 'shield',
    skills: ['OAuth client credentials with Cognito', 'Read and verify a JWT', 'Keep secrets in Secrets Manager', 'JWT-protect an agent', 'Prove five auth outcomes'] },
  '06': { hue: '#F472B6', hue2: '#EC4899', tag: 'Guardrails + evals', module: 'Capstone · Production readiness', track: 'main', emblem: 'radar',
    skills: ['Red-team an unprotected agent', 'Bedrock Guardrails', 'Cedar policy on the gateway', 'Lifecycle-hook action gate', 'Online evaluations and LLM judges'] },
  '07': { hue: '#F87171', hue2: '#EF4444', tag: 'Agent security', module: 'Red team · Attack and defend', track: 'main', emblem: 'breach',
    skills: ['Leaky system-prompt secrets', 'Indirect prompt injection', 'Poisoned tool descriptions', 'Shared-memory poisoning', 'Over-privileged execution roles'],
    soon: { name: 'HULL BREACH', subtitle: 'Build a deliberately insecure agent, breach it five ways, then seal every hole',
      level: 'Red Team', time: '150–180 minutes', env: 'AWS Management Console only',
      story: 'Five breaches, one agent: a secret in the system prompt, a poisoned support ticket that exfiltrates data through an email tool, a third-party tool with a poisoned description, long-term memory shared across users, and an execution role you can reach through the agent\'s shell. Exploit each one, then seal it.' } },
  '08': { hue: '#FBBF24', hue2: '#F59E0B', tag: 'Multi-agent', module: 'Crew operations · Multi-agent systems', track: 'main', emblem: 'crew',
    skills: ['Supervisor and specialist agents', 'Delegation and hand-offs', 'AgentCore Browser tool', 'AgentCore Code Interpreter', 'Human-in-the-loop approval'],
    soon: { name: 'FLIGHT CREW', subtitle: 'A supervisor agent that delegates to specialists, with a human on the approval loop',
      level: 'Mission Commander', time: '150–180 minutes', env: 'AWS Management Console only',
      story: 'One agent is not enough for the job ahead. Build a supervisor that plans the work, hands research to a specialist with the AgentCore Browser and analysis to one with Code Interpreter, and stops for a human to approve anything consequential.' } },
};
const FALLBACK_HUES = [['#818CF8', '#6366F1'], ['#22D3EE', '#06B6D4'], ['#A3E635', '#84CC16'], ['#E879F9', '#D946EF']];
const LEVEL_RANK = { recruit: 1, discovery: 2, builder: 3, 'security engineer': 4, 'flight director': 5, 'red team': 5, 'mission commander': 6 };

const labFiles = fs.readdirSync(LABS);
const found = new Map();
for (const f of labFiles) { const mm = /^(\d{2})-ORBIT-.+\.md$/.exec(f); if (mm && !found.has(mm[1])) found.set(mm[1], f); }
const nums = [...new Set([...Object.keys(REGISTRY), ...found.keys()])].sort();
const MISSIONS = nums.map((n, i) => {
  const r = REGISTRY[n] || {};
  const [fh, fh2] = FALLBACK_HUES[i % FALLBACK_HUES.length];
  const m = { n, slug: 'mission-' + n, hue: r.hue || fh, hue2: r.hue2 || fh2, tag: r.tag || 'Mission', module: r.module || 'ORBIT mission',
    track: r.track || 'main', emblem: r.emblem || 'star', skills: r.skills || [], soonMeta: r.soon || null };
  m.file = found.get(n) || null;
  m.present = !!m.file;
  const nf = path.join(LABS, 'companionguides', n + '-companion.md');
  m.notes = fs.existsSync(nf) ? nf : null;
  return m;
});
const MAIN = MISSIONS.filter(m => m.track !== 'foundation');
const PRE = MISSIONS.filter(m => m.track === 'foundation');

// ── Markdown helpers ────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const slugify = s => strip(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 64) || 'section';
const titleCase = s => s.toLowerCase().replace(/(^|[\s·—-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const dropEmoji = s => s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();

const LANG_LABEL = { python: 'Python', py: 'Python', json: 'JSON', bash: 'Shell', sh: 'Shell', shell: 'Shell', text: 'Text', '': 'Text', sql: 'Logs Insights', cedar: 'Cedar', yaml: 'YAML', js: 'JavaScript', javascript: 'JavaScript', http: 'HTTP' };

// PNG/JPEG pixel size, so <img> carries width/height (no layout shift while lazy images load)
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
    let i = 2; // JPEG: walk segments to SOFn
    while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const t = b[i + 1]; if (t >= 0xc0 && t <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(t)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); }
  } catch {}
  return null;
}
const WEBP_W = 1600;

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
        const lines = text.replace(/\n$/, '').split('\n').length;
        return `<div class="code" data-lines="${lines}"><div class="code-bar"><span class="code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="code-lang">${esc(label)}</span><button class="copy" type="button" aria-label="Copy ${esc(label)} code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Copy</span></button></div><pre><code class="hljs${hl ? ' language-' + hl : ''}">${body}</code></pre></div>\n`;
      },
      image({ href, title, text }) {
        let src = href, dims = '';
        const mm = /^(?:\.\/)?images\/([^)]+)\.(png|jpe?g)$/i.exec(href || '');
        if (mm) {
          images.add(mm[1] + '.' + mm[2]); src = 'img/' + mm[1] + '.webp';
          const sz = imageSize(path.join(LABS, 'images', mm[1] + '.' + mm[2]));
          if (sz) dims = ` width="${WEBP_W}" height="${Math.round(sz[1] * WEBP_W / sz[0])}"`;
        }
        return `<img src="${esc(src)}" alt="${esc(text)}"${dims} loading="lazy" decoding="async"${title ? ` title="${esc(title)}"` : ''}>`;
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
    const cls = /hint/i.test(t) ? 'hint' : /answer|solution|key|reveal|compare|red flags/i.test(t) ? 'answer' : 'plain';
    return `<details class="reveal ${cls}"><summary><span>${sum}</span></summary><div class="reveal-body">${body}</div></details>`;
  });
}

// "**🧩 Investigation checkpoint**" paragraphs + following task list → checkpoint card
function checkpoints(html) {
  html = html.replace(/<p><strong>([^<]*?(?:checkpoint|Checkpoint)[^<]*?)<\/strong><\/p>\s*(<ul>[\s\S]*?<\/ul>)/g,
    (m, title, list) => `<div class="checkpoint"><div class="checkpoint-hd"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>${esc(dropEmoji(strip(title)))}<span class="checkpoint-n" aria-hidden="true"></span></div>${list}</div>`);
  return html;
}

// A paragraph that starts with "**Expected:**" (or "**Expected** (…):") is the success criterion for a step:
// give it a check badge so learners can confirm a step at a glance.
// Two more learning cues: "**What you just proved:**" closes a step (gold box), "**Predict first:**" is an inline pill.
function expects(html) {
  return html
    .replace(/<p>(\s*<strong>Expected(?:[^<]{0,40})?<\/strong>)/g, '<p class="expect">$1')
    .replace(/<p>(\s*<strong>What you just proved:<\/strong>)/g, '<p class="proved">$1')
    .replace(/<strong>Predict first:<\/strong>/g, '<strong class="cue-pill predict">Predict first</strong>');
}

// Task-list checkboxes become persistent, interactive checks
function tasks(html, page) {
  let i = 0;
  return html.replace(/<li>\s*<input (?:checked="" )?disabled="" type="checkbox"(?: checked="")?>\s*([\s\S]*?)<\/li>/g, (m, body) => {
    const id = `${page}:${i++}`;
    return `<li class="task"><input type="checkbox" class="chk" data-k="${id}" aria-label="Mark done"><div class="task-t">${body}</div></li>`;
  });
}

function wrapTables(html) {
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
}
// Screenshots: framed figure, numbered, caption, lightbox affordance
function figures(html, prefix) {
  let k = 0;
  return html.replace(/<p>\s*(<img [^>]+>)\s*<\/p>/g, (m, img) => {
    const alt = (/alt="([^"]*)"/.exec(img) || [])[1] || '';
    const num = `${prefix}.${String(++k).padStart(2, '0')}`;
    return `<figure class="shot" data-fig="${num}"><div class="shot-frame"><div class="shot-bar" aria-hidden="true"><span class="shot-dots"><i></i><i></i><i></i></span><span class="shot-fig">Fig ${num}</span><span class="shot-zoom-hint">Click to enlarge</span></div><button class="zoom" type="button" aria-label="Enlarge screenshot: ${alt}">${img}</button></div>${alt ? `<figcaption><span class="fig-n">Fig ${num}</span>${alt}</figcaption>` : ''}</figure>`;
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
        return `<h2 id="${id}" class="phase-h"><span class="phase-big" aria-hidden="true">${ph[1].padStart(2, '0')}</span><span class="phase-meta"><span class="phase-num">Phase ${ph[1]}</span>${ph[3] ? `<span class="phase-time">${esc(ph[3])}</span>` : ''}</span><span class="phase-title">${esc(ph[2])}</span><a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h2>`;
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
    const mm = /^<h2 id="([^"]+)"( class="([^"]+)")?/.exec(p);
    return mm ? `<section class="sec${mm[3] === 'phase-h' ? ' sec-phase' : mm[3] === 'q-h' ? ' sec-q' : ''}" data-sec="${mm[1]}">${p}</section>` : p;
  }).join('');
  return { html, toc };
}

// Parse the shared header of a lab file
function parseHeader(md) {
  const lines = md.split('\n');
  const out = { brand: '', mission: '', subtitle: '', meta: {}, story: '', skills: [], alongside: [] };
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
  const sk = /\*\*SKILLS:\*\*\s*([^\n]*)/.exec(joined); if (sk) out.skills = sk[1].split(/\s+·\s+/).map(s => s.trim()).filter(Boolean);
  if (!lv && !st && bq.length) out.alongside = bq.filter(Boolean);
  out.rest = lines.slice(i).join('\n');
  return out;
}

const inline = new Marked({ gfm: true });
const md1 = s => inline.parseInline(s || '');

// ── Shared chrome ───────────────────────────────────────────────────────────
const FONTS = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23070B1A'/%3E%3Cellipse cx='32' cy='32' rx='24' ry='9' fill='none' stroke='%2338BDF8' stroke-width='3' transform='rotate(-24 32 32)'/%3E%3Ccircle cx='32' cy='32' r='9' fill='%23F472B6'/%3E%3Ccircle cx='53' cy='22' r='4' fill='%23FDE68A'/%3E%3C/svg%3E";

// Mission patch emblems: line art in a 36×36 box centred on (60,60)
const EMBLEM = {
  globe: '<circle cx="60" cy="58" r="16"/><ellipse cx="60" cy="58" rx="7" ry="16"/><path d="M44 58h32M47 49h26M47 67h26"/>',
  flame: '<path d="M60 40c6 8 13 13 13 23a13 13 0 0 1-26 0c0-6 3-9 6-12 0 5 2 8 5 9-1-8 0-14 2-20z"/><path d="M60 76a6 6 0 0 1-6-6c0-4 3-6 6-10 3 4 6 6 6 10a6 6 0 0 1-6 6z"/>',
  key: '<circle cx="52" cy="52" r="9"/><circle cx="52" cy="52" r="3.2"/><path d="M58.5 58.5 76 76M70 70l-5 5M74 74l-4 4"/>',
  rocket: '<path d="M60 38c8 6 11 15 11 24l-4 8H53l-4-8c0-9 3-18 11-24z"/><circle cx="60" cy="55" r="4"/><path d="M49 62l-6 7 3 5 6-4M71 62l6 7-3 5-6-4M56 74l4 7 4-7"/>',
  shield: '<path d="M60 39l16 6v11c0 11-7 19-16 23-9-4-16-12-16-23V45z"/><circle cx="60" cy="56" r="4"/><path d="M60 60v7"/>',
  radar: '<circle cx="60" cy="58" r="17"/><circle cx="60" cy="58" r="10"/><circle cx="60" cy="58" r="2.4"/><path d="M60 58 72 46"/><path d="m50 61 6 6 13-14" stroke-width="2.8"/>',
  breach: '<path d="M60 39l17 10v19L60 78 43 68V49z"/><path d="M57 40l-3 10 7 5-6 8 5 6-3 8" stroke-width="2.6"/><path d="M66 52l4-2M65 62l5 1"/>',
  crew: '<circle cx="60" cy="44" r="5.5"/><circle cx="45" cy="70" r="5"/><circle cx="75" cy="70" r="5"/><circle cx="60" cy="66" r="3"/><path d="M57 49 47.5 65.5M63 49 72.5 65.5M50 70h20M60 49.5V63"/>',
  star: '<path d="m60 41 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>',
};
let patchSeq = 0;
function patch(m, size = 120, cls = 'patch') {
  const name = (m.name || '').toUpperCase();
  const id = `p${m.n}-${++patchSeq}`;
  return `<svg class="${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="--mc:${m.hue};--mc2:${m.hue2}" data-patch="${m.n}">
<defs><path id="t${id}" d="M17,60 A43,43 0 0,1 103,60"/><path id="b${id}" d="M21,62 A39,39 0 0,0 99,62"/>
<radialGradient id="g${id}" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="${m.hue}" stop-opacity=".55"/><stop offset=".5" stop-color="${m.hue2}" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="r${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m.hue}"/><stop offset="1" stop-color="${m.hue2}"/></linearGradient></defs>
<circle cx="60" cy="60" r="58" class="p-disc"/><circle cx="60" cy="60" r="58" fill="url(#g${id})"/>
<circle cx="60" cy="60" r="55.5" class="p-ring" stroke="url(#r${id})"/><circle cx="60" cy="60" r="34" class="p-ring2"/>
<text class="p-arc"><textPath href="#t${id}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>
<text class="p-arc p-arc-b"><textPath href="#b${id}" startOffset="50%" text-anchor="middle">ORBIT · ${m.n}</textPath></text>
<circle cx="60" cy="60" r="31" class="p-core"/>
<g class="p-emblem">${EMBLEM[m.emblem] || EMBLEM.star}</g>
<ellipse cx="60" cy="61" rx="54" ry="13" class="p-orbit" transform="rotate(-20 60 61)"/>
<circle cx="10.5" cy="76" r="3.8" class="p-sat"/><circle cx="101" cy="37" r="1.8" class="p-star"/><circle cx="25" cy="33" r="1.2" class="p-star"/><circle cx="92" cy="88" r="1.3" class="p-star"/>
</svg>`;
}

const LOGO = `<svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#F472B6"/></linearGradient></defs><circle cx="20" cy="20" r="7.5" fill="url(#lg)"/><ellipse cx="20" cy="20" rx="17" ry="6.2" fill="none" stroke="url(#lg)" stroke-width="1.8" transform="rotate(-24 20 20)"/><circle cx="35" cy="13.4" r="2.4" fill="#FDE68A"/></svg>`;
const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>',
  id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="12" r="2.4"/><path d="M14 10h4M14 14h3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
};

function nav(current) {
  const item = m => `<a class="nav-m${m.present ? '' : ' soon'}${m.track === 'foundation' ? ' pre' : ''}" href="${m.present ? m.slug + '.html' : 'index.html#flight-path'}" data-page="${m.slug}" style="--mc:${m.hue}"${current === m.slug ? ' aria-current="page"' : ''} title="${m.track === 'foundation' ? 'Pre-flight' : 'Mission'} ${m.n} · ${esc(titleCase(m.name || ''))}${m.present ? '' : ' (in preparation)'}"><span class="nav-dot"></span><span class="nav-n">${m.n}</span><span class="nav-name">${esc(titleCase(m.name || ''))}</span><span class="nav-star" aria-hidden="true">★</span></a>`;
  const pre = PRE.length ? `<span class="nav-grp" aria-label="Pre-flight foundations">${PRE.map(item).join('')}</span><span class="nav-sep"></span>` : '';
  return `<header class="topbar"><div class="topbar-in">
  <a class="brand" href="index.html">${LOGO}<span class="brand-t">ORBIT <b>Field Academy</b></span></a>
  <nav class="nav" aria-label="Missions"><span class="nav-lbl">Pre-flight</span>${pre}<span class="nav-lbl">Missions</span>${MAIN.map(item).join('')}<span class="nav-sep"></span><a class="nav-x" href="notes.html"${current?.startsWith('notes') ? ' aria-current="page"' : ''}>Field notes</a><a class="nav-x" href="field-guide.html">Quick ref</a></nav>
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
<dialog class="lightbox" id="lightbox" aria-label="Screenshot viewer"><div class="lb-top"><span class="lb-n"></span><span class="lb-hint">← → to browse · click image for actual size · Esc to close</span><button class="lb-close" type="button" aria-label="Close">×</button></div><button class="lb-nav lb-prev" type="button" aria-label="Previous screenshot">‹</button><div class="lb-stage"><img alt=""></div><button class="lb-nav lb-next" type="button" aria-label="Next screenshot">›</button><p class="lb-cap"></p></dialog>
<dialog class="award" id="award" aria-labelledby="aw-t"><div class="award-in"><canvas class="award-fx" aria-hidden="true"></canvas><div class="award-patch"></div><p class="eyebrow">Mission complete</p><h2 id="aw-t">Patch earned</h2><p class="award-sub"></p><div class="award-actions"><a class="btn primary" data-award-next href="index.html#flight-path">Back to the flight path</a><button class="btn ghost" type="button" data-award-close>Keep reading</button></div></div></dialog>`;

function shell({ id, title, desc, body, hue = '#38BDF8', hue2 = '#0EA5E9', bodyClass = '', extraHead = '' }) {
  return `<!doctype html>
<html lang="en" data-page="${id}" style="--mc:${hue};--mc2:${hue2}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#050816">
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
<script>window.ORBIT_PAGES=${JSON.stringify(PAGE_TOTALS)};window.ORBIT_MISSIONS=${JSON.stringify(MISSIONS.map(m => ({ n: m.n, slug: m.slug, name: titleCase(m.name || ''), hue: m.hue, track: m.track, present: m.present })))};</script>
<script src="assets/site.js" defer></script>
<script type="module" src="assets/diagrams.js"></script>
</body></html>`;
}
const PAGE_TOTALS = {}; // page id → number of checkboxes (filled in as pages are built)

// ── Instrument-panel gauges ────────────────────────────────────────────────
const arcPath = (cx, cy, r, a0, a1) => { // angles in degrees, 0 = left, 180 = right (top semicircle)
  const p = a => [cx - r * Math.cos(a * Math.PI / 180), cy - r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const levelRank = m => LEVEL_RANK[(m.meta?.level || '').toLowerCase()] || Math.min(6, Math.max(1, Number(m.n) - 1));
const timeRange = s => { const t = /(\d+)\s*[–-]\s*(\d+)/.exec(s || ''); if (t) return [+t[1], +t[2]]; const one = /(\d+)/.exec(s || ''); return one ? [+one[1], +one[1]] : null; };
function gaugeLevel(m) {
  const rank = levelRank(m), segs = 6, gap = 4, w = (180 - gap * (segs - 1)) / segs;
  const arcs = Array.from({ length: segs }, (_, i) => `<path d="${arcPath(50, 50, 38, i * (w + gap), i * (w + gap) + w)}" class="${i < rank ? 'on' : ''}"/>`).join('');
  return `<div class="gauge"><svg viewBox="0 0 100 58" aria-hidden="true"><g class="g-seg">${arcs}</g><text x="50" y="50" text-anchor="middle" class="g-big">${rank}<tspan class="g-of">/6</tspan></text></svg><div class="g-lbl"><b>Level</b><span>${md1(m.meta.level || '—')}</span></div></div>`;
}
function gaugeTime(m) {
  const tr = timeRange(m.meta.time), max = Math.max(180, Math.ceil(Math.max(...MISSIONS.map(x => (timeRange(x.meta?.time) || [0, 0])[1])) / 30) * 30);
  if (!tr) return '';
  const a = v => Math.min(180, v / max * 180);
  const mid = (tr[0] + tr[1]) / 2, ang = a(mid) * Math.PI / 180;
  const nx = 50 - 30 * Math.cos(ang), ny = 50 - 30 * Math.sin(ang);
  const ticks = Array.from({ length: max / 30 + 1 }, (_, i) => { const t = i * 30 / max * Math.PI; return `<path d="M${(50 - 42 * Math.cos(t)).toFixed(1)} ${(50 - 42 * Math.sin(t)).toFixed(1)}L${(50 - 46 * Math.cos(t)).toFixed(1)} ${(50 - 46 * Math.sin(t)).toFixed(1)}"/>`; }).join('');
  const short = (m.meta.time || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s*minutes?/, ' min');
  return `<div class="gauge"><svg viewBox="0 0 100 58" aria-hidden="true"><path d="${arcPath(50, 50, 38, 0, 180)}" class="g-track"/><path d="${arcPath(50, 50, 38, a(tr[0]), Math.max(a(tr[1]), a(tr[0]) + 3))}" class="g-band"/><g class="g-ticks">${ticks}</g><path d="M50 50L${nx.toFixed(1)} ${ny.toFixed(1)}" class="g-needle"/><circle cx="50" cy="50" r="3.2" class="g-hub"/></svg><div class="g-lbl"><b>Target time</b><span>${esc(short)}</span></div></div>`;
}
const counter = (n, label, sub) => `<div class="gauge gauge-n"><span class="g-num">${n}</span><div class="g-lbl"><b>${label}</b><span>${sub}</span></div></div>`;
const ring = (slug, size = 64) => `<span class="ring" data-ring="${slug}" style="--s:${size}px"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="ring-bg"/><circle cx="18" cy="18" r="15.5" class="ring-fg" pathLength="100"/></svg><span class="ring-t">0%</span></span>`;

// ── Build mission pages ─────────────────────────────────────────────────────
const allImages = new Set();

for (const m of MISSIONS) {
  m.meta = {}; m.story = ''; m.subtitle = '';
  if (!m.present) {
    const s = m.soonMeta || {};
    m.name = s.name || 'Mission ' + m.n; m.subtitle = s.subtitle || 'In preparation';
    m.meta = { level: s.level, time: s.time, env: s.env }; m.story = s.story || '';
    continue;
  }
  const raw = sanitize(fs.readFileSync(path.join(LABS, m.file), 'utf8'));
  const h = parseHeader(raw);
  m.name = (h.mission.split(/[·—]/)[1] || h.mission).trim() || m.soonMeta?.name || 'Mission ' + m.n;
  m.subtitle = h.subtitle;
  m.meta = h.meta;
  m.story = h.story;
  if (h.skills.length) m.skills = h.skills;
  m.rest = h.rest;
}

for (const m of MISSIONS) {
  if (!m.present) continue;
  const imgs = new Set();
  const marked = makeMarked(imgs);
  let html = marked.parse(m.rest);
  html = alerts(html); html = quotes(html); html = reveals(html); html = checkpoints(html); html = expects(html);
  html = tasks(html, m.slug); html = figures(html, m.n); html = wrapTables(html);
  const { html: secHtml, toc } = sections(html);
  html = secHtml;
  PAGE_TOTALS[m.slug] = (html.match(/class="chk"/g) || []).length;
  imgs.forEach(i => allImages.add(i));
  m.toc = toc;
  m.phases = toc.filter(t => t.kind === 'phase').length;
  m.html = html;
  m.imgCount = imgs.size;
}

function missionPage(m) {
  const vis = MISSIONS.filter(x => x.present);
  const pos = vis.indexOf(m);
  const prev = vis[pos - 1], next = vis[pos + 1];
  const pre = m.track === 'foundation';
  const phases = m.toc.filter(t => t.kind === 'phase');
  const tocHtml = m.toc.map(t => `<li class="toc-${t.kind}"><a href="#${t.id}" data-toc="${t.id}">${t.kind === 'phase' ? `<span class="toc-n">${t.num}</span>` : '<span class="toc-n toc-dot"></span>'}<span class="toc-l">${esc(t.label)}</span><span class="toc-p" aria-hidden="true"></span></a></li>`).join('');
  const notesLink = m.notes ? `<a class="side-link" href="notes-${m.n}.html"><span>Field notes</span>Questions recruits ask about Mission ${m.n} →</a>` : '';
  const stepper = phases.length ? `<nav class="stepper" aria-label="Mission phases" style="--n:${phases.length}"><div class="stepper-in"><div class="stepper-now"><span class="stepper-k">Phase</span><b data-step-now>${esc(phases[0].num)}</b><span class="stepper-of">/ ${phases.length}</span><span class="stepper-t" data-step-title>${esc(phases[0].label)}</span></div><ol class="steps-rail">${phases.map(p => `<li><a href="#${p.id}" data-step="${p.id}" title="Phase ${esc(p.num)} · ${esc(p.label)}${p.time ? ' · ' + esc(p.time) : ''}"><span class="st-dot"><span>${esc(p.num)}</span></span><span class="st-l">${esc(p.label)}</span></a></li>`).join('')}</ol>${ring(m.slug, 34)}</div></nav>` : '';
  const checks = PAGE_TOTALS[m.slug];
  const panel = `<div class="panel">
        ${gaugeLevel(m)}${gaugeTime(m)}
        ${counter(m.phases, 'Phases', phases.length ? `${esc(phases[0].num)}–${esc(phases[phases.length - 1].num)}` : '—')}
        ${counter(checks, 'Checks', 'saved in this browser')}
        ${counter(m.imgCount, 'Screens', 'real console captures')}
        <div class="gauge gauge-ring">${ring(m.slug, 62)}<div class="g-lbl"><b>Progress</b><span data-progress-t="${m.slug}">not started</span></div></div>
      </div>`;
  const firstPhase = phases[0]?.id || m.toc[0]?.id;
  const body = `
<section class="mast space" style="--mc:${m.hue};--mc2:${m.hue2}">
  <canvas class="mast-fx" aria-hidden="true"></canvas>
  <div class="mast-in">
    <div class="mast-patch">${patch(m, 200)}<span class="mast-earned" aria-hidden="true">★ Patch earned</span></div>
    <div class="mast-text">
      <p class="eyebrow">${pre ? 'Pre-flight' : 'Mission'} ${m.n} <span class="eb-sep">/</span> ${esc(m.tag)} <span class="eb-sep">/</span> ${esc(m.module)}</p>
      <h1>${esc(titleCase(m.name))}</h1>
      <p class="sub">${md1(m.subtitle)}</p>
      ${m.story ? `<p class="story"><span class="story-k">The story</span>${md1(m.story)}</p>` : ''}
      ${m.meta.env ? `<p class="env"><span class="env-led" aria-hidden="true"></span><b>Environment</b>${md1(m.meta.env)}<span class="env-r">us-west-2</span></p>` : ''}
      <div class="mast-actions"><a class="btn primary lg" href="#${firstPhase}">Start the mission ${ICON.arrow}</a><button class="btn ghost" type="button" data-print>${ICON.print}Print handout</button>${m.notes ? `<a class="btn ghost" href="notes-${m.n}.html">Field notes</a>` : ''}</div>
    </div>
  </div>
  <div class="mast-panel">${panel}</div>
</section>
${stepper}
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
    <section class="debrief" data-debrief="${m.slug}" style="--mc:${m.hue};--mc2:${m.hue2}">
      <div class="debrief-patch">${patch(m, 132)}</div>
      <div class="debrief-t"><p class="eyebrow">Mission debrief</p><h2 class="debrief-h" data-debrief-h>${checks} checks between you and the ${esc(titleCase(m.name))} patch</h2><p data-debrief-p>Tick every checkpoint above. Your progress is saved in this browser; finish them all to earn the patch.</p></div>
      ${ring(m.slug, 92)}
    </section>
    <nav class="pager" aria-label="Mission navigation">
      ${prev ? `<a class="pg prev" href="${prev.slug}.html" style="--mc:${prev.hue}"><small>← Previous</small><span>${prev.n} · ${esc(titleCase(prev.name))}</span></a>` : '<a class="pg prev" href="index.html"><small>← Back</small><span>Mission control</span></a>'}
      ${next ? `<a class="pg next" href="${next.slug}.html" style="--mc:${next.hue}"><small>Next mission →</small><span>${next.n} · ${esc(titleCase(next.name))}</span></a>` : '<a class="pg next" href="index.html#flight-path"><small>All done →</small><span>Mission control</span></a>'}
    </nav>
  </main>
</div>`;
  return shell({ id: m.slug, title: `${pre ? 'Pre-flight' : 'Mission'} ${m.n} · ${titleCase(m.name)} — ${SITE}`, desc: strip(md1(m.story || m.subtitle)).slice(0, 220), body, hue: m.hue, hue2: m.hue2, bodyClass: 'mission' });
}

// ── Companion field notes ───────────────────────────────────────────────────
function notesPage(m) {
  const raw = sanitize(fs.readFileSync(m.notes, 'utf8'));
  const h = parseHeader(raw);
  const imgs = new Set();
  const marked = makeMarked(imgs);
  let html = marked.parse(h.rest);
  html = alerts(html); html = quotes(html); html = reveals(html); html = checkpoints(html);
  html = tasks(html, 'notes-' + m.n); html = figures(html, 'N' + m.n); html = wrapTables(html);
  const { html: secHtml, toc } = sections(html, { notes: true });
  PAGE_TOTALS['notes-' + m.n] = (secHtml.match(/class="chk"/g) || []).length;
  imgs.forEach(i => allImages.add(i));
  const qs = toc.filter(t => t.kind === 'q').length;
  const tocHtml = toc.map(t => `<li class="toc-${t.kind}"><a href="#${t.id}" data-toc="${t.id}">${t.kind === 'q' ? `<span class="toc-n">${t.num}</span>` : t.kind === 'part' ? '' : '<span class="toc-n toc-dot"></span>'}<span class="toc-l">${esc(t.label)}</span></a></li>`).join('');
  const along = h.alongside.map(l => `<li>${md1(l)}</li>`).join('');
  const body = `
<section class="mast space notes-mast" style="--mc:${m.hue};--mc2:${m.hue2}">
  <canvas class="mast-fx" aria-hidden="true"></canvas>
  <div class="mast-in">
    <div class="mast-patch">${patch(m, 150)}</div>
    <div class="mast-text">
      <p class="eyebrow">Field notes <span class="eb-sep">/</span> Mission ${m.n} companion <span class="eb-sep">/</span> ${qs} questions answered</p>
      <h1>${esc(titleCase(m.name))}<span class="h1-sub">the questions recruits ask</span></h1>
      <p class="sub">${md1(dropEmoji(h.subtitle))}</p>
      ${along ? `<ul class="along">${along}</ul>` : ''}
      <div class="mast-actions"><a class="btn primary" href="${m.slug}.html">Open Mission ${m.n} ${ICON.arrow}</a><button class="btn ghost" type="button" data-print>${ICON.print}Print notes</button></div>
    </div>
  </div>
</section>
<div class="page notes" style="--mc:${m.hue};--mc2:${m.hue2}">
  <aside class="side" aria-label="Questions">
    <div class="side-in">
      <p class="side-h">Questions</p>
      <label class="q-filter"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Filter ${qs} questions…" data-q-filter aria-label="Filter questions"><span class="q-count" data-q-count></span></label>
      <ol class="toc">${tocHtml}</ol>
    </div>
  </aside>
  <main id="main" class="prose" data-page="notes-${m.n}">
    <label class="q-filter q-filter-m"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Filter ${qs} questions…" data-q-filter aria-label="Filter questions"><span class="q-count" data-q-count></span></label>
${secHtml}
    <p class="q-empty" hidden>No question matches that filter.</p>
    <nav class="pager"><a class="pg prev" href="notes.html"><small>← All field notes</small><span>Field notes</span></a><a class="pg next" href="${m.slug}.html" style="--mc:${m.hue}"><small>Back to the mission →</small><span>${m.n} · ${esc(titleCase(m.name))}</span></a></nav>
  </main>
</div>`;
  return shell({ id: 'notes-' + m.n, title: `Field notes · Mission ${m.n} — ${SITE}`, desc: `Companion Q&A for Mission ${m.n}, ${titleCase(m.name)}.`, body, hue: m.hue, hue2: m.hue2, bodyClass: 'notes-page' });
}

// ── Landing page ────────────────────────────────────────────────────────────
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const numWord = n => WORDS[n] || String(n);
const avgMin = m => { const t = timeRange(m.meta?.time); return t ? (t[0] + t[1]) / 2 : 150; };

// Flight path: missions placed on a rising trajectory (positions in % of the figure box)
function flightPath() {
  const N = MAIN.length;
  const pt = t => { // t 0..1 along a gentle S-curve rising left → right
    const x = 8 + t * 84;
    const y = 78 - (Math.sin((t - .5) * Math.PI) * .5 + .5) * 56 - Math.sin(t * Math.PI * 2) * 5;
    return [x, y];
  };
  const pts = MAIN.map((m, i) => pt(N === 1 ? .5 : i / (N - 1)));
  const curve = Array.from({ length: 61 }, (_, k) => pt(-0.09 + k / 60 * 1.16)).map(([x, y], k) => `${k ? 'L' : 'M'}${(x * 10).toFixed(1)} ${(y * 4.6).toFixed(1)}`).join('');
  const nodes = MAIN.map((m, i) => {
    const [x, y] = pts[i];
    const below = y < 50;
    return `<li class="fp-node${m.present ? '' : ' soon'}${below ? ' lbl-below' : ''}" style="--x:${x.toFixed(2)}%;--y:${y.toFixed(2)}%;--mc:${m.hue};--mc2:${m.hue2};--i:${i}">
      <a href="${m.present ? m.slug + '.html' : '#m-' + m.n}" data-page="${m.slug}" aria-label="Mission ${m.n}: ${esc(titleCase(m.name))}${m.present ? '' : ' (in preparation)'}">
        <span class="fp-ring">${ring(m.slug, 96)}${patch(m, 76, 'patch fp-patch')}</span>
        <span class="fp-lbl"><span class="fp-k">Mission ${m.n}${m.present ? '' : ' · soon'}</span><b>${esc(titleCase(m.name))}</b><span class="fp-tag">${esc(m.tag)}</span></span>
      </a></li>`;
  }).join('');
  const pads = PRE.map(m => `<a class="fp-pad" href="${m.present ? m.slug + '.html' : '#preflight'}" data-page="${m.slug}" style="--mc:${m.hue}"><span class="fp-pad-n">${m.n}</span><span>${esc(titleCase(m.name))}</span></a>`).join('');
  return `<div class="fp">
    <svg class="fp-svg" viewBox="0 0 1000 460" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fpg" x1="0" x2="1"><stop offset="0" stop-color="#38BDF8"/>${MAIN.map((m, i) => `<stop offset="${(.06 + i / Math.max(1, N - 1) * .88).toFixed(2)}" stop-color="${m.hue}"/>`).join('')}</linearGradient></defs>
      <path d="${curve}" class="fp-glow"/><path d="${curve}" class="fp-line"/><path d="${curve}" class="fp-dash"/></svg>
    <div class="fp-launch"><span class="fp-launch-k">Launch pad · optional pre-flight</span><div class="fp-pads">${pads}</div></div>
    <ol class="fp-nodes">${nodes}</ol>
  </div>`;
}

function missionCard(m, i) {
  const t = (m.meta?.time || '').replace(/\s*\(.*\)\s*$/, '');
  return `<li class="mcard${m.present ? '' : ' soon'}" id="m-${m.n}" style="--mc:${m.hue};--mc2:${m.hue2};--i:${i}">
    <a href="${m.present ? m.slug + '.html' : '#m-' + m.n}" class="mcard-in" data-page="${m.slug}"${m.present ? '' : ' aria-disabled="true"'}>
      <div class="mcard-top">${patch(m, 104, 'patch mc-patch')}<div class="mcard-h"><p class="mcard-k">Mission ${m.n}${m.meta?.level ? ' · ' + esc(m.meta.level) : ''}</p><h3>${esc(titleCase(m.name))}</h3><span class="mcard-tag">${esc(m.tag)}</span></div></div>
      <p class="mcard-sub">${md1(m.subtitle)}</p>
      <ul class="mcard-skills">${m.skills.slice(0, 5).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="mcard-meta">${t ? `<span>${ICON.clock}${esc(t)}</span>` : ''}${m.present ? `<span>${ICON.layers}${m.phases} phases</span><span>${PAGE_TOTALS[m.slug]} checks</span>` : ''}${m.present ? '' : '<span class="soon-badge">In preparation</span>'}</div>
      <div class="mcard-foot"><span class="mcard-go" aria-hidden="true">${m.present ? 'Open mission ' + ICON.arrow : 'Coming soon'}</span>${m.present ? ring(m.slug, 46) : ''}</div>
      <span class="mcard-star" aria-label="Patch earned">★</span>
    </a></li>`;
}

function skillMap() {
  const cols = MAIN.map((m, ci) => `<li class="sk-col" style="--mc:${m.hue};--mc2:${m.hue2};--i:${ci}" data-skills="${m.slug}">
      <div class="sk-hd"><span class="sk-n">${m.n}</span><b>${esc(titleCase(m.name))}</b></div>
      <ol class="sk-list">${m.skills.map((s, k) => `<li data-k="${k}" data-of="${m.skills.length}"><span class="sk-star" aria-hidden="true"></span>${esc(s)}</li>`).join('')}</ol>
    </li>`).join('');
  const total = MAIN.reduce((a, m) => a + m.skills.length, 0);
  return `<div class="skills"><div class="sk-sum"><span class="sk-sum-n" data-skills-lit>0</span><span>of ${total} skills lit</span></div><ol class="sk-grid">${cols}</ol></div>`;
}

function landing() {
  const mainH = Math.round(MAIN.reduce((a, m) => a + avgMin(m), 0) / 60);
  const presentMain = MAIN.filter(m => m.present).length;
  const flagship = MAIN.slice(0, 6);
  const preCards = PRE.map(m => `<li class="pcard" style="--mc:${m.hue};--mc2:${m.hue2}"><a href="${m.present ? m.slug + '.html' : '#preflight'}" data-page="${m.slug}">${patch(m, 58, 'patch pc-patch')}<span class="pcard-t"><span class="pcard-k">Pre-flight ${m.n} · ${esc(m.tag)}</span><b>${esc(titleCase(m.name))}</b><span class="pcard-s">${md1(m.subtitle)}</span></span><span class="pcard-r">${m.present ? ring(m.slug, 40) : ''}<span class="pcard-time">${esc((m.meta?.time || '').replace(/\s*\(.*\)\s*$/, ''))}</span></span></a></li>`).join('');
  const notes = MISSIONS.filter(m => m.notes).map(m => `<a class="note-card" href="notes-${m.n}.html" style="--mc:${m.hue};--mc2:${m.hue2}">${patch(m, 52, 'patch nc-patch')}<span><b>${esc(titleCase(m.name))}</b><small>Mission ${m.n} · companion Q&amp;A</small></span></a>`).join('');
  const shelf = MAIN.map(m => `<span class="shelf-p" data-shelf="${m.slug}" title="Mission ${m.n} · ${esc(titleCase(m.name))}">${patch(m, 44, 'patch')}</span>`).join('');
  const body = `
<section class="hero space">
  <canvas class="hero-fx" aria-hidden="true" data-sats='${JSON.stringify(MAIN.map(m => m.hue))}'></canvas>
  <div class="hero-in">
    <div class="hero-copy">
      <p class="eyebrow"><span class="live-dot" aria-hidden="true"></span>AWS Agentic AI microcredential <span class="eb-sep">/</span> Amazon Bedrock AgentCore</p>
      <h1 class="hero-h">Build an AI agent <em>you would trust</em> with a customer. <span class="hero-h2">Then break into it.</span></h1>
      <p class="hero-lede">${numWord(MAIN.length)} hands-on missions in the real AWS Console. Give a model a knowledge base and tools, put an identity perimeter around it, make it production-grade, attack it the way an adversary would, and finish by commanding a crew of agents. No installs. Real AWS, real errors, real fixes.</p>
      <div class="hero-actions"><a class="btn primary lg" href="#flight-path">View the flight path ${ICON.arrow}</a><button class="btn ghost lg" type="button" data-open-id>${ICON.id}Set your mission ID</button></div>
    </div>
    <aside class="console" aria-label="Your mission status">
      <div class="console-hd"><span>Mission control</span><span class="console-led">Live</span></div>
      <div class="console-row"><span class="console-k">Recruit ID</span><button class="console-id" type="button" data-open-id><span data-myid-label>not set</span></button></div>
      <div class="console-row"><span class="console-k">Patches</span><span class="console-v"><b data-patches-n>0</b> / ${MAIN.length}</span></div>
      <div class="shelf">${shelf}</div>
      <a class="console-next" href="#flight-path" data-next-mission><span class="console-k">Next up</span><b>Choose your first mission</b>${ICON.arrow}</a>
    </aside>
  </div>
  <dl class="facts">
    <div><dt>${MAIN.length}</dt><dd>core missions, each building on the last</dd></div>
    <div><dt>~${mainH} h</dt><dd>guided, hands-on console work</dd></div>
    <div><dt>${PRE.length}</dt><dd>optional pre-flight missions for AWS newcomers</dd></div>
    <div><dt>&lt;$1</dt><dd>per participant, end to end</dd></div>
  </dl>
</section>

<main id="main" class="home">
  <section class="band" id="flight-path">
    <div class="band-hd"><p class="eyebrow">The flight path</p><h2>${numWord(MAIN.length)} missions, one agent, rising stakes</h2><p>Each ring fills as you tick checkpoints on a mission page; your progress lives in this browser. Finish every check and the mission patch is yours.</p></div>
    ${flightPath()}
  </section>

  <section class="band" id="missions">
    <ol class="mgrid">${flagship.map(missionCard).join('')}</ol>
    ${MAIN.length > 6 ? `<ol class="mgrid">${MAIN.slice(6).map((m, i) => missionCard(m, i + 6)).join('')}</ol>` : ''}
  </section>

  ${PRE.length ? `<section class="band preflight" id="preflight">
    <div class="pre-hd"><div><p class="eyebrow">Pre-flight · optional foundations</p><h2>New to AWS? Start on the launch pad.</h2></div><p>Two shorter missions on Regions, IAM, Lambda and CloudWatch. Skip them if you already work in AWS; Mission 03 assumes nothing beyond a console sign-in.</p></div>
    <ol class="pgrid">${preCards}</ol>
  </section>` : ''}

  <section class="band" id="skills">
    <div class="band-hd"><p class="eyebrow">Skills you earn</p><h2>A constellation of production skills</h2><p>Every star is a skill you practise on a real AWS resource. Stars light up as your checkpoints do.</p></div>
    ${skillMap()}
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
    <div class="note-grid">${notes}<a class="note-card ref" href="field-guide.html" style="--mc:#FDE68A;--mc2:#FBBF24"><span class="note-n">★</span><span><b>Quick reference</b><small>One-page field guide</small></span></a></div>
  </section>
</main>`;
  return shell({ id: 'home', title: `${SITE} — hands-on Amazon Bedrock AgentCore labs`, desc: `${MAIN.length} AWS Console missions: knowledge bases, an AgentCore agent with tools, a JWT perimeter, guardrails, policy and evaluations, agent red-teaming and a multi-agent crew. Plus optional pre-flight missions on IAM and Lambda.`, body, bodyClass: 'home-page' });
}

function notesIndex() {
  const cards = MISSIONS.filter(m => m.notes).map((m, i) => `<li class="mcard" style="--mc:${m.hue};--mc2:${m.hue2};--i:${i}"><a class="mcard-in" href="notes-${m.n}.html"><div class="mcard-top">${patch(m, 96, 'patch mc-patch')}<div class="mcard-h"><p class="mcard-k">Mission ${m.n} companion</p><h3>${esc(titleCase(m.name))}</h3></div></div><p class="mcard-sub">${md1(m.subtitle)}</p><span class="mcard-go" aria-hidden="true">Read the notes ${ICON.arrow}</span></a></li>`).join('');
  const body = `<section class="mast space slim"><canvas class="mast-fx" aria-hidden="true"></canvas><div class="mast-in"><div class="mast-text"><p class="eyebrow">Field notes</p><h1>Questions recruits ask</h1><p class="sub">Read these alongside a mission when the console shows you a word you have never seen. Each note answers one question in plain language, with the AWS term in bold.</p></div></div></section>
<main id="main" class="home"><section class="band"><ol class="mgrid">${cards}</ol></section></main>`;
  return shell({ id: 'notes', title: `Field notes — ${SITE}`, desc: 'Companion Q&A for the ORBIT missions.', body, bodyClass: 'home-page' });
}

const ARCH_SVG = `<svg viewBox="0 0 1100 540" role="img" aria-labelledby="arch-t arch-d" class="arch-svg">
<title id="arch-t">ORBIT agent architecture</title><desc id="arch-d">A caller obtains a JWT from Amazon Cognito and invokes the AgentCore harness. The harness runs Claude Haiku through a Bedrock guardrail, calls tools through AgentCore Gateway where a Cedar policy engine decides each call, and the gateway invokes a Lambda order tool and the knowledge base. Lifecycle hooks, observability and online evaluations surround the agent. In Mission 07 every arrow becomes an attack surface to exploit and seal; in Mission 08 a supervisor agent delegates to specialist agents with Browser and Code Interpreter tools, with a human approving consequential actions.</desc>
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="a-head"/></marker>
</defs>
<g class="a-ring"><rect x="290" y="40" width="520" height="440" rx="34"/></g>
<text x="550" y="70" class="a-cap" text-anchor="middle">Amazon Bedrock AgentCore</text>
<g class="a-breach"><rect x="282" y="32" width="536" height="456" rx="40"/><text x="550" y="508" text-anchor="middle">M07 · red team: every arrow is an attack surface</text></g>
<g class="a-node" style="--c:#FBBF24"><rect x="30" y="56" width="200" height="110" rx="18"/><text x="130" y="94" text-anchor="middle" class="a-t">Supervisor + crew</text><text x="130" y="118" text-anchor="middle" class="a-s">Browser · Code Interpreter</text><text x="130" y="140" text-anchor="middle" class="a-s">human approval · M08</text></g>
<g class="a-node" style="--c:#34D399"><rect x="30" y="200" width="200" height="110" rx="18"/><text x="130" y="238" text-anchor="middle" class="a-t">Caller app</text><text x="130" y="262" text-anchor="middle" class="a-s">Bearer JWT · M05</text><text x="130" y="284" text-anchor="middle" class="a-s">or IAM · M04</text></g>
<g class="a-node" style="--c:#34D399"><rect x="30" y="360" width="200" height="90" rx="18"/><text x="130" y="398" text-anchor="middle" class="a-t">Amazon Cognito</text><text x="130" y="422" text-anchor="middle" class="a-s">issues tokens · M02 M05</text></g>
<g class="a-node hero-node" style="--c:#2DD4BF"><rect x="340" y="190" width="200" height="130" rx="20"/><text x="440" y="232" text-anchor="middle" class="a-t">Harness</text><text x="440" y="256" text-anchor="middle" class="a-s">managed agent loop</text><text x="440" y="278" text-anchor="middle" class="a-s">limits · allowed tools</text><text x="440" y="300" text-anchor="middle" class="a-s">M04 M06</text></g>
<g class="a-node" style="--c:#F472B6"><rect x="340" y="96" width="200" height="66" rx="16"/><text x="440" y="124" text-anchor="middle" class="a-t">Guardrail</text><text x="440" y="146" text-anchor="middle" class="a-s">prompt attacks · PII · topics</text></g>
<g class="a-node" style="--c:#A78BFA"><rect x="340" y="360" width="200" height="90" rx="18"/><text x="440" y="398" text-anchor="middle" class="a-t">Claude Haiku 4.5</text><text x="440" y="422" text-anchor="middle" class="a-s">Amazon Bedrock · M02 M03</text></g>
<g class="a-node" style="--c:#F472B6"><rect x="600" y="96" width="180" height="66" rx="16"/><text x="690" y="124" text-anchor="middle" class="a-t">Lifecycle hooks</text><text x="690" y="146" text-anchor="middle" class="a-s">action gate · M06</text></g>
<g class="a-node" style="--c:#2DD4BF"><rect x="600" y="190" width="180" height="130" rx="20"/><text x="690" y="232" text-anchor="middle" class="a-t">Gateway</text><text x="690" y="256" text-anchor="middle" class="a-s">MCP tools · M04</text><text x="690" y="284" text-anchor="middle" class="a-s a-pol">Cedar policy · M06</text></g>
<g class="a-node" style="--c:#A78BFA"><rect x="600" y="360" width="180" height="90" rx="18"/><text x="690" y="398" text-anchor="middle" class="a-t">Knowledge base</text><text x="690" y="422" text-anchor="middle" class="a-s">policy evidence · M03</text></g>
<g class="a-node" style="--c:#FB923C"><rect x="870" y="190" width="200" height="110" rx="18"/><text x="970" y="228" text-anchor="middle" class="a-t">Lambda tools</text><text x="970" y="252" text-anchor="middle" class="a-s">lookup_order · issue_refund</text><text x="970" y="276" text-anchor="middle" class="a-s">M02 M04 M06</text></g>
<g class="a-node" style="--c:#38BDF8"><rect x="870" y="360" width="200" height="120" rx="18"/><text x="970" y="396" text-anchor="middle" class="a-t">Observe + evaluate</text><text x="970" y="420" text-anchor="middle" class="a-s">traces · Logs Insights</text><text x="970" y="442" text-anchor="middle" class="a-s">LLM judges · alarms</text><text x="970" y="464" text-anchor="middle" class="a-s">M02 M06</text></g>
<g class="a-node" style="--c:#38BDF8"><rect x="870" y="70" width="200" height="90" rx="18"/><text x="970" y="106" text-anchor="middle" class="a-t">IAM roles</text><text x="970" y="130" text-anchor="middle" class="a-s">one per principal · M01</text></g>
<g class="a-edges">
<path d="M230 255H340" marker-end="url(#ah)" class="flow"/><path d="M130 360V310" marker-end="url(#ah)"/>
<path d="M230 120C290 120 300 200 340 220" marker-end="url(#ah)" class="dash"/>
<path d="M440 190V162" marker-end="url(#ah)"/><path d="M440 320V360" marker-end="url(#ah)" class="flow"/>
<path d="M540 255H600" marker-end="url(#ah)" class="flow"/><path d="M540 215C570 180 590 150 600 140" marker-end="url(#ah)"/>
<path d="M690 320V360" marker-end="url(#ah)"/><path d="M780 245H870" marker-end="url(#ah)" class="flow"/>
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
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', String(WEBP_W), '0', src, '-o', out]);
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
// Notes pages add to PAGE_TOTALS/images, so render them first; then every shell embeds complete totals.
for (const m of MISSIONS) if (m.notes) notesPage(m);
const rendered = {};
for (const m of MISSIONS) if (m.present) rendered[m.slug + '.html'] = missionPage(m);
for (const m of MISSIONS) if (m.notes) rendered[`notes-${m.n}.html`] = notesPage(m);
rendered['index.html'] = landing();
rendered['notes.html'] = notesIndex();

// Sanitization gate: check every page (and the hand-written field guide) BEFORE writing anything.
const bad = [];
for (const [f, html] of Object.entries(rendered)) for (const s of FORBIDDEN) if (html.includes(s)) bad.push(`${f}: ${s}`);
const fg = fs.readFileSync(path.join(ROOT, 'field-guide.html'), 'utf8');
for (const s of FORBIDDEN) if (fg.includes(s)) bad.push(`field-guide.html: ${s}`);
if (bad.length) { console.error('SANITIZATION FAILED — private values in output (nothing written):\n  ' + bad.join('\n  ')); process.exit(1); }
for (const [f, html] of Object.entries(rendered)) fs.writeFileSync(path.join(ROOT, f), html);
// A mission page whose markdown has gone away must not linger on the site.
for (const f of fs.readdirSync(ROOT)) if (/^(mission-\d{2}|notes-\d{2})\.html$/.test(f) && !rendered[f]) { fs.unlinkSync(path.join(ROOT, f)); console.log(`  removed stale ${f}`); }

const { made, missing } = convertImages();
console.log(`built ${Object.keys(rendered).length} pages from ${LABS}`);
for (const m of MISSIONS) console.log(`  ${m.present ? '✓' : '·'} ${m.track === 'foundation' ? 'pre-flight' : 'mission   '} ${m.n} ${m.name}${m.present ? ` — ${m.phases} phases, ${PAGE_TOTALS[m.slug]} checks, ${m.imgCount} images` : ' (no markdown yet: listed as in preparation)'}`);
console.log(`images: ${allImages.size} referenced, ${made} converted${missing.length ? `, MISSING: ${missing.join(', ')}` : ''}`);
if (missing.length) { console.warn(`WARNING: ${missing.length} referenced image(s) missing from ${path.join(LABS, 'images')}; those figures will be broken on the site.`); if (process.env.STRICT_IMAGES) process.exitCode = 1; }
