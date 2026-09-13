/**
 * Browser side of /tools/: reads the panel, calls the tool, draws the result.
 *
 * Every renderer returns { node, copy, status } so the page has one code path
 * for showing output, one for the copy button and one for errors.
 */
import { TOOLS, DEFAULT_TOOL } from './tool-registry';

  const byId = new Map(TOOLS.map((t) => [t.id, t]));

  /* ------------------------------------------------------------ renderers */

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };

  const EPOCH_KEYS = new Set(['exp', 'iat', 'nbf', 'auth_time', 'updated_at']);

  function scalar(value) {
    if (typeof value === 'string') return el('span', 'tp-str', JSON.stringify(value));
    if (typeof value === 'number') return el('span', 'tp-num', String(value));
    if (typeof value === 'boolean') return el('span', 'tp-bool', String(value));
    return el('span', 'tp-null', 'null');
  }

  // One row per key. Objects and arrays become <details>, so folding is the
  // browser's job and there is no open/closed state to keep anywhere.
  function jsonNode(key, value, path, last) {
    const label = () => {
      const frag = document.createDocumentFragment();
      if (key !== null) {
        const k = el('span', 'tp-key', JSON.stringify(key));
        k.dataset.path = path;
        k.title = `click to copy ${path}`;
        frag.append(k, el('span', 'tp-punc', ': '));
      }
      return frag;
    };
    const comma = last ? '' : ',';

    if (value === null || typeof value !== 'object') {
      const row = el('div', 'tp-row');
      row.append(label(), scalar(value));
      if (comma) row.append(el('span', 'tp-punc', comma));
      if (EPOCH_KEYS.has(key) && typeof value === 'number' && value > 1e8) {
        const ms = value < 1e12 ? value * 1000 : value;
        row.append(el('span', 'tp-note', `   # ${new Date(ms).toISOString()}`));
      }
      return row;
    }

    const arr = Array.isArray(value);
    const entries = arr ? value.map((v, i) => [i, v]) : Object.entries(value);
    const [open, close] = arr ? ['[', ']'] : ['{', '}'];

    if (!entries.length) {
      const row = el('div', 'tp-row');
      row.append(label(), el('span', 'tp-punc', open + close + comma));
      return row;
    }

    const d = el('details');
    d.open = true;
    const sum = el('summary');
    sum.append(label(), el('span', 'tp-punc', open));
    sum.append(el('span', 'tp-fold', ` ${entries.length} ${arr ? 'items' : 'keys'} `));
    sum.append(el('span', 'tp-punc tp-inline-close', close + comma));
    d.append(sum);

    const kids = el('div', 'tp-kids');
    entries.forEach(([k, v], i) => {
      const childPath = arr ? `${path}[${k}]` : `${path}.${k}`;
      kids.append(jsonNode(arr ? null : String(k), v, childPath, i === entries.length - 1));
    });
    d.append(kids, el('div', 'tp-punc tp-close', close + comma));
    return d;
  }

  function renderJson(value) {
    const wrap = el('div');
    const bar = el('div', 'tp-toolbar');
    const expand = el('button', 'tp-btn', 'expand all');
    const collapse = el('button', 'tp-btn', 'collapse all');
    bar.append(expand, collapse);

    const tree = el('div', 'tp-json');
    const root = jsonNode(null, value, '$', true);
    tree.append(root);
    // collapse all leaves the root open, otherwise the whole output collapses to
    // one line and reads as if it disappeared
    const setAll = (open) =>
      tree.querySelectorAll('details').forEach((d) => {
        if (!open && d === root) return;
        d.open = open;
      });
    expand.addEventListener('click', () => setAll(true));
    collapse.addEventListener('click', () => setAll(false));

    // keys carry their own path, so one listener covers the whole tree
    tree.addEventListener('click', (e) => {
      const k = e.target.closest('.tp-key');
      if (!k) return;
      e.preventDefault();
      navigator.clipboard?.writeText(k.dataset.path);
      k.title = 'copied';
    });

    wrap.append(bar, tree);
    const size = Array.isArray(value) ? `${value.length} items` : typeof value === 'object' && value ? `${Object.keys(value).length} keys` : typeof value;
    return { node: wrap, copy: JSON.stringify(value, null, 2), status: `valid json · ${size}` };
  }

  function renderRows(rows) {
    const dl = el('dl', 'tp-rows');
    for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
    return { node: dl, copy: rows.map(([k, v]) => `${k}: ${v}`).join('\n'), status: `${rows.length} values` };
  }

  function renderDiff(parts) {
    const pre = el('pre', 'tp-diff');
    let add = 0;
    let del = 0;
    for (const p of parts) {
      const cls = p.t === '+' ? 'add' : p.t === '-' ? 'del' : 'same';
      if (p.t === '+') add++;
      if (p.t === '-') del++;
      pre.append(el('span', cls, `${p.t} ${p.v}\n`));
    }
    return {
      node: pre,
      copy: parts.map((p) => p.t + ' ' + p.v).join('\n'),
      status: add || del ? `+${add} -${del}` : 'identical',
    };
  }

  function renderJsonDiff(changes) {
    if (!changes.length) return { node: el('p', 'tp-hint', 'no differences.'), copy: '', status: 'identical' };
    const show = (v) => (v === undefined ? '' : JSON.stringify(v));
    const rows = changes.map((c) => [
      `${c.op === 'add' ? '+' : c.op === 'remove' ? '-' : '~'} ${c.path}`,
      c.op === 'change' ? `${show(c.from)}  ->  ${show(c.to)}` : show(c.op === 'add' ? c.to : c.from),
    ]);
    const out = renderRows(rows);
    out.status = `${changes.length} change${changes.length === 1 ? '' : 's'}`;
    return out;
  }

  function renderRegex(text, matches) {
    const wrap = el('div');
    if (!matches.length) {
      wrap.append(el('p', 'tp-hint', text ? 'no matches.' : 'nothing to search yet.'));
      return { node: wrap, copy: '', status: '0 matches' };
    }
    const pre = el('pre');
    let cursor = 0;
    for (const m of matches) {
      if (m.index > cursor) pre.append(document.createTextNode(text.slice(cursor, m.index)));
      pre.append(el('mark', 'tp-hit', m.match || '​'));
      cursor = m.index + m.match.length;
    }
    pre.append(document.createTextNode(text.slice(cursor)));
    wrap.append(pre);

    const withGroups = matches.filter((m) => m.groups.length);
    if (withGroups.length) {
      const rows = matches.slice(0, 50).map((m, i) => [
        `#${i + 1} @${m.index}`,
        m.groups.length ? m.groups.map((g, gi) => `$${gi + 1}=${g === undefined ? '-' : g}`).join('  ') : m.match,
      ]);
      wrap.append(el('p', 'meta-mono mt-3 text-[0.65rem]', 'capture groups'), renderRows(rows).node);
    }
    return {
      node: wrap,
      copy: matches.map((m) => m.match).join('\n'),
      status: `${matches.length} match${matches.length === 1 ? '' : 'es'}`,
    };
  }

  function renderJwt(res) {
    const wrap = el('div');
    for (const part of ['header', 'payload']) {
      wrap.append(el('p', 'meta-mono text-[0.65rem]', part));
      const r = renderJson(res[part]);
      r.node.classList.add('mb-3');
      wrap.append(r.node);
    }
    wrap.append(el('p', 'meta-mono text-[0.65rem]', 'signature'));
    wrap.append(el('pre', 'tp-hint', res.signature || '(none)'));
    wrap.append(el('p', 'tp-hint mt-2', 'Decoded only. This page cannot tell you whether the signature is valid.'));
    const alg = res.header?.alg ?? '?';
    return { node: wrap, copy: JSON.stringify(res, null, 2), status: `alg ${alg}` };
  }

  function renderHidden(res) {
    const notes = [];
    if (!res.nfc) notes.push('not NFC normalized: some characters are stored decomposed');
    for (const m of res.mixed.slice(0, 10)) {
      notes.push(`"${m.word}" mixes ${m.scripts.join(' + ')} letters`);
    }
    if (res.mixed.length > 10) notes.push(`and ${res.mixed.length - 10} more mixed-script words`);

    if (!res.findings.length && !notes.length) {
      return {
        node: el('p', 'tp-hint', res.text ? 'nothing hidden found.' : 'nothing to scan yet.'),
        copy: '',
        status: 'clean',
      };
    }

    const wrap = el('div');
    if (res.findings.length) {
      wrap.append(renderRows(Object.entries(res.counts).map(([k, v]) => [k, String(v)])).node);
    }
    for (const n of notes) wrap.append(el('p', 'tp-warnline', n));

    // the text again, with every hidden character swapped for a visible token
    if (res.findings.length) {
      wrap.append(el('p', 'meta-mono mt-3 text-[0.65rem]', 'in place'));
      const flagged = new Map(res.findings.map((f) => [f.at, f]));
      const pre = el('pre', 'tp-marked');
      let buf = '';
      for (let i = 0; i < res.text.length; ) {
        const cp = res.text.codePointAt(i);
        const f = flagged.get(i);
        if (f) {
          if (buf) pre.append(document.createTextNode(buf));
          buf = '';
          const tag = el('span', `tp-ghost tp-ghost-${f.cls}`, f.code);
          tag.title = f.label;
          pre.append(tag);
        } else {
          buf += String.fromCodePoint(cp);
        }
        i += cp > 0xffff ? 2 : 1;
      }
      if (buf) pre.append(document.createTextNode(buf));
      wrap.append(pre);

      const shown = res.findings.slice(0, 200);
      wrap.append(el('p', 'meta-mono mt-3 text-[0.65rem]', 'each one'));
      wrap.append(renderRows(shown.map((f) => [`@${f.at}  ${f.code}`, `${f.label}  (${f.cls})`])).node);
      if (res.findings.length > shown.length) {
        wrap.append(el('p', 'tp-hint', `${res.findings.length - shown.length} more not listed.`));
      }
    }

    const report = [
      ...res.findings.map((f) => `${f.at}\t${f.code}\t${f.label}\t${f.cls}`),
      ...notes,
    ].join('\n');
    return {
      node: wrap,
      copy: report,
      status: res.findings.length
        ? `${res.findings.length} hidden character${res.findings.length === 1 ? '' : 's'}`
        : 'see notes',
    };
  }

  function renderResult(res) {
    if (res.kind === 'json') return renderJson(res.value);
    if (res.kind === 'rows') return renderRows(res.rows);
    if (res.kind === 'diff') return renderDiff(res.parts);
    if (res.kind === 'jsondiff') return renderJsonDiff(res.changes);
    if (res.kind === 'regex') return renderRegex(res.text, res.matches);
    if (res.kind === 'jwt') return renderJwt(res);
    if (res.kind === 'hidden') return renderHidden(res);
    const chars = res.text.length;
    return {
      node: el('pre', null, res.text),
      copy: res.text,
      status: chars ? `${chars} chars` : '',
    };
  }

  /* -------------------------------------------------------------- find bar */

  const HL_ALL = 'tp-find-all';
  const HL_CUR = 'tp-find-cur';
  // Without the Custom Highlight API there is nothing to paint matches with, so
  // ctrl+f is left alone and the browser's own find takes over instead.
  const canHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS;

  // Only one panel is visible at a time, so one search state covers them all.
  let findHits = [];
  let findAt = 0;

  function dropHighlights() {
    if (!canHighlight) return;
    CSS.highlights.delete(HL_ALL);
    CSS.highlights.delete(HL_CUR);
  }

  // Ranges per text node. A match split across two elements is not found, which
  // in practice means a match cannot straddle a JSON key and its value.
  function matchRanges(root, query) {
    const needle = query.toLowerCase();
    if (!needle) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const hay = n.nodeValue.toLowerCase();
      for (let from = 0; ; ) {
        const at = hay.indexOf(needle, from);
        if (at === -1) break;
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + needle.length);
        out.push(r);
        from = at + needle.length;
        if (out.length >= 2000) return out; // ponytail: cap, nobody reads 2000 hits
      }
    }
    return out;
  }

  // A hit inside a folded <details> is invisible until its ancestors are open.
  function reveal(range) {
    const host = range.startContainer.parentElement;
    if (!host) return;
    for (let d = host.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    host.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function runFind(panel, { step = 0, reset = false } = {}) {
    const bar = panel.querySelector('[data-find]');
    const input = bar.querySelector('[data-find-input]');
    const count = bar.querySelector('[data-find-count]');
    const query = input.value;

    findHits = matchRanges(panel.querySelector('[data-out]'), query);
    if (reset) findAt = 0;

    if (!findHits.length) {
      dropHighlights();
      count.textContent = query ? 'no match' : '';
      return;
    }

    findAt = (findAt + step + findHits.length) % findHits.length;
    if (canHighlight) {
      CSS.highlights.set(HL_ALL, new Highlight(...findHits));
      CSS.highlights.set(HL_CUR, new Highlight(findHits[findAt]));
    }
    count.textContent = `${findAt + 1}/${findHits.length}`;
    reveal(findHits[findAt]);
  }

  function resetFind() {
    dropHighlights();
    findHits = [];
    findAt = 0;
    document.querySelectorAll('[data-find]').forEach((bar) => {
      bar.hidden = true;
      bar.querySelector('[data-find-input]').value = '';
      bar.querySelector('[data-find-count]').textContent = '';
    });
  }

  function openFind(panel) {
    const bar = panel.querySelector('[data-find]');
    bar.hidden = false;
    const input = bar.querySelector('[data-find-input]');
    input.focus();
    input.select();
    runFind(panel, { reset: true });
  }

  function closeFind(panel) {
    resetFind();
    panel.querySelector('[data-out]').focus();
  }

  /* ------------------------------------------------------------ saved input */

  const SAVE_PREFIX = 'tp:input:';
  // One oversized paste would eat the ~5MB origin quota and evict every other
  // tool. Restoring a truncated copy would be worse than restoring nothing, so
  // anything past the cap is simply not saved.
  const SAVE_CAP = 100_000;

  function saveState(id) {
    const tool = byId.get(id);
    const panel = panelOf(id);
    if (!tool || !panel || tool.noSave) return;

    const key = SAVE_PREFIX + id;
    const inputs = {};
    let size = 0;
    for (const i of tool.inputs ?? []) {
      const v = panel.querySelector(`[data-input="${i.id}"]`)?.value ?? '';
      inputs[i.id] = v;
      size += v.length;
    }
    const opts = {};
    for (const o of tool.opts ?? []) {
      const f = panel.querySelector(`[data-opt="${o.id}"]`);
      if (f) opts[o.id] = o.type === 'checkbox' ? f.checked : f.value;
    }

    try {
      const blank = (tool.inputs ?? []).length > 0 && size === 0;
      // clearing the box overwrites what was stored, which is how you wipe an
      // entry you would rather not leave behind
      if (blank && !localStorage.getItem(key)) return;
      if (size > SAVE_CAP) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ inputs, opts }));
    } catch {
      // quota or a blocked store: drop this tool's entry rather than half-save
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing left to try */
      }
    }
  }

  function restoreState() {
    for (const tool of TOOLS) {
      if (tool.noSave) continue;
      const panel = panelOf(tool.id);
      if (!panel) continue;

      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(SAVE_PREFIX + tool.id) ?? 'null');
      } catch {
        saved = null;
      }
      if (!saved || typeof saved !== 'object') continue;

      for (const i of tool.inputs ?? []) {
        const f = panel.querySelector(`[data-input="${i.id}"]`);
        const v = saved.inputs?.[i.id];
        if (f && typeof v === 'string') f.value = v;
      }
      for (const o of tool.opts ?? []) {
        const f = panel.querySelector(`[data-opt="${o.id}"]`);
        const v = saved.opts?.[o.id];
        if (!f || v === undefined) continue;
        if (o.type === 'checkbox') f.checked = !!v;
        // a stored choice can outlive the option that produced it
        else if (o.type === 'select') {
          if ([...f.options].some((op) => op.value === String(v))) f.value = String(v);
        } else f.value = String(v);
      }
    }
  }

  /* --------------------------------------------------------------- bookmarks */

  const PIN_KEY = 'tp:pinned';

  // localStorage throws outright in some privacy modes, so every access is
  // wrapped and a failure just means pinning does not persist.
  function readPins() {
    try {
      const raw = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((id) => byId.has(id)) : [];
    } catch {
      return [];
    }
  }

  function writePins(ids) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(ids));
    } catch {
      /* nothing to do: the pin still applies for this page view */
    }
  }

  // Back to its own group, at the index it was rendered in, so unpinning
  // restores the original order instead of dumping the item at the end.
  function placeInGroup(li) {
    const list = document.querySelector(`[data-group-list="${li.dataset.group}"]`);
    if (!list) return;
    const order = Number(li.dataset.order);
    const after = [...list.children].find((x) => Number(x.dataset.order) > order);
    list.insertBefore(li, after ?? null);
  }

  // Sidebar items are moved, not copied: one <li> per tool keeps the filter,
  // the active marker and the keyboard order all working unchanged.
  function applyPins() {
    const group = document.getElementById('tp-pinned');
    const list = group?.querySelector('ul');
    if (!list) return;
    const pinned = readPins();

    for (const id of pinned) {
      const li = document.querySelector(`.tp-item[data-id="${id}"]`);
      if (li) list.append(li); // pinned order is the order they were added
    }
    for (const li of [...list.children]) {
      if (!pinned.includes(li.dataset.id)) placeInGroup(li);
    }
    group.hidden = list.children.length === 0;

    for (const btn of document.querySelectorAll('[data-pin]')) {
      const on = pinned.includes(btn.dataset.pin);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '\u2605' : '\u2606';
    }
    filterNav(); // a group can end up empty once its items are pinned away
  }

  function togglePin(id) {
    const pinned = readPins();
    const at = pinned.indexOf(id);
    if (at === -1) pinned.push(id);
    else pinned.splice(at, 1);
    writePins(pinned);
    const hadFocus = document.activeElement?.dataset?.pin === id;
    applyPins();
    // applyPins moves the row to another list, which can drop focus in some
    // browsers: put it back so the star stays keyboard-reachable
    if (hadFocus) document.querySelector(`[data-pin="${id}"]`)?.focus();
  }

  /* ----------------------------------------------------------------- wiring */

  // Every lookup happens at event time. ClientRouter replaces the body but not
  // the document, so document-level listeners outlive a navigation: they are
  // registered once, at module scope, and must never capture page elements.
  const panelOf = (id) => document.querySelector(`[data-panel="${id}"]`);

  function readOpts(panel, tool) {
    const o = {};
    for (const def of tool.opts ?? []) {
      const f = panel.querySelector(`[data-opt="${def.id}"]`);
      o[def.id] = def.type === 'checkbox' ? f.checked : f.value;
    }
    if (o.sort === 'none') o.sort = null;
    return o;
  }

  async function compute(id) {
    const tool = byId.get(id);
    const panel = panelOf(id);
    const out = panel.querySelector('[data-out]');
    const status = panel.querySelector('[data-status]');
    const values = {};
    for (const i of tool.inputs ?? []) {
      values[i.id] = panel.querySelector(`[data-input="${i.id}"]`).value;
    }
    const blank = !tool.noInput && Object.values(values).every((v) => v.trim() === '');

    if (blank) {
      out.replaceChildren(el('p', 'tp-hint', 'waiting for input.'));
      out.dataset.payload = '';
      status.textContent = '';
      return;
    }

    try {
      const res = await tool.run(values, readOpts(panel, tool));
      const { node, copy, status: label } = renderResult(res);
      out.replaceChildren(node);
      out.dataset.payload = copy;
      status.textContent = label ? `· ${label}` : '';
      status.className = 'normal-case tracking-normal';
    } catch (err) {
      out.replaceChildren(el('pre', 'tp-err', String(err?.message || err)));
      out.dataset.payload = '';
      status.textContent = '· error';
      status.className = 'tp-err normal-case tracking-normal';
    }
  }

  // rendering replaces the output, so a live search has to be redone against
  // the new nodes: the ranges it was holding point at nodes that are gone
  async function run(id) {
    if (!panelOf(id)) return;
    saveState(id);
    await compute(id);
    const bar = panelOf(id)?.querySelector('[data-find]');
    if (bar && !bar.hidden) runFind(panelOf(id), { reset: true });
  }

  let timer;
  const runSoon = (id) => {
    clearTimeout(timer);
    timer = setTimeout(() => run(id), 90);
  };

  function select(id, { focus = false, push = true } = {}) {
    if (!byId.has(id)) id = DEFAULT_TOOL;
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== id;
    for (const b of document.querySelectorAll('[data-select]')) {
      b.setAttribute('aria-current', String(b.dataset.select === id));
    }
    if (push && location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
    resetFind();
    if (focus) panelOf(id)?.querySelector('[data-input]')?.focus();
    run(id);
  }

  function filterNav() {
    const search = document.getElementById('tp-search');
    const nav = document.getElementById('tp-nav');
    if (!search || !nav) return;
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    nav.querySelectorAll('.tp-item').forEach((li) => {
      const match = !q || li.dataset.name.toLowerCase().includes(q);
      li.hidden = !match;
      if (match) shown++;
    });
    nav.querySelectorAll('.tp-group').forEach((g) => {
      g.hidden = ![...g.querySelectorAll('.tp-item')].some((li) => !li.hidden);
    });
    document.getElementById('tp-empty')?.classList.toggle('hidden', shown > 0);
  }

  document.addEventListener('input', (e) => {
    if (e.target.id === 'tp-search') return filterNav();
    const panel = e.target.closest('[data-panel]');
    if (!panel) return;
    if (e.target.dataset.findInput !== undefined) runFind(panel, { reset: true });
    else if (e.target.dataset.input !== undefined || e.target.dataset.opt !== undefined) {
      runSoon(panel.dataset.panel);
    }
  });

  document.addEventListener('change', (e) => {
    const panel = e.target.closest('[data-panel]');
    if (panel && e.target.dataset.opt !== undefined) run(panel.dataset.panel);
  });

  document.addEventListener('click', (e) => {
    // the star sits in the sidebar, outside any panel, so it is handled first
    const pin = e.target.closest('[data-pin]');
    if (pin) return togglePin(pin.dataset.pin);

    const pick = e.target.closest('[data-select]');
    if (pick) return select(pick.dataset.select, { focus: true });

    const panel = e.target.closest('[data-panel]');
    if (!panel) return;

    if (e.target.closest('[data-rerun]')) run(panel.dataset.panel);
    if (e.target.closest('[data-find-open]')) openFind(panel);
    if (e.target.closest('[data-find-close]')) closeFind(panel);
    const stepBtn = e.target.closest('[data-find-step]');
    if (stepBtn) runFind(panel, { step: Number(stepBtn.dataset.findStep) });

    // data-copy marks the button only. The payload sits on [data-out] as
    // data-payload, so clicking inside the output never matches this.
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const text = panel.querySelector('[data-out]').dataset.payload || '';
      if (!text) return;
      navigator.clipboard?.writeText(text);
      copyBtn.textContent = 'copied';
      setTimeout(() => (copyBtn.textContent = 'copy'), 1200);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'tp-search' && e.key === 'Enter') {
      const first = document.querySelector('.tp-item:not([hidden]) [data-select]');
      if (first) select(first.dataset.select, { focus: true });
      return;
    }

    // `/` jumps to the filter, unless something is already taking typing
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (active?.closest?.('[data-out]')) return; // the output box is focusable too
      const search = document.getElementById('tp-search');
      if (!search) return;
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }

    const panel = e.target.closest?.('[data-panel]');
    if (!panel) return;
    const inBar = e.target.closest('[data-find]');
    const inOut = e.target.closest('[data-out]');
    if (!inBar && !inOut) return;

    // ctrl+f is only taken over while focus sits in the output or the find bar,
    // so the browser's own find still works everywhere else on the page
    if (e.key === 'f' && (e.ctrlKey || e.metaKey) && !e.altKey) {
      if (!canHighlight) return; // no way to paint matches, let the native box win
      e.preventDefault();
      openFind(panel);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFind(panel);
      return;
    }
    if (inBar && e.key === 'Enter') {
      e.preventDefault();
      runFind(panel, { step: e.shiftKey ? -1 : 1 });
    }
  });

  window.addEventListener('hashchange', () => select(location.hash.slice(1), { push: false }));

  // Per-page setup only. astro:page-load fires on the initial load as well as
  // after every client-side navigation, so this is the only hook needed.
  function init() {
    if (!document.getElementById('tp-nav')) return; // not the tools page
    restoreState();
    applyPins();
    select(location.hash.slice(1) || DEFAULT_TOOL, { push: false });
  }

  document.addEventListener('astro:page-load', init);
