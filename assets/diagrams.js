// Mermaid diagrams, themed to match the site and re-rendered on theme or ID change.
const blocks = [...document.querySelectorAll('pre.mermaid')];
if (blocks.length) {
  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
  const vars = dark => dark ? {
    background: 'transparent', primaryColor: '#111A3A', primaryBorderColor: '#38BDF8', primaryTextColor: '#E8ECF8',
    secondaryColor: '#1A1F45', tertiaryColor: '#0D1430', lineColor: '#7C89AD', textColor: '#E8ECF8',
    mainBkg: '#111A3A', nodeBorder: '#38BDF8', clusterBkg: 'rgba(148,163,255,.06)', clusterBorder: '#3B4670',
    actorBkg: '#111A3A', actorBorder: '#38BDF8', actorTextColor: '#E8ECF8', signalColor: '#9AA6C3', signalTextColor: '#E8ECF8',
    noteBkgColor: '#2A2347', noteTextColor: '#F5EEFF', noteBorderColor: '#A78BFA', labelBoxBkgColor: '#111A3A', edgeLabelBackground: '#0D1430',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: '15px',
  } : {
    background: 'transparent', primaryColor: '#EAF6FF', primaryBorderColor: '#0EA5E9', primaryTextColor: '#0B1020',
    secondaryColor: '#F3EEFF', tertiaryColor: '#FFFFFF', lineColor: '#64748B', textColor: '#0B1020',
    clusterBkg: '#F7F7F2', clusterBorder: '#CBD5E1', noteBkgColor: '#FFF7D6', noteBorderColor: '#E8C657', edgeLabelBackground: '#FFFFFF',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: '15px',
  };
  const personalize = s => {
    const { id, acct } = (window.ORBIT_ID && window.ORBIT_ID()) || {};
    if (id) s = s.replaceAll('MY_ID', id);
    if (acct) s = s.replaceAll('111122223333', acct);
    return s;
  };
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  let n = 0;
  async function render() {
    const dark = document.documentElement.dataset.theme !== 'light';
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base', themeVariables: vars(dark), flowchart: { curve: 'basis', htmlLabels: true }, sequence: { mirrorActors: false } });
    for (const el of blocks) {
      const src = personalize(el.dataset.src);
      try {
        const { svg } = await mermaid.render('mmd-' + (n++), src);
        el.innerHTML = svg; el.dataset.processed = '1';
        const sv = el.querySelector('svg'), vw = sv?.viewBox?.baseVal?.width; if (vw) sv.style.minWidth = Math.min(vw, 680) + 'px';
        const fig = el.closest('figure'); if (fig && fig.scrollWidth > fig.clientWidth) fig.scrollLeft = (fig.scrollWidth - fig.clientWidth) / 2;
      } catch (e) { el.textContent = src; el.dataset.processed = '1'; el.classList.add('mermaid-err'); }
    }
  }
  await render();
  document.addEventListener('orbit:theme', render);
  document.addEventListener('orbit:id', render);
}
