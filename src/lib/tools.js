/**
 * Pure helpers behind /tools/.
 *
 * No DOM in this file. Everything here takes strings and returns strings or
 * plain data, so `node --test` can run it directly and the page stays a thin
 * renderer. Every function throws a plain Error with a readable message when
 * the input is bad; the page catches and shows it.
 */

/* ------------------------------------------------------------------ base64 */

export function b64encode(s) {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function b64decode(s) {
  const bin = atob(s.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function b64urlDecode(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64decode(t + '='.repeat((4 - (t.length % 4)) % 4));
}

/* ----------------------------------------------------------------- counter */

export function countText(s) {
  const trimmed = s.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    characters: s.length,
    'characters (no spaces)': s.replace(/\s/g, '').length,
    words,
    sentences: s.split(/[.!?]+(?=\s|$)/).filter((x) => x.trim()).length,
    lines: s === '' ? 0 : s.split('\n').length,
    paragraphs: s.split(/\n\s*\n/).filter((p) => p.trim()).length,
    'bytes (utf-8)': new TextEncoder().encode(s).length,
    // 200 wpm is the usual reading-speed guess, not a measured number
    'reading time': words ? `~${Math.max(1, Math.round(words / 200))} min` : '0 min',
  };
}

/* --------------------------------------------------------------------- url */

export const urlEncode = (s, whole) => (whole ? encodeURI(s) : encodeURIComponent(s));
export const urlDecode = (s, whole) => (whole ? decodeURI(s) : decodeURIComponent(s));

/* ------------------------------------------------------------ query string */

export function qsToJson(s) {
  // accept a bare query string, a "?a=1" fragment, or a whole URL
  const q = s.trim().replace(/^[^?#]*\?/, '').replace(/#.*$/, '');
  const out = {};
  for (const [k, v] of new URLSearchParams(q)) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return JSON.stringify(out, null, 2);
}

export function jsonToQs(s) {
  const obj = JSON.parse(s);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('expected a JSON object, like {"page":2}');
  }
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x == null ? '' : String(x)));
    else p.append(k, v == null ? '' : String(v));
  }
  return p.toString();
}

/* -------------------------------------------------------------------- hash */

export async function hashHex(algo, s) {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashRows(s) {
  const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  const hex = await Promise.all(algos.map((a) => hashHex(a, s)));
  return algos.map((a, i) => [a.toLowerCase(), hex[i]]);
}

/* ------------------------------------------------------------------- epoch */

export function parseWhen(input) {
  const t = input.trim();
  if (!t) return Date.now();
  if (/^-?\d+$/.test(t)) {
    const digits = t.replace('-', '').length;
    const n = Number(t);
    if (digits <= 11) return n * 1000; // seconds
    if (digits <= 14) return n; // milliseconds
    if (digits <= 17) return Math.round(n / 1e3); // microseconds
    return Math.round(n / 1e6); // nanoseconds
  }
  const parsed = Date.parse(t);
  if (Number.isNaN(parsed)) throw new Error(`cannot read "${t}" as a date or an epoch number`);
  return parsed;
}

export function relativeTime(ms, now = Date.now()) {
  const diff = ms - now;
  const units = [
    ['year', 31536e6], ['month', 2592e6], ['day', 864e5],
    ['hour', 36e5], ['minute', 6e4], ['second', 1e3],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit);
  }
}

export function epochRows(input, zone = 'Asia/Jakarta') {
  const ms = parseWhen(input);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) throw new Error('that timestamp is outside the range Date can hold');
  const fmt = (tz) =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: tz }).format(d);
  return [
    ['epoch (s)', String(Math.floor(ms / 1000))],
    ['epoch (ms)', String(ms)],
    ['iso 8601', d.toISOString()],
    ['utc', fmt('UTC')],
    [zone.toLowerCase(), fmt(zone)],
    ['your timezone', fmt(undefined)],
    ['relative', relativeTime(ms)],
  ];
}

/* --------------------------------------------------------------------- jwt */

export function jwtDecode(s) {
  const parts = s.trim().split('.');
  if (parts.length < 2) throw new Error('that is not a JWT: expected header.payload.signature');
  const read = (part, name) => {
    try {
      return JSON.parse(b64urlDecode(part));
    } catch {
      throw new Error(`the ${name} is not valid base64url JSON`);
    }
  };
  return {
    header: read(parts[0], 'header'),
    payload: read(parts[1], 'payload'),
    signature: parts[2] || '',
  };
}

/* ---------------------------------------------------------------- case ---- */

export function splitWords(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

export function caseVariants(s) {
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const each = (fn) => s.split('\n').map((line) => fn(splitWords(line))).join('\n');
  return [
    ['camelCase', each((w) => w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join(''))],
    ['PascalCase', each((w) => w.map(cap).join(''))],
    ['snake_case', each((w) => w.map((x) => x.toLowerCase()).join('_'))],
    ['SCREAMING_SNAKE', each((w) => w.map((x) => x.toUpperCase()).join('_'))],
    ['kebab-case', each((w) => w.map((x) => x.toLowerCase()).join('-'))],
    ['dot.case', each((w) => w.map((x) => x.toLowerCase()).join('.'))],
    ['Title Case', each((w) => w.map(cap).join(' '))],
    ['lower case', each((w) => w.map((x) => x.toLowerCase()).join(' '))],
  ];
}

/* ------------------------------------------------------------------- lines */

export function transformLines(s, o = {}) {
  let out = s.split('\n');
  if (o.trim) out = out.map((l) => l.trim());
  if (o.dropEmpty) out = out.filter((l) => l.trim() !== '');
  if (o.dedupe) out = [...new Set(out)];
  if (o.sort === 'asc') out.sort((a, b) => a.localeCompare(b));
  if (o.sort === 'desc') out.sort((a, b) => b.localeCompare(a));
  if (o.sort === 'length') out.sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (o.reverse) out.reverse();
  if (o.number) {
    const pad = String(out.length).length;
    out = out.map((l, i) => `${String(i + 1).padStart(pad, ' ')}  ${l}`);
  }
  return out.join('\n');
}

/* -------------------------------------------------------------- number base */

export function baseRows(input, from = 'auto') {
  let t = input.trim().replace(/[\s_,]/g, '');
  if (!t) return [];
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);

  let radix;
  if (from === 'auto') {
    if (/^0x/i.test(t)) { radix = 16; t = t.slice(2); }
    else if (/^0b/i.test(t)) { radix = 2; t = t.slice(2); }
    else if (/^0o/i.test(t)) { radix = 8; t = t.slice(2); }
    else if (/[a-z]/i.test(t)) radix = 16;
    else radix = 10;
  } else {
    radix = Number(from);
    t = t.replace(/^0[xbo]/i, '');
  }

  let n = 0n;
  const R = BigInt(radix);
  for (const c of t) {
    const d = parseInt(c, radix);
    if (Number.isNaN(d)) throw new Error(`"${c}" is not a digit in base ${radix}`);
    n = n * R + BigInt(d);
  }

  const sign = neg ? '-' : '';
  return [
    ['read as base', String(radix)],
    ['binary', sign + n.toString(2)],
    ['octal', sign + n.toString(8)],
    ['decimal', sign + n.toString(10)],
    ['hex', sign + n.toString(16).toUpperCase()],
    ['base36', sign + n.toString(36)],
    ['bit length', String(n.toString(2).length)],
  ];
}

/* -------------------------------------------------------------------- slug */

export function slugify(s) {
  return s
    .split('\n')
    .map((line) =>
      line
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .join('\n');
}

/* --------------------------------------------------------- hidden characters */

/**
 * Names in this table are the official Unicode names. Characters matched by a
 * range instead get a lowercase description, so it is always clear which is
 * which and nothing here claims a name it cannot back up.
 */
const HIDDEN_CHARS = {
  0x00ad: ['soft-hyphen', 'SOFT HYPHEN'],
  0x200b: ['zero-width', 'ZERO WIDTH SPACE'],
  0x200c: ['zero-width', 'ZERO WIDTH NON-JOINER'],
  0x200d: ['zero-width', 'ZERO WIDTH JOINER'],
  0x2060: ['zero-width', 'WORD JOINER'],
  0xfeff: ['zero-width', 'ZERO WIDTH NO-BREAK SPACE (BOM)'],
  0xfffd: ['broken', 'REPLACEMENT CHARACTER'],

  0x00a0: ['space', 'NO-BREAK SPACE'],
  0x1680: ['space', 'OGHAM SPACE MARK'],
  0x2000: ['space', 'EN QUAD'],
  0x2001: ['space', 'EM QUAD'],
  0x2002: ['space', 'EN SPACE'],
  0x2003: ['space', 'EM SPACE'],
  0x2004: ['space', 'THREE-PER-EM SPACE'],
  0x2005: ['space', 'FOUR-PER-EM SPACE'],
  0x2006: ['space', 'SIX-PER-EM SPACE'],
  0x2007: ['space', 'FIGURE SPACE'],
  0x2008: ['space', 'PUNCTUATION SPACE'],
  0x2009: ['space', 'THIN SPACE'],
  0x200a: ['space', 'HAIR SPACE'],
  0x202f: ['space', 'NARROW NO-BREAK SPACE'],
  0x205f: ['space', 'MEDIUM MATHEMATICAL SPACE'],
  0x3000: ['space', 'IDEOGRAPHIC SPACE'],

  0x200e: ['bidi', 'LEFT-TO-RIGHT MARK'],
  0x200f: ['bidi', 'RIGHT-TO-LEFT MARK'],
  0x202a: ['bidi', 'LEFT-TO-RIGHT EMBEDDING'],
  0x202b: ['bidi', 'RIGHT-TO-LEFT EMBEDDING'],
  0x202c: ['bidi', 'POP DIRECTIONAL FORMATTING'],
  0x202d: ['bidi', 'LEFT-TO-RIGHT OVERRIDE'],
  0x202e: ['bidi', 'RIGHT-TO-LEFT OVERRIDE'],
  0x2066: ['bidi', 'LEFT-TO-RIGHT ISOLATE'],
  0x2067: ['bidi', 'RIGHT-TO-LEFT ISOLATE'],
  0x2068: ['bidi', 'FIRST STRONG ISOLATE'],
  0x2069: ['bidi', 'POP DIRECTIONAL ISOLATE'],
};

export const codeName = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/** null means the character is ordinary. Tab and newline are always ordinary. */
function classifyChar(cp) {
  const exact = HIDDEN_CHARS[cp];
  if (exact) return { cls: exact[0], label: exact[1] };
  if (cp === 0x09 || cp === 0x0a) return null;
  if (cp <= 0x1f || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) {
    return { cls: 'control', label: 'control character' };
  }
  if (cp >= 0xfe00 && cp <= 0xfe0f) return { cls: 'variation', label: 'variation selector' };
  if (cp >= 0xe0100 && cp <= 0xe01ef) return { cls: 'variation', label: 'variation selector supplement' };
  // these carry text no human sees, which is how instructions get smuggled into
  // anything that reads the string, an LLM prompt included
  if (cp >= 0xe0000 && cp <= 0xe007f) return { cls: 'tag', label: 'unicode tag character' };
  if (cp >= 0xe000 && cp <= 0xf8ff) return { cls: 'private-use', label: 'private use area' };
  return null;
}

const SCRIPTS = [
  ['latin', /\p{Script=Latin}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
];

/**
 * Words built from more than one script. This is a flag, not a verdict: plenty
 * of real text mixes scripts. It catches the lookalike trick where a Cyrillic
 * "a" sits inside an otherwise Latin word.
 */
export function mixedScriptWords(s) {
  const seen = new Set();
  const out = [];
  // strip first: a word's script mix is about its visible letters, and quoting
  // the raw word back would put invisible characters into the warning itself
  for (const word of stripHidden(s).split(/[\s\p{P}\p{S}]+/u).filter(Boolean)) {
    if (seen.has(word)) continue;
    seen.add(word);
    const scripts = SCRIPTS.filter(([, re]) => re.test(word)).map(([name]) => name);
    if (scripts.length > 1) out.push({ word, scripts });
  }
  return out;
}

export function scanHidden(s) {
  const findings = [];
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i);
    const hit = classifyChar(cp);
    if (hit) findings.push({ at: i, cp, code: codeName(cp), ...hit });
    i += cp > 0xffff ? 2 : 1; // astral characters are two UTF-16 units
  }
  const counts = {};
  for (const f of findings) counts[f.cls] = (counts[f.cls] ?? 0) + 1;
  return { findings, counts, mixed: mixedScriptWords(s), nfc: s.normalize('NFC') === s };
}

/** Odd spaces become a plain space, everything else hidden is dropped. */
export function stripHidden(s) {
  let out = '';
  for (const ch of s) {
    const hit = classifyChar(ch.codePointAt(0));
    if (!hit) out += ch;
    else if (hit.cls === 'space') out += ' ';
  }
  return out.normalize('NFC');
}

/* ------------------------------------------------------------------- regex */

export function regexMatches(pattern, flags, text, cap = 2000) {
  if (!pattern) return [];
  const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ index: m.index, match: m[0], groups: m.slice(1), named: m.groups || null });
    // a pattern that can match nothing would loop forever without this nudge
    if (m.index === re.lastIndex) re.lastIndex++;
    if (out.length >= cap) break;
  }
  return out;
}

/* -------------------------------------------------------------- text diff  */

export function diffLines(aText, bText) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  // ponytail: plain LCS table, O(n*m) memory. Fine for pasted text, so we
  // refuse anything bigger instead of reaching for a Myers implementation.
  if (a.length * b.length > 4_000_000) {
    throw new Error(`too big to diff: ${a.length} x ${b.length} lines`);
  }
  const m = a.length;
  const n = b.length;
  const w = n + 1;
  const dp = new Uint32Array((m + 1) * w);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: ' ', v: a[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { out.push({ t: '-', v: a[i] }); i++; }
    else { out.push({ t: '+', v: b[j] }); j++; }
  }
  while (i < m) out.push({ t: '-', v: a[i++] });
  while (j < n) out.push({ t: '+', v: b[j++] });
  return out;
}

/* -------------------------------------------------------------- json diff  */

export function diffJson(aText, bText) {
  const a = JSON.parse(aText);
  const b = JSON.parse(bText);
  const out = [];
  const isObj = (v) => v !== null && typeof v === 'object';

  const walk = (x, y, path) => {
    if (Object.is(x, y)) return;
    if (!isObj(x) || !isObj(y) || Array.isArray(x) !== Array.isArray(y)) {
      out.push({ op: 'change', path, from: x, to: y });
      return;
    }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const p = Array.isArray(x) ? `${path}[${k}]` : `${path}.${k}`;
      if (!(k in x)) out.push({ op: 'add', path: p, to: y[k] });
      else if (!(k in y)) out.push({ op: 'remove', path: p, from: x[k] });
      else walk(x[k], y[k], p);
    }
  };

  walk(a, b, '$');
  return out;
}

/* --------------------------------------------------------------------- csv */

export function parseCsv(text, delim = ',') {
  const rows = [[]];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') { cur += c; continue; }
      if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delim) { rows[rows.length - 1].push(cur); cur = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
    else if (c !== '\r') cur += c;
  }
  rows[rows.length - 1].push(cur);
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && last[0] === '') rows.pop();
  return rows;
}

export function csvToJson(text, delim = ',') {
  const rows = parseCsv(text, delim);
  if (!rows.length || (rows.length === 1 && rows[0].join('') === '')) return [];
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export function jsonToCsv(text, delim = ',') {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('expected a JSON array of objects');
  if (!data.length) return '';
  const header = [...new Set(data.flatMap((row) => Object.keys(row ?? {})))];
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.map(cell).join(delim), ...data.map((row) => header.map((h) => cell(row?.[h])).join(delim))].join('\n');
}

/* -------------------------------------------------------------------- cidr */

const ipToInt = (ip) => {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`"${ip}" is not an IPv4 address`);
  return parts.reduce((acc, p) => {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) throw new Error(`"${p}" is not a valid octet`);
    return acc * 256 + Number(p);
  }, 0);
};

const intToIp = (n) => [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join('.');

export function cidrRows(input) {
  const [ip, bitsStr] = input.trim().split('/');
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('prefix must be between /0 and /32');
  const addr = ipToInt(ip) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - bits);
  const usable = bits >= 31 ? total : Math.max(total - 2, 0);
  return [
    ['address', `${intToIp(addr)}/${bits}`],
    ['network', intToIp(network)],
    ['broadcast', intToIp(broadcast)],
    ['netmask', intToIp(mask)],
    ['wildcard', intToIp(~mask >>> 0)],
    ['first host', intToIp(bits >= 31 ? network : (network + 1) >>> 0)],
    ['last host', intToIp(bits >= 31 ? broadcast : (broadcast - 1) >>> 0)],
    ['range', `${intToIp(network)} - ${intToIp(broadcast)}`],
    ['total addresses', total.toLocaleString('en-US')],
    ['usable hosts', usable.toLocaleString('en-US')],
    ['in this block', addr >= network && addr <= broadcast ? 'yes' : 'no'],
  ];
}

/* -------------------------------------------------------------------- cron */

const CRON_MACROS = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function cronNum(s, names, min, max) {
  const i = names ? names.indexOf(s.toLowerCase()) : -1;
  const n = i >= 0 ? i + (names === MONTHS ? 1 : 0) : Number(s);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`"${s}" is outside ${min}-${max}`);
  return n;
}

function cronField(spec, min, max, names) {
  const set = new Set();
  for (const part of spec.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr === undefined ? 1 : Number(stepStr);
    if (!Number.isInteger(step) || step < 1) throw new Error(`"${part}" has a bad step`);
    let lo;
    let hi;
    if (range === '*' || range === '?') { lo = min; hi = max; }
    else {
      const [a, b] = range.split('-');
      lo = cronNum(a, names, min, max);
      hi = b === undefined ? (stepStr === undefined ? lo : max) : cronNum(b, names, min, max);
    }
    if (lo > hi) throw new Error(`range "${range}" runs backwards`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

export function parseCron(expr) {
  const raw = expr.trim().toLowerCase();
  const src = CRON_MACROS[raw] ?? raw;
  const f = src.split(/\s+/).filter(Boolean);
  if (f.length !== 5) throw new Error(`expected 5 fields (min hour dom mon dow), got ${f.length}`);
  const dow = cronField(f[4], 0, 7, DAYS);
  if (dow.has(7)) { dow.add(0); dow.delete(7); }
  return {
    fields: f,
    minute: cronField(f[0], 0, 59),
    hour: cronField(f[1], 0, 23),
    dom: cronField(f[2], 1, 31),
    month: cronField(f[3], 1, 12, MONTHS),
    dow,
    // when both day fields are restricted cron ORs them, which surprises people
    domRestricted: f[2] !== '*' && f[2] !== '?',
    dowRestricted: f[4] !== '*' && f[4] !== '?',
  };
}

export function cronMatches(c, d) {
  if (!c.minute.has(d.getMinutes())) return false;
  if (!c.hour.has(d.getHours())) return false;
  if (!c.month.has(d.getMonth() + 1)) return false;
  const byDate = c.dom.has(d.getDate());
  const byWeek = c.dow.has(d.getDay());
  return c.domRestricted && c.dowRestricted ? byDate || byWeek : byDate && byWeek;
}

// ponytail: brute-force minute scan, capped at one year. 527k cheap iterations
// worst case. Swap for field stepping only if this ever needs thousands of hits.
export function cronNext(c, count = 5, from = new Date()) {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const out = [];
  for (let i = 0; i < 366 * 24 * 60 && out.length < count; i++) {
    if (cronMatches(c, d)) out.push(new Date(d.getTime()));
    d.setMinutes(d.getMinutes() + 1);
  }
  return out;
}

export function cronRows(expr, now = new Date()) {
  const c = parseCron(expr);
  const list = (set, full, fmt = String) =>
    set.size >= full ? 'every' : [...set].sort((a, b) => a - b).map(fmt).join(', ');
  // spelled out field by field: mixing dateStyle with weekday throws in Chrome
  const fmtTime = (d) =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);

  const rows = [
    ['expression', c.fields.join(' ')],
    ['minute', list(c.minute, 60)],
    ['hour', list(c.hour, 24)],
    ['day of month', list(c.dom, 31)],
    ['month', list(c.month, 12, (m) => MONTHS[m - 1])],
    ['day of week', list(c.dow, 7, (d) => DAYS[d])],
  ];
  if (c.domRestricted && c.dowRestricted) {
    rows.push(['note', 'day-of-month and day-of-week are both set, so cron runs when EITHER matches']);
  }
  const next = cronNext(c, 5, now);
  rows.push(['next 5 runs', next.length ? next.map(fmtTime).join('\n') : 'never in the next year']);
  rows.push(['times shown in', Intl.DateTimeFormat().resolvedOptions().timeZone]);
  return rows;
}
