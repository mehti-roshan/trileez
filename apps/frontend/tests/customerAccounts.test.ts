import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createCustomerAccount } from '../src/services/userAdministration.ts';
import type { Customer, User } from '../src/types/index.ts';

const manager: User = { id: 'test-manager', name: 'سرپرست', email: 'manager@test.local', role: 'manager', status: 'online', isActive: true, title: 'سرپرست' };
const company: Customer = { id: 'customer-test', entityType: 'company', name: 'شرکت آزمایشی', company: 'شرکت آزمایشی', currency: 'IRR', status: 'active', groups: [] };

test('non-admin users cannot create customer accounts from the UI', async () => {
  await assert.rejects(
    createCustomerAccount({ actor: manager, customer: company, fullName: 'کاربر غیرمجاز', position: 'مدیر', email: 'unauthorized@test.local', phone: '09120000004', password: 'secure-pass-4' }),
    /فقط مدیر مجاز/,
  );
});

// Company multi-contact and individual-customer uniqueness are server-owned
// and covered by apps/api/test/sensitive-resources.test.ts.
