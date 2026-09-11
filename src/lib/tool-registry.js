/**
 * The tool list for /tools/.
 *
 * Metadata is read on the server to render the sidebar and the panel shells.
 * `run` is only ever called in the browser. Each run returns a small tagged
 * object and the page decides how to draw it, so adding a tool means adding
 * one entry here, not a new component.
 */
import * as T from './tools.js';

/**
 * One shape for every tool, so the page can render the sidebar and the panels
 * without knowing which tool it is looking at.
 *
 * @typedef {Object} ToolOpt
 * @property {string} id
 * @property {'select'|'text'|'checkbox'|'number'} type
 * @property {string} label
 * @property {string[]} [values]      select only
 * @property {string|number|boolean} [value]  starting value
 * @property {number} [size]          text width
 * @property {number} [min]
 * @property {number} [max]
 *
 * @typedef {Object} ToolInput
 * @property {string} id
 * @property {string} [label]         shown above the box when there are two
 * @property {string} placeholder
 * @property {number} [rows]
 *
 * @typedef {Object} Tool
 * @property {string} id
 * @property {string} name
 * @property {string} group
 * @property {string} desc
 * @property {string} [warn]          shown as a callout above the inputs
 * @property {boolean} [noInput]      generators: a button instead of a textarea
 * @property {ToolOpt[]} [opts]
 * @property {ToolInput[]} [inputs]
 * @property {(values: Record<string, string>, opts: Record<string, any>) => any} run
 */

const text = (s) => ({ kind: 'text', text: s });
const rows = (r) => ({ kind: 'rows', rows: r });

export const GROUPS = [
  { id: 'data', label: 'data' },
  { id: 'text', label: 'text' },
  { id: 'encode', label: 'encode & hash' },
  { id: 'convert', label: 'convert' },
];

/** @type {Tool[]} */
export const TOOLS = [
  /* ---------------------------------------------------------------- data */
  {
    id: 'json',
    name: 'json viewer',
    group: 'data',
    desc: 'beautify, parse, highlight, fold. keys are clickable to copy their path.',
    opts: [{ id: 'view', type: 'select', label: 'view', values: ['tree', 'formatted', 'minified'] }],
    inputs: [{ id: 'text', placeholder: '{"user":{"id":1,"roles":["admin"]}}', rows: 8 }],
    run: ({ text: s }, o) => {
      const value = JSON.parse(s);
      if (o.view === 'formatted') return text(JSON.stringify(value, null, 2));
      if (o.view === 'minified') return text(JSON.stringify(value));
      return { kind: 'json', value };
    },
  },
  {
    id: 'json-diff',
    name: 'json diff',
    group: 'data',
    desc: 'structural diff by path, not by line. order of keys is ignored.',
    inputs: [
      { id: 'a', label: 'before', placeholder: '{"a":1,"b":2}', rows: 8 },
      { id: 'b', label: 'after', placeholder: '{"a":1,"b":3}', rows: 8 },
    ],
    run: ({ a, b }) => ({ kind: 'jsondiff', changes: T.diffJson(a, b) }),
  },
  {
    id: 'csv',
    name: 'csv / json',
    group: 'data',
    desc: 'quotes, embedded commas and newlines all survive the trip.',
    opts: [
      { id: 'dir', type: 'select', label: 'direction', values: ['csv to json', 'json to csv'] },
      { id: 'delim', type: 'text', label: 'delimiter', value: ',', size: 2 },
    ],
    inputs: [{ id: 'text', placeholder: 'name,email\nbudi,budi@example.com', rows: 8 }],
    run: ({ text: s }, o) => {
      const d = o.delim === '\\t' ? '\t' : o.delim || ',';
      return o.dir === 'json to csv'
        ? text(T.jsonToCsv(s, d))
        : text(JSON.stringify(T.csvToJson(s, d), null, 2));
    },
  },
  {
    id: 'query',
    name: 'query string',
    group: 'data',
    desc: 'paste a whole url if you like. repeated keys become arrays.',
    opts: [{ id: 'dir', type: 'select', label: 'direction', values: ['qs to json', 'json to qs'] }],
    inputs: [{ id: 'text', placeholder: 'https://x.dev/search?q=astro&page=2', rows: 4 }],
    run: ({ text: s }, o) => text(o.dir === 'json to qs' ? T.jsonToQs(s) : T.qsToJson(s)),
  },

  /* ---------------------------------------------------------------- text */
  {
    id: 'count',
    name: 'counter',
    group: 'text',
    desc: 'characters, words, sentences, lines, utf-8 bytes.',
    inputs: [{ id: 'text', placeholder: 'paste anything', rows: 8 }],
    run: ({ text: s }) => rows(Object.entries(T.countText(s)).map(([k, v]) => [k, String(v)])),
  },
  {
    id: 'hidden',
    name: 'hidden characters',
    group: 'text',
    desc: 'zero-width, bidi, odd spaces and tag characters you cannot see.',
    opts: [{ id: 'view', type: 'select', label: 'view', values: ['report', 'cleaned'] }],
    inputs: [{ id: 'text', placeholder: 'paste text that looks fine but behaves oddly', rows: 6 }],
    run: ({ text: s }, o) =>
      o.view === 'cleaned' ? text(T.stripHidden(s)) : { kind: 'hidden', text: s, ...T.scanHidden(s) },
  },
  {
    id: 'case',
    name: 'case converter',
    group: 'text',
    desc: 'every case at once. multi-line input converts line by line.',
    inputs: [{ id: 'text', placeholder: 'getHTTPResponse code', rows: 4 }],
    run: ({ text: s }) => rows(T.caseVariants(s)),
  },
  {
    id: 'lines',
    name: 'lines',
    group: 'text',
    desc: 'trim, dedupe, sort, number. the boring one you use every day.',
    opts: [
      { id: 'sort', type: 'select', label: 'sort', values: ['none', 'asc', 'desc', 'length'] },
      { id: 'trim', type: 'checkbox', label: 'trim', value: true },
      { id: 'dropEmpty', type: 'checkbox', label: 'drop empty', value: true },
      { id: 'dedupe', type: 'checkbox', label: 'dedupe' },
      { id: 'reverse', type: 'checkbox', label: 'reverse' },
      { id: 'number', type: 'checkbox', label: 'number' },
    ],
    inputs: [{ id: 'text', placeholder: 'one\ntwo\ntwo\n', rows: 8 }],
    run: ({ text: s }, o) => text(T.transformLines(s, o)),
  },
  {
    id: 'slug',
    name: 'slugify',
    group: 'text',
    desc: 'accents stripped, one slug per line.',
    inputs: [{ id: 'text', placeholder: 'Héllo, World!', rows: 4 }],
    run: ({ text: s }) => text(T.slugify(s)),
  },
  {
    id: 'diff',
    name: 'text diff',
    group: 'text',
    desc: 'line diff using the shortest edit path.',
    inputs: [
      { id: 'a', label: 'before', placeholder: 'old text', rows: 8 },
      { id: 'b', label: 'after', placeholder: 'new text', rows: 8 },
    ],
    run: ({ a, b }) => ({ kind: 'diff', parts: T.diffLines(a, b) }),
  },
  {
    id: 'regex',
    name: 'regex tester',
    group: 'text',
    desc: 'javascript regex. matches are highlighted in place.',
    opts: [
      { id: 'pattern', type: 'text', label: 'pattern', value: '\\b\\w+@\\w+\\.\\w+\\b', size: 28 },
      { id: 'flags', type: 'text', label: 'flags', value: 'gi', size: 4 },
    ],
    inputs: [{ id: 'text', placeholder: 'text to search', rows: 8 }],
    run: ({ text: s }, o) => ({
      kind: 'regex',
      text: s,
      matches: T.regexMatches(o.pattern, o.flags, s),
    }),
  },

  /* -------------------------------------------------------------- encode */
  {
    id: 'base64',
    name: 'base64',
    group: 'encode',
    desc: 'utf-8 safe, so emoji and accents round-trip.',
    opts: [{ id: 'mode', type: 'select', label: 'mode', values: ['encode', 'decode'] }],
    inputs: [{ id: 'text', placeholder: 'halo dunia', rows: 6 }],
    run: ({ text: s }, o) => text(o.mode === 'decode' ? T.b64decode(s) : T.b64encode(s)),
  },
  {
    id: 'url',
    name: 'url encode',
    group: 'encode',
    desc: 'component by default. whole url keeps : / ? & readable.',
    opts: [
      { id: 'mode', type: 'select', label: 'mode', values: ['encode', 'decode'] },
      { id: 'whole', type: 'checkbox', label: 'whole url' },
    ],
    inputs: [{ id: 'text', placeholder: 'a b&c=d', rows: 4 }],
    run: ({ text: s }, o) => text(o.mode === 'decode' ? T.urlDecode(s, o.whole) : T.urlEncode(s, o.whole)),
  },
  {
    id: 'jwt',
    name: 'jwt decode',
    group: 'encode',
    desc: 'decode only. the signature is never checked and never sent anywhere.',
    warn: 'Runs in your browser and nothing is stored or sent. Still, do not paste a live production token into any web page, including this one.',
    inputs: [{ id: 'text', placeholder: 'eyJhbGciOi...', rows: 5 }],
    run: ({ text: s }) => ({ kind: 'jwt', ...T.jwtDecode(s) }),
  },
  {
    id: 'hash',
    name: 'hash',
    group: 'encode',
    desc: 'sha-1 through sha-512 via the browser crypto api.',
    inputs: [{ id: 'text', placeholder: 'text to hash', rows: 5 }],
    run: ({ text: s }) => T.hashRows(s).then(rows),
  },
  {
    id: 'uuid',
    name: 'uuid v4',
    group: 'encode',
    desc: 'crypto.randomUUID, so they are proper random v4 values.',
    noInput: true,
    opts: [{ id: 'count', type: 'number', label: 'how many', value: 5, min: 1, max: 500 }],
    run: (_, o) =>
      text(Array.from({ length: Math.min(Math.max(Number(o.count) || 1, 1), 500) }, () => crypto.randomUUID()).join('\n')),
  },

  /* ------------------------------------------------------------- convert */
  {
    id: 'base',
    name: 'number base',
    group: 'convert',
    desc: 'bigint backed, so values past 2^53 stay exact.',
    opts: [{ id: 'from', type: 'select', label: 'read as', values: ['auto', '2', '8', '10', '16'] }],
    inputs: [{ id: 'text', placeholder: '0xdeadbeef', rows: 2 }],
    run: ({ text: s }, o) => rows(T.baseRows(s, o.from)),
  },
  {
    id: 'epoch',
    name: 'epoch time',
    group: 'convert',
    desc: 'seconds, millis, micros, nanos or a date string. empty means now.',
    inputs: [{ id: 'text', placeholder: '1700000000  (empty = now)', rows: 2 }],
    run: ({ text: s }) => rows(T.epochRows(s)),
  },
  {
    id: 'cidr',
    name: 'cidr calculator',
    group: 'convert',
    desc: 'ipv4 only. network, broadcast, host range, usable count.',
    inputs: [{ id: 'text', placeholder: '10.0.1.130/26', rows: 2 }],
    run: ({ text: s }) => rows(T.cidrRows(s)),
  },
  {
    id: 'cron',
    name: 'cron explainer',
    group: 'convert',
    desc: 'five fields plus @daily style macros, with the next five run times.',
    inputs: [{ id: 'text', placeholder: '*/15 9-17 * * mon-fri', rows: 2 }],
    run: ({ text: s }) => rows(T.cronRows(s)),
  },
];

export const DEFAULT_TOOL = TOOLS[0].id;
