import test from 'node:test';
import assert from 'node:assert/strict';
import { CPU_COOLDOWN_HOURS, cpuCooldownLabel, effectiveCpuLimit, remainingCpuCooldown } from '../app/cpu-level-limits.ts';

test('the ten CPU levels display the configured cooldowns', () => {
  assert.deepEqual([...CPU_COOLDOWN_HOURS], [216, 192, 168, 144, 120, 96, 72, 48, 24, 12]);
  assert.deepEqual(Array.from({length: 10}, (_, index) => cpuCooldownLabel(index + 1)),
    ['9d cooldown', '8d cooldown', '7d cooldown', '6d cooldown', '5d cooldown',
      '4d cooldown', '3d cooldown', '2d cooldown', '1d cooldown', '12h cooldown']);
});

test('a locked level resets its displayed wins when the cooldown expires', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const limit = {level: 10, wins: 3, locked_until: new Date(now + 12 * 3600_000).toISOString()};
  assert.deepEqual(effectiveCpuLimit(limit, now), {wins: 3, locked: true, until: now + 12 * 3600_000});
  assert.equal(remainingCpuCooldown(now + 12 * 3600_000, now), '12h 0m left');
  assert.deepEqual(effectiveCpuLimit(limit, now + 12 * 3600_000), {wins: 0, locked: false, until: now + 12 * 3600_000});
});
