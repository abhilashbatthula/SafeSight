import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCondition, nextReading } from '../apps/api/src/rules';
import { csvCell, passwordHash, passwordValid } from '../apps/api/src/common';
const limit = {
  threshold: 35,
  consecutive: 3,
  hysteresis: 2,
  recoveryReadings: 3,
};
test('threshold delay resets on an intervening normal sample; hysteresis prevents flapping', () => {
  let state = { breachCount: 0, recoveryCount: 0, active: false };
  for (const v of [36, 36, 34, 36, 36]) {
    state = stepCondition(state, v, limit);
    assert.equal(state.active, false);
  }
  state = stepCondition(state, 36, limit);
  assert.equal(state.active, true);
  for (const v of [34, 33, 34, 32, 32]) {
    state = stepCondition(state, v, limit);
    assert.equal(state.active, true);
  }
  state = stepCondition(state, 32, limit);
  assert.equal(state.active, false);
});
test('seeded variation is deterministic, gradual and bounded over long runs', () => {
  let prev = { temperature: 27, humidity: 52, aqi: 45 };
  for (let i = 0; i < 1000; i++) {
    const next = nextReading(
      prev,
      i < 500 ? 'temperature' : 'recovery',
      123,
      i,
    );
    assert.deepEqual(
      next,
      nextReading(prev, i < 500 ? 'temperature' : 'recovery', 123, i),
    );
    assert.ok(next.temperature >= 15 && next.temperature <= 48);
    assert.ok(Math.abs(next.temperature - prev.temperature) <= 2.4);
    assert.ok(next.aqi >= 10 && next.aqi <= 250);
    assert.ok(next.humidity >= 30 && next.humidity <= 80);
    prev = next;
  }
});
test('CSV neutralizes formula payloads and escapes quotes/newlines', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell(' \t@SUM(A1)'), '"\' \t@SUM(A1)"');
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
});
test('UTC CSV timestamp has no locale or nested JSON quotes', () => {
  assert.equal(
    csvCell(new Date('2026-10-02T12:30:00Z')),
    '"2026-10-02T12:30:00.000Z"',
  );
});

test('salted scrypt authentication and password mismatch', () => {
  const a = passwordHash('correct horse battery');
  assert.notEqual(a, passwordHash('correct horse battery'));
  assert.equal(passwordValid('correct horse battery', a), true);
  assert.equal(passwordValid('wrong password', a), false);
});
