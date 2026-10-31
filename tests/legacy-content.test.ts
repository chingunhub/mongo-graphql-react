import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from '../server/paths';
test('all 337 original curriculum and Taskforge content files match baseline 845e90b', () => {
  const hashes = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/legacy-content.json'), 'utf8')) as Record<
    string,
    string
  >;
  assert.equal(Object.keys(hashes).length, 337);
  for (const [path, expected] of Object.entries(hashes)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n'))
      .digest('hex');
    assert.equal(actual, expected, path + ' changed');
  }
});
