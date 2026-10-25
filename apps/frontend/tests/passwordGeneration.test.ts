import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateSecurePassword } from '../src/services/userAdministration.ts';

test('generated one-time passwords are strong and random', () => {
  const first = generateSecurePassword();
  const second = generateSecurePassword();
  assert.equal(first.length, 24);
  assert.notEqual(first, second);
  assert.match(first, /[A-Z]/);
  assert.match(first, /[a-z]/);
  assert.match(first, /[2-9]/);
  assert.match(first, /[!@#$%^&*_\-+=]/);
});

test('password generation rejects unsafe short lengths', () => {
  assert.throws(() => generateSecurePassword(15), /حداقل ۱۶/);
});

// Password hashing, reset-token expiry, forced change and credential auditing
// are server-owned and covered by apps/api/test/auth-hardening.test.ts.
