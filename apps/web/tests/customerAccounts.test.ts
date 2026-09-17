import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { currentUser } from '../src/mock/data.ts';
import { customerRepository, userRepository } from '../src/services/repositories.ts';
import { createCustomerAccount } from '../src/services/userAdministration.ts';
import type { User } from '../src/types/index.ts';

const manager: User = { id: 'test-manager', name: 'سرپرست', email: 'manager@test.local', role: 'manager', status: 'online', isActive: true, title: 'سرپرست' };

test('company customers can have multiple positioned users', async () => {
  const company = customerRepository.get('c1');
  assert.ok(company);
  const createdIds: string[] = [];
  try {
    const first = await createCustomerAccount({ actor: currentUser, customer: company, fullName: 'کاربر آزمایشی فناوری', position: 'CTO', email: 'customer-cto@test.local', phone: '09120000001', password: 'secure-pass-1' });
    createdIds.push(first.id);
    const second = await createCustomerAccount({ actor: currentUser, customer: company, fullName: 'کاربر آزمایشی مالی', position: 'CFO', email: 'customer-cfo@test.local', phone: '09120000002', password: 'secure-pass-2' });
    createdIds.push(second.id);
    assert.equal(first.customerId, company.id);
    assert.equal(first.title, 'CTO');
    assert.equal(second.title, 'CFO');
    assert.equal(userRepository.list().filter((user) => createdIds.includes(user.id)).length, 2);
  } finally {
    createdIds.forEach((id) => userRepository.remove(id));
  }
});

test('person customers cannot have a second user', async () => {
  const person = customerRepository.get('c3');
  assert.ok(person);
  await assert.rejects(
    createCustomerAccount({ actor: currentUser, customer: person, fullName: 'کاربر دوم', position: 'مشتری', email: 'second-person@test.local', phone: '09120000003', password: 'secure-pass-3' }),
    /فقط یک حساب/,
  );
});

test('non-admin users cannot create customer accounts', async () => {
  const company = customerRepository.get('c1');
  assert.ok(company);
  await assert.rejects(
    createCustomerAccount({ actor: manager, customer: company, fullName: 'کاربر غیرمجاز', position: 'مدیر', email: 'unauthorized@test.local', phone: '09120000004', password: 'secure-pass-4' }),
    /فقط مدیر مجاز/,
  );
});
