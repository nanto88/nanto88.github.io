import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as t from './tools.js';

test('base64 round-trips utf-8', () => {
  assert.equal(t.b64encode('halo dunia'), 'aGFsbyBkdW5pYQ==');
  assert.equal(t.b64decode('aGFsbyBkdW5pYQ=='), 'halo dunia');
  assert.equal(t.b64decode(t.b64encode('kopi ☕ énak')), 'kopi ☕ énak');
  assert.throws(() => t.b64decode('!!!'));
});

test('base64url decodes without padding', () => {
  assert.equal(t.b64urlDecode('eyJhIjoxfQ'), '{"a":1}');
});

test('countText counts what it says', () => {
  const c = t.countText('Hi there. Bye now!\n\nLast line');
  assert.equal(c.words, 6);
  assert.equal(c.sentences, 3);
  assert.equal(c.lines, 3);
  assert.equal(c.paragraphs, 2);
  assert.equal(t.countText('').words, 0);
  assert.equal(t.countText('').sentences, 0);
  assert.equal(t.countText('é').characters, 1);
  assert.equal(t.countText('é')['bytes (utf-8)'], 2);
});

test('query string handles repeats and full urls', () => {
  assert.deepEqual(JSON.parse(t.qsToJson('https://x.dev/p?a=1&a=2&b=hi#frag')), { a: ['1', '2'], b: 'hi' });
  assert.equal(t.jsonToQs('{"a":["1","2"],"b":"hi"}'), 'a=1&a=2&b=hi');
  assert.throws(() => t.jsonToQs('[1,2]'), /expected a JSON object/);
});

test('sha-256 of empty string matches the known digest', async () => {
  assert.equal(
    await t.hashHex('SHA-256', ''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('parseWhen reads seconds, millis and dates', () => {
  assert.equal(t.parseWhen('1700000000'), 1700000000000);
  assert.equal(t.parseWhen('1700000000000'), 1700000000000);
  assert.equal(t.parseWhen('2023-11-14T22:13:20Z'), 1700000000000);
  assert.throws(() => t.parseWhen('not a date'), /cannot read/);
});

test('jwt splits header and payload', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MDAwMDAwMDB9.sig';
  const out = t.jwtDecode(jwt);
  assert.equal(out.header.alg, 'HS256');
  assert.equal(out.payload.sub, '123');
  assert.equal(out.signature, 'sig');
  assert.throws(() => t.jwtDecode('nope'), /not a JWT/);
});

test('case variants split on every boundary', () => {
  const v = Object.fromEntries(t.caseVariants('getHTTPResponse code'));
  assert.equal(v.snake_case, 'get_http_response_code');
  assert.equal(v.camelCase, 'getHttpResponseCode');
  assert.equal(v['kebab-case'], 'get-http-response-code');
  assert.equal(t.caseVariants('a b\nc d').find(([k]) => k === 'snake_case')[1], 'a_b\nc_d');
});

test('line transforms apply in a sane order', () => {
  const out = t.transformLines(' b \na\nb\n\n', { trim: true, dropEmpty: true, dedupe: true, sort: 'asc' });
  assert.equal(out, 'a\nb');
});

test('base conversion reads prefixes and rejects bad digits', () => {
  const rows = Object.fromEntries(t.baseRows('0xff'));
  assert.equal(rows.decimal, '255');
  assert.equal(rows.binary, '11111111');
  assert.equal(Object.fromEntries(t.baseRows('1010', '2')).decimal, '10');
  assert.equal(Object.fromEntries(t.baseRows('18446744073709551616')).hex, '10000000000000000');
  assert.throws(() => t.baseRows('9', '2'), /not a digit/);
});

test('slugify strips accents per line', () => {
  assert.equal(t.slugify('Héllo, World!'), 'hello-world');
  assert.equal(t.slugify('One Two\nThree'), 'one-two\nthree');
});

test('regexMatches survives zero-length matches', () => {
  const m = t.regexMatches('a*', 'g', 'aab');
  assert.ok(m.length > 0 && m.length < 10);
  assert.equal(m[0].match, 'aa');
  assert.deepEqual(t.regexMatches('(\\d)-(\\d)', '', '1-2')[0].groups, ['1', '2']);
});

test('diffLines finds the smallest edit', () => {
  const d = t.diffLines('a\nb\nc', 'a\nx\nc');
  assert.deepEqual(d.map((p) => p.t + p.v), [' a', '-b', '+x', ' c']);
  assert.ok(t.diffLines('same', 'same').every((p) => p.t === ' '));
});

test('diffJson reports add, remove and change with paths', () => {
  const d = t.diffJson('{"a":1,"b":{"c":2},"d":[1,2]}', '{"a":1,"b":{"c":3},"e":9,"d":[1]}');
  assert.deepEqual(d.find((x) => x.op === 'change'), { op: 'change', path: '$.b.c', from: 2, to: 3 });
  assert.ok(d.some((x) => x.op === 'add' && x.path === '$.e'));
  assert.ok(d.some((x) => x.op === 'remove' && x.path === '$.d[1]'));
  assert.deepEqual(t.diffJson('{"a":1}', '{"a":1}'), []);
});

test('csv survives quotes, commas and newlines', () => {
  const csv = 'name,note\n"Budi, S.","said ""hi""\nagain"';
  const rows = t.csvToJson(csv);
  assert.equal(rows[0].name, 'Budi, S.');
  assert.equal(rows[0].note, 'said "hi"\nagain');
  assert.equal(t.csvToJson(t.jsonToCsv(JSON.stringify(rows)))[0].note, rows[0].note);
});

test('cidr math is right for a /26', () => {
  const r = Object.fromEntries(t.cidrRows('10.0.1.130/26'));
  assert.equal(r.network, '10.0.1.128');
  assert.equal(r.broadcast, '10.0.1.191');
  assert.equal(r['first host'], '10.0.1.129');
  assert.equal(r['usable hosts'], '62');
  assert.equal(Object.fromEntries(t.cidrRows('8.8.8.8/32'))['usable hosts'], '1');
  assert.throws(() => t.cidrRows('300.1.1.1/24'), /octet/);
});

test('cron parses ranges, steps, names and the dom/dow OR rule', () => {
  const c = t.parseCron('*/15 9-17 * jan-feb mon');
  assert.deepEqual([...c.minute], [0, 15, 30, 45]);
  assert.equal(c.hour.size, 9);
  assert.deepEqual([...c.month], [1, 2]);
  assert.deepEqual([...c.dow], [1]);

  // both day fields restricted means OR: the 1st of the month OR any Monday
  const or = t.parseCron('0 0 1 * mon');
  assert.ok(t.cronMatches(or, new Date(2026, 0, 1, 0, 0))); // a Thursday, but the 1st
  assert.ok(t.cronMatches(or, new Date(2026, 0, 5, 0, 0))); // a Monday, not the 1st
  assert.ok(!t.cronMatches(or, new Date(2026, 0, 6, 0, 0)));

  assert.deepEqual([...t.parseCron('@daily').hour], [0]);
  assert.throws(() => t.parseCron('* * *'), /expected 5 fields/);
  assert.throws(() => t.parseCron('99 * * * *'), /outside 0-59/);
});

test('cronNext returns increasing future times', () => {
  const from = new Date(2026, 0, 1, 10, 7);
  const next = t.cronNext(t.parseCron('0 * * * *'), 3, from);
  assert.equal(next.length, 3);
  assert.equal(next[0].getHours(), 11);
  assert.equal(next[0].getMinutes(), 0);
  assert.ok(next[1] > next[0] && next[2] > next[1]);
});

test('cronRows explains the fields and lists the next runs', () => {
  const r = Object.fromEntries(t.cronRows('*/15 9-17 * * mon-fri', new Date(2026, 0, 1, 10, 7)));
  assert.equal(r.minute, '0, 15, 30, 45');
  assert.equal(r['day of month'], 'every');
  assert.equal(r['day of week'], 'mon, tue, wed, thu, fri');
  assert.equal(r['next 5 runs'].split('\n').length, 5);
  assert.match(r['next 5 runs'], /Thu/);
  assert.equal(Object.fromEntries(t.cronRows('0 0 1 * mon')).note.includes('EITHER'), true);
});

test('epochRows and cidrRows format without throwing', () => {
  assert.ok(Object.fromEntries(t.epochRows('1700000000'))['iso 8601'].startsWith('2023-11-14'));
  assert.equal(Object.fromEntries(t.cidrRows('192.168.0.0/24')).netmask, '255.255.255.0');
});

test('scanHidden locates and classifies invisible characters', () => {
  const s = 'a​b c‮d\u{E0041}';
  const { findings, counts, nfc } = t.scanHidden(s);
  assert.deepEqual(
    findings.map((f) => [f.at, f.code, f.cls]),
    [[1, 'U+200B', 'zero-width'], [3, 'U+00A0', 'space'], [5, 'U+202E', 'bidi'], [7, 'U+E0041', 'tag']]
  );
  assert.equal(findings[0].label, 'ZERO WIDTH SPACE');
  assert.deepEqual(counts, { 'zero-width': 1, space: 1, bidi: 1, tag: 1 });
  assert.equal(nfc, true);

  // an astral character is two UTF-16 units and must not be counted twice
  assert.equal(t.scanHidden('hi\u{E0041}').findings.length, 1);
});

test('scanHidden leaves ordinary text alone', () => {
  const clean = t.scanHidden('Halo dunia.\n\tTabs and newlines are fine.');
  assert.deepEqual(clean.findings, []);
  assert.deepEqual(clean.mixed, []);
  assert.equal(clean.nfc, true);
  assert.equal(t.scanHidden('é').nfc, false); // decomposed é
});

test('mixedScriptWords catches a cyrillic lookalike', () => {
  assert.deepEqual(t.mixedScriptWords('pаypal login'), [
    { word: 'pаypal', scripts: ['latin', 'cyrillic'] },
  ]);
  assert.deepEqual(t.mixedScriptWords('plain latin words'), []);

  // the reported word must not carry the invisible characters it was found with
  const [hit] = t.mixedScriptWords('pаypal\u{E0041}');
  assert.equal(hit.word, 'pаypal');
  assert.deepEqual(t.scanHidden(hit.word).findings, []);
});

test('stripHidden folds odd spaces and drops the rest', () => {
  assert.equal(t.stripHidden('a​b c‮d'), 'ab cd');
  assert.equal(t.stripHidden('keep\ttabs\nand newlines'), 'keep\ttabs\nand newlines');
  assert.equal(t.stripHidden('é').normalize('NFC'), 'é');
  assert.deepEqual(t.scanHidden(t.stripHidden('﻿a​‮b')).findings, []);
});
