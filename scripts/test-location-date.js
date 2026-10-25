'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const match = source.match(/^function locationDateKey\([\s\S]*?^\}/m);
assert.ok(match, 'locationDateKey helper exists');

function deviceDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function compile(engine) {
  return vm.runInNewContext(`(${match[0]})`, {
    Date, Intl, localDateKey: deviceDateKey, resolveTz: () => '',
    window: engine ? { PT_ENGINE: engine } : {},
  });
}

const instant = new Date('2026-10-25T16:30:00.000Z');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS', name); }

test('uses the local prayer engine location-day key when available', () => {
  const calls = [];
  const key = compile({ zonedToday: (tz, date) => { calls.push([tz, date.getTime()]); return { key: '2026-10-26' }; } });
  assert.equal(key(instant, 'Asia/Tokyo'), '2026-10-26');
  assert.deepEqual(calls, [['Asia/Tokyo', instant.getTime()]]);
});

test('uses Intl timezone conversion when the local engine is unavailable', () => {
  const key = compile(null);
  assert.equal(key(instant, 'Asia/Tokyo'), '2026-10-26');
});

test('falls back to the device date for an invalid or unavailable timezone', () => {
  const key = compile(null);
  assert.equal(key(instant, 'Invalid/Timezone'), deviceDateKey(instant));
  assert.equal(key(instant, ''), deviceDateKey(instant));
});

console.log(`${tests} location-date regression tests passed.`);
