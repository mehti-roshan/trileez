import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { DEFAULT_ORGANIZATION_ID } from '../config/organizations.js';
import { models } from '../models/index.js';
import { storageQuota } from '../services/storageQuota.js';
import { isStorageNotFound, objectStorage } from '../storage/objectStorage.js';
import { hashPassword } from '../utils/password.js';
import { legacyDatabase } from './legacy.js';
import { validateSeedGraph } from './seedVerification.js';
import type { ResourceName } from '../types/entities.js';

type Row = Record<string, unknown>;

const organizationId = DEFAULT_ORGANIZATION_ID;
const date = (value: string) => new Date(value);
const idOf = (value: { _id: unknown }) => String(value._id);

async function upsertModel(name: ResourceName, filter: Row, values: Row, seedId?: string) {
  const model = models[name];
  const usesStringId = model.schema.path('_id')?.instance === 'String';
  return model.findOneAndUpdate(
    { organizationId, ...filter },
    { $set: { organizationId, ...values }, $setOnInsert: usesStringId && seedId ? { _id: seedId } : {} },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
}

async function upsertLegacy(resource: string, id: string, payload: Row) {
  const existing = await legacyDatabase.get(organizationId, resource, id);
  if (existing) return legacyDatabase.update(organizationId, resource, id, payload);
  return legacyDatabase.create(organizationId, resource, { id, ...payload });
}

async function seedFile(input: { key: string; name: string; body: string; uploadedBy: string; projectId?: string; customerId?: string; employeeId?: string; description: string }) {
  const body = Buffer.from(input.body, 'utf8');
  const sha256 = createHash('sha256').update(body).digest('hex');
  const objectKey = `${organizationId}/seed/${input.key}`;
  const existing = await models.FileRecord.findOne({ organizationId, objectKey }).lean();
  let stored: { etag: string };
  try {
    const metadata = await objectStorage.stat(objectKey);
    stored = existing?.sha256 === sha256 && metadata.sizeBytes === body.byteLength
      ? { etag: metadata.etag }
      : await objectStorage.put(objectKey, body, 'text/plain; charset=utf-8');
  } catch (error) {
    if (!isStorageNotFound(error)) throw error;
    stored = await objectStorage.put(objectKey, body, 'text/plain; charset=utf-8');
  }
  const record = await upsertModel('FileRecord', { objectKey }, {
    name: input.name, originalName: input.name, objectKey, bucket: objectStorage.bucket,
    mimeType: 'text/plain', declaredMimeType: 'text/plain', detectedMimeType: 'text/plain', sizeBytes: body.byteLength,
    etag: stored.etag, sha256, uploadedBy: input.uploadedBy, visibility: 'workspace', customerVisible: false,
    projectId: input.projectId, customerId: input.customerId, employeeId: input.employeeId, folderId: 'seed-documents',
    contextKind: input.projectId ? 'project' : input.employeeId ? 'employee' : 'file', contextId: input.projectId || input.employeeId,
    description: input.description, tags: ['seed', 'سند سازمانی'], processingStatus: 'processed', processedAt: new Date(),
    metadataVersion: 1, deletionStatus: 'active', contentVerifiedAt: new Date(),
  });
  const obsoleteObjectKey = `seed/${organizationId}/${input.key}`;
  const obsolete = await models.FileRecord.findOneAndDelete({ organizationId, objectKey: obsoleteObjectKey });
  if (obsolete) await objectStorage.remove(obsoleteObjectKey).catch(() => undefined);
  return record;
}

export async function seedApplicationData(): Promise<Record<string, number>> {
  const adminHash = await hashPassword(env.seedAdminPassword);
  const employeeHash = adminHash;
  const userDefinitions = [
    ['admin', 'سارا محمدی', env.seedAdminEmail, 'admin', 'مدیر عملیات'],
    ['pm', 'علی رضایی', 'manager@trileez.ir', 'manager', 'مدیر پروژه'],
    ['designer', 'مریم حسینی', 'member@trileez.ir', 'member', 'طراح محصول'],
    ['developer', 'حسین کریمی', 'developer@trileez.ir', 'member', 'توسعه‌دهنده ارشد'],
    ['sales', 'نگار صالحی', 'sales@trileez.ir', 'manager', 'سرپرست فروش'],
    ['support', 'فاطمه نوری', 'support@trileez.ir', 'member', 'کارشناس پشتیبانی'],
  ] as const;
  const users = new Map<string, string>();
  for (const [key, name, email, role, title] of userDefinitions) {
    const isSeedAdmin = key === 'admin';
    const now = new Date();
    const document = await models.User.findOneAndUpdate(
      { organizationId, email },
      {
        $set: {
          organizationId, name, email, role, title, status: key === 'support' ? 'away' : 'online', isActive: true,
          permissionOverrides: { additions: [], removals: [] },
          ...(isSeedAdmin ? {
            passwordHash: adminHash, mustChangePassword: false, failedLoginAttempts: 0,
            lastFailedLoginAt: null, lockoutUntil: null, passwordChangedAt: now,
          } : {}),
        },
        $setOnInsert: isSeedAdmin ? {} : { passwordHash: employeeHash },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (isSeedAdmin) {
      await models.AuthSession.updateMany(
        { organizationId, userId: idOf(document), status: 'active' },
        { $set: { status: 'revoked', revokedAt: now, revokedReason: 'seed_admin_password_reset' } },
      );
    }
    users.set(key, idOf(document));
  }
  const user = (key: string) => { const value = users.get(key); if (!value) throw new Error(`Missing seeded user: ${key}`); return value; };

  const employeeDefinitions = [
    ['pm', 'EMP-1002', 'علی رضایی', 'مدیر پروژه', 'مدیریت پروژه', 88_000_000, 520_000],
    ['designer', 'EMP-1003', 'مریم حسینی', 'طراح محصول', 'محصول', 62_000_000, 390_000],
    ['developer', 'EMP-1004', 'حسین کریمی', 'توسعه‌دهنده ارشد', 'فنی', 79_000_000, 480_000],
    ['sales', 'EMP-1005', 'نگار صالحی', 'سرپرست فروش', 'فروش', 68_000_000, 420_000],
    ['support', 'EMP-1006', 'فاطمه نوری', 'کارشناس پشتیبانی', 'پشتیبانی', 49_000_000, 310_000],
  ] as const;
  const employees = new Map<string, string>();
  for (const [key, personnelCode, fullName, jobTitle, department, salary, hourlyRate] of employeeDefinitions) {
    const document = await upsertModel('Employee', { personnelCode }, {
      userId: user(key), personnelCode, fullName, email: userDefinitions.find((item) => item[0] === key)?.[2], phone: `09120000${personnelCode.slice(-3)}`,
      nationalId: `001${personnelCode.slice(-4)}5`, jobTitle, department, managerId: key === 'pm' ? user('admin') : user('pm'),
      employmentType: 'full_time', compensationType: key === 'developer' ? 'hourly_task' : 'full_time_attendance', employmentStatus: 'active', hireDate: date('2024-03-20'), workLocation: 'دفتر مرکزی تهران',
      workMode: key === 'developer' ? 'دورکاری' : 'ترکیبی', salary, hourlyRate, leaveBalance: 12, hasGuarantee: true, guaranteeAmount: 500_000_000,
    });
    employees.set(key, idOf(document));
  }
  const employee = (key: string) => { const value = employees.get(key); if (!value) throw new Error(`Missing seeded employee: ${key}`); return value; };

  const customerDefinitions = [
    ['sepehr', 'C-1001', 'فروشگاه زنجیره‌ای سپهر', 'finance@sepehr.example', 860_000_000, user('sales')],
    ['bank', 'C-1002', 'بانک توسعه تعاون شعبه مرکزی', 'it@ttbank.example', 1_240_000_000, user('pm')],
    ['clinic', 'C-1003', 'کلینیک هوشمند زندگی', 'office@zendegi.example', 275_000_000, user('support')],
  ] as const;
  const customers = new Map<string, string>();
  for (const [key, code, company, email, value, assignedTo] of customerDefinitions) {
    const document = await upsertModel('Customer', { code }, {
      code, entityType: 'company', name: company, company, email, phone: '021-88776655', additionalPhones: ['09121234567'],
      nationalCode: `1400${code.slice(-4)}`, vatRegistrationNumber: `4111763${code.slice(-4)}`, groups: ['سازمانی', 'مشتریان کلیدی'],
      currency: 'IRR', country: 'ایران', province: 'تهران', city: 'تهران', postalCode: '1439812345', address: 'تهران، خیابان ولیعصر، دفتر مرکزی',
      website: `https://${key}.example`, status: 'active', value, lastContact: date('2026-09-25'), assignedTo, createdBy: user('admin'), updatedBy: user('admin'),
    }, `seed-customer-${key}`);
    customers.set(key, idOf(document));
  }
  const customer = (key: string) => { const value = customers.get(key); if (!value) throw new Error(`Missing seeded customer: ${key}`); return value; };

  const projectDefinitions = [
    ['sales-platform', 'TRX-001', 'توسعه سامانه فروش سپهر', 'sepehr', 'pm', ['pm', 'designer', 'developer', 'sales'], 68, 860_000_000],
    ['bank-infra', 'TRX-002', 'پیاده‌سازی زیرساخت بانک', 'bank', 'pm', ['pm', 'developer', 'support'], 44, 1_240_000_000],
    ['clinic-portal', 'TRX-003', 'پرتال خدمات کلینیک زندگی', 'clinic', 'designer', ['designer', 'developer', 'support'], 82, 275_000_000],
  ] as const;
  const projects = new Map<string, string>();
  for (const [key, code, name, customerKey, managerKey, memberKeys, progress, budget] of projectDefinitions) {
    const document = await upsertModel('Project', { code }, {
      code, name, description: `پروژه واقعی و متصل به داده‌های فروش، وظایف و مالی برای ${name}`, customerId: customer(customerKey), managerId: user(managerKey),
      status: 'active', progress, startDate: date('2026-03-01'), endDate: date('2026-12-20'), members: memberKeys.map(user),
      tasksCount: 3, completedTasksCount: key === 'clinic-portal' ? 2 : 1, plannedHours: 520, estimatedHours: 480, actualHours: 196,
      budget, grade: key === 'sales-platform' ? 92 : 86, tags: ['MVP', 'مشتری سازمانی'], color: key === 'bank-infra' ? '#059669' : '#1E3A8A',
    });
    projects.set(key, idOf(document));
  }
  const project = (key: string) => { const value = projects.get(key); if (!value) throw new Error(`Missing seeded project: ${key}`); return value; };

  const roles = new Map<string, string>();
  const members = new Map<string, string>();
  const phases = new Map<string, string>();
  const activities = new Map<string, string>();
  for (const [projectKey, , , , managerKey, memberKeys] of projectDefinitions) {
    const projectId = project(projectKey);
    for (const role of [
      { key: 'manager', name: 'مدیر پروژه', hours: 120, skills: ['برنامه‌ریزی', 'رهبری'] },
      { key: 'delivery', name: 'تیم اجرا', hours: 360, skills: ['تحلیل', 'پیاده‌سازی', 'کنترل کیفیت'] },
    ]) {
      const roleId = `seed-role-${projectKey}-${role.key}`;
      await upsertModel('ProjectRole', { _id: roleId }, { projectId, name: role.name, description: `نقش ${role.name} در پروژه`, responsibilities: ['تحویل به‌موقع', 'گزارش شفاف'], objectives: ['رضایت مشتری', 'کیفیت تحویل'], requiredSkills: role.skills, expectedHours: role.hours, customerVisible: true, createdBy: user('admin'), updatedBy: user('admin') }, roleId);
      roles.set(`${projectKey}:${role.key}`, roleId);
      const activityId = `seed-activity-${projectKey}-${role.key}`;
      await upsertModel('ProjectActivity', { _id: activityId }, { projectId, roleId, title: role.key === 'manager' ? 'هماهنگی و کنترل پروژه' : 'اجرای فنی و تحویل', description: 'فعالیت اصلی نقش در پروژه', objective: 'تحویل قابل سنجش', expectedHours: role.hours, customerVisible: true, createdBy: user('admin'), updatedBy: user('admin') }, activityId);
      activities.set(`${projectKey}:${role.key}`, activityId);
    }
    for (const memberKey of memberKeys) {
      const memberId = `seed-member-${projectKey}-${memberKey}`;
      const isManager = memberKey === managerKey;
      await upsertModel('ProjectMember', { _id: memberId }, { projectId, personId: user(memberKey), role: isManager ? 'مدیر پروژه' : 'عضو تیم اجرا', roleIds: [roles.get(`${projectKey}:${isManager ? 'manager' : 'delivery'}`)], status: 'active', joinedAt: date('2026-03-01'), hourlyCost: 350_000, responsibilities: isManager ? 'مدیریت دامنه، زمان و مشتری' : 'اجرای فعالیت‌های تخصصی', createdBy: user('admin'), updatedBy: user('admin') }, memberId);
      members.set(`${projectKey}:${memberKey}`, memberId);
    }
    for (const [phaseKey, title, progress, status] of [['discovery', 'تحلیل و طراحی', 100, 'completed'], ['delivery', 'پیاده‌سازی و تحویل', projectKey === 'clinic-portal' ? 80 : 45, 'in_progress']] as const) {
      const phaseId = `seed-phase-${projectKey}-${phaseKey}`;
      await upsertModel('ProjectPhase', { _id: phaseId }, { projectId, title, status, startDate: date(phaseKey === 'discovery' ? '2026-03-01' : '2026-05-01'), endDate: date(phaseKey === 'discovery' ? '2026-04-30' : '2026-12-20'), progress, managerId: user(managerKey), description: `فاز ${title}`, customerVisible: true, plannedHours: 240, estimatedHours: 220, actualHours: progress === 100 ? 215 : 110, createdBy: user('admin'), updatedBy: user('admin') }, phaseId);
      phases.set(`${projectKey}:${phaseKey}`, phaseId);
    }
  }

  const taskDefinitions = [
    ['sales-analysis', 'sales-platform', 'تحلیل قیف فروش و نیازمندی‌ها', 'designer', 'discovery', 'done', 54],
    ['sales-api', 'sales-platform', 'پیاده‌سازی API سفارش و پرداخت', 'developer', 'delivery', 'in_progress', 120],
    ['sales-qa', 'sales-platform', 'آزمون پذیرش مشتری', 'sales', 'delivery', 'todo', 40],
    ['bank-agent', 'bank-infra', 'استقرار Agent روی شعب آزمایشی', 'developer', 'delivery', 'in_progress', 96],
    ['bank-training', 'bank-infra', 'آموزش تیم پشتیبانی بانک', 'support', 'delivery', 'todo', 32],
    ['clinic-ui', 'clinic-portal', 'طراحی رابط رزرو نوبت', 'designer', 'discovery', 'done', 64],
    ['clinic-launch', 'clinic-portal', 'راه‌اندازی نسخه عملیاتی', 'developer', 'delivery', 'review', 88],
  ] as const;
  const tasks = new Map<string, string>();
  for (const [key, projectKey, title, assigneeKey, phaseKey, status, estimatedHours] of taskDefinitions) {
    const projectId = project(projectKey);
    const document = await upsertModel('Task', { projectId, title }, {
      title, description: `وظیفه متصل به پروژه ${projectKey}`, projectId, phaseId: phases.get(`${projectKey}:${phaseKey}`), activityId: activities.get(`${projectKey}:delivery`),
      assigneeId: user(assigneeKey), assigneeIds: [user(assigneeKey)], assigneeMemberIds: [members.get(`${projectKey}:${assigneeKey}`)], followerIds: [user('pm')], creatorId: user('pm'),
      status, priority: status === 'todo' ? 'medium' : 'high', startDate: date('2026-09-01'), dueDate: date('2026-10-20'), estimatedHours, loggedHours: status === 'done' ? estimatedHours : Math.round(estimatedHours * .45),
      hourlyRate: 450_000, customerVisible: true, attachments: [], tags: ['seed', phaseKey], labelIds: ['seed-label-important'], createdBy: user('pm'), updatedBy: user('pm'),
    });
    tasks.set(key, idOf(document));
  }
  const task = (key: string) => { const value = tasks.get(key); if (!value) throw new Error(`Missing seeded task: ${key}`); return value; };

  const timeEntries = [
    ['te-1', 'designer', 'sales-analysis', 7.5, '2026-09-10'], ['te-2', 'developer', 'sales-api', 8, '2026-09-11'],
    ['te-3', 'developer', 'bank-agent', 6.5, '2026-09-12'], ['te-4', 'support', 'bank-training', 4, '2026-09-14'],
    ['te-5', 'designer', 'clinic-ui', 8, '2026-09-15'], ['te-6', 'developer', 'clinic-launch', 7, '2026-09-16'],
  ] as const;
  const timeEntryIds: string[] = [];
  for (const [key, employeeKey, taskKey, hours, workDate] of timeEntries) {
    const taskDef = taskDefinitions.find((item) => item[0] === taskKey)!;
    const timeId = `seed-${key}`; timeEntryIds.push(timeId);
    await upsertModel('TimeEntry', { _id: timeId }, { employeeId: employee(employeeKey), projectId: project(taskDef[1]), taskId: task(taskKey), date: date(workDate), hours, hourlyRate: 450_000, calculatedCost: hours * 450_000, billable: true, billingStatus: 'payment_queued', customerVisible: false, description: `ثبت زمان برای ${taskDef[2]}`, status: 'approved', createdBy: user(employeeKey), updatedBy: user('pm') }, timeId);
  }

  await upsertModel('Meeting', { title: 'جلسه وضعیت هفتگی سامانه فروش', projectId: project('sales-platform') }, { title: 'جلسه وضعیت هفتگی سامانه فروش', startAt: date('2026-10-03T09:00:00+03:30'), durationMinutes: 75, status: 'scheduled', organizerId: user('pm'), participantIds: [user('pm'), user('designer'), user('developer'), user('sales')], projectId: project('sales-platform'), employeeIds: [employee('pm'), employee('designer'), employee('developer'), employee('sales')], departments: ['مدیریت پروژه', 'محصول', 'فنی', 'فروش'], customerId: customer('sepehr'), location: 'اتاق جلسات مرکزی', agenda: 'مرور پیشرفت، ریسک‌ها و پذیرش مشتری', description: 'جلسه کامل مدیریت پروژه', decisions: 'تمرکز هفته بعد بر تکمیل API پرداخت', actionItems: 'آماده‌سازی نسخه UAT و گزارش تست', followUpActions: 'ارسال صورت وضعیت برای مشتری', taskIds: [task('sales-api'), task('sales-qa')], attachments: [], createdBy: user('pm'), updatedBy: user('pm') });
  await upsertModel('Meeting', { title: 'جلسه تحویل پرتال کلینیک', projectId: project('clinic-portal') }, { title: 'جلسه تحویل پرتال کلینیک', startAt: date('2026-09-28T11:00:00+03:30'), durationMinutes: 60, status: 'completed', organizerId: user('designer'), participantIds: [user('designer'), user('developer'), user('support')], projectId: project('clinic-portal'), employeeIds: [employee('designer'), employee('developer'), employee('support')], departments: ['محصول', 'فنی', 'پشتیبانی'], customerId: customer('clinic'), agenda: 'پذیرش نسخه عملیاتی', outcome: 'نسخه با دو اصلاح جزئی پذیرفته شد', notes: 'صورتجلسه در همین رکورد نگهداری می‌شود', taskIds: [task('clinic-launch')], attachments: [], createdBy: user('designer'), updatedBy: user('designer') });

  for (const [key, projectKey, title, eventType, eventDate] of [
    ['sales-kickoff', 'sales-platform', 'آغاز رسمی پروژه', 'مهم‌ترین نقطه عطف', '2026-03-01'],
    ['bank-member', 'bank-infra', 'پیوستن کارشناس پشتیبانی به پروژه', 'پیوستن عضو به پروژه', '2026-06-10'],
    ['clinic-approved', 'clinic-portal', 'تأیید نسخه توسط مشتری', 'تأیید مشتری', '2026-09-28'],
  ] as const) await upsertModel('ProjectEvent', { systemKey: `seed:${key}` }, { projectId: project(projectKey), eventType, date: date(eventDate), title, description: `${title} و ثبت آن در تاریخچه پروژه`, stage: 'انجام شد', priority: 'بالا', status: 'completed', result: 'ثبت و تأیید شد', customerVisible: true, createdBy: user('pm'), registeredBy: user('pm'), source: 'system', systemKey: `seed:${key}` });

  const productRows = [
    ['seed-product-development', 'توسعه نرم‌افزار سفارشی', 'SRV-DEV', 450_000_000],
    ['seed-product-support', 'پشتیبانی سالانه سامانه', 'SRV-SUP', 120_000_000],
    ['seed-product-infra', 'استقرار زیرساخت و Agent', 'SRV-INF', 680_000_000],
  ] as const;
  for (const [id, name, sku, price] of productRows) await upsertLegacy('products', id, { name, sku, category: 'خدمات حرفه‌ای', type: 'خدمات', unit: 'پروژه', price, taxRate: 10, stock: 0, active: true, updatedAt: date('2026-09-20') });

  const contract1 = await upsertModel('Contract', { number: 'CTR-1405-001' }, { number: 'CTR-1405-001', customerId: customer('sepehr'), projectId: project('sales-platform'), title: 'قرارداد توسعه سامانه فروش', amount: 860_000_000, startDate: date('2026-03-01'), endDate: date('2026-12-20'), status: 'active', renewal: true, ownerId: user('sales'), paymentTerms: '۳۰٪ پیش‌پرداخت، ۴۰٪ میانه، ۳۰٪ تحویل', customerVisible: true, createdBy: user('sales'), updatedBy: user('sales') }, 'seed-contract-sales');
  const invoice1 = await upsertModel('Invoice', { number: 'INV-1405-1001' }, { number: 'INV-1405-1001', customerId: customer('sepehr'), projectId: project('sales-platform'), contractId: idOf(contract1), amount: 344_000_000, paidAmount: 344_000_000, status: 'paid', issuedAt: date('2026-08-20'), dueDate: date('2026-09-05'), items: [{ productId: 'seed-product-development', quantity: 1, unitPrice: 344_000_000, discount: 0, tax: 0 }], createdBy: user('sales'), updatedBy: user('sales') }, 'seed-invoice-sales-1');
  await upsertModel('Payment', { receiptNumber: 'RCPT-1405-801' }, { receiptNumber: 'RCPT-1405-801', customerId: customer('sepehr'), invoiceId: idOf(invoice1), projectId: project('sales-platform'), amount: 344_000_000, method: 'انتقال بانکی', paidAt: date('2026-09-02'), reference: 'IR-SEPA-984321', status: 'تایید شده', createdBy: user('sales'), updatedBy: user('sales') }, 'seed-payment-sales-1');
  await upsertModel('Installment', { contractId: idOf(contract1), number: 2 }, { contractId: idOf(contract1), invoiceId: idOf(invoice1), customerId: customer('sepehr'), projectId: project('sales-platform'), number: 2, dueDate: date('2026-11-15'), amount: 258_000_000, paidAmount: 0, status: 'future', createdBy: user('sales'), updatedBy: user('sales') }, 'seed-installment-sales-2');
  await upsertModel('ProjectSale', { documentNumber: 'SALE-1405-001' }, { projectId: project('sales-platform'), customerId: customer('sepehr'), title: 'فروش فاز توسعه و استقرار', amount: 344_000_000, type: 'فاکتور پروژه', status: 'paid', date: date('2026-08-20'), documentNumber: 'SALE-1405-001', createdBy: user('sales'), updatedBy: user('sales') }, 'seed-sale-1');
  const supplier = await upsertModel('Supplier', { name: 'شرکت زیرساخت ابری آریا' }, { name: 'شرکت زیرساخت ابری آریا', contactName: 'رضا میرزایی', phone: '021-44445555', email: 'billing@arya-cloud.example', balance: 48_000_000, type: 'supplier', createdBy: user('admin'), updatedBy: user('admin') }, 'seed-supplier-cloud');
  const bank = await upsertModel('BankAccount', { maskedNumber: '****-****-****-6210' }, { bankName: 'بانک ملت', label: 'حساب عملیاتی شرکت', maskedNumber: '****-****-****-6210', accountType: 'جاری', balance: 2_480_000_000, status: 'active', createdBy: user('admin'), updatedBy: user('admin') }, 'seed-bank-main');
  await upsertModel('Expense', { title: 'هزینه زیرساخت ابری شهریور', date: date('2026-09-25') }, { title: 'هزینه زیرساخت ابری شهریور', category: 'زیرساخت', projectId: project('bank-infra'), supplierId: idOf(supplier), amount: 48_000_000, date: date('2026-09-25'), status: 'paid', paymentMethod: 'انتقال بانکی', bankAccountId: idOf(bank), description: 'هزینه ماهانه سرورها و پشتیبان‌گیری', createdBy: user('admin'), updatedBy: user('admin') }, 'seed-expense-cloud');

  const compensationIds = new Map<string, string>();
  for (const key of ['pm', 'designer', 'developer', 'sales', 'support']) {
    const salary = Number(employeeDefinitions.find((item) => item[0] === key)?.[5] || 0);
    const hourlyRate = Number(employeeDefinitions.find((item) => item[0] === key)?.[6] || 0);
    const paymentMethod = key === 'developer' ? 'hourly_task' : 'full_time_attendance';
    const compensationId = `seed-compensation-${key}-2026`;
    const compensation = await upsertModel('EmploymentCompensation', { _id: compensationId }, {
      employeeId: employee(key), paymentMethod, effectiveFrom: date('2026-01-01'), currency: 'IRR', payPeriod: 'monthly',
      hourlyRate: paymentMethod === 'hourly_task' ? hourlyRate : undefined,
      monthlySalary: paymentMethod === 'full_time_attendance' ? salary : undefined,
      expectedSchedule: paymentMethod === 'full_time_attendance' ? {
        timezone: 'Asia/Tehran', days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, expectedMinutes: 480 })), weeklyExpectedMinutes: 2_400,
      } : { timezone: 'Asia/Tehran', days: [], weeklyExpectedMinutes: 0 },
      overtimeEnabled: paymentMethod === 'full_time_attendance', overtimeRateMultiplier: 1.4, status: 'active',
      notes: paymentMethod === 'hourly_task' ? 'پرداخت بر مبنای زمان تاییدشده وظایف پروژه' : 'پرداخت تمام‌وقت بر مبنای حضور تاییدشده',
      createdBy: user('admin'), updatedBy: user('admin'),
    }, compensationId);
    compensationIds.set(key, idOf(compensation));
    const approvedTaskMinutes = timeEntries
      .filter((entry) => entry[1] === key)
      .reduce((sum, entry) => sum + Number(entry[3]) * 60, 0);
    const attendanceMinutes = paymentMethod === 'full_time_attendance' ? 176 * 60 : 0;
    const payrollMinutes = paymentMethod === 'hourly_task' ? approvedTaskMinutes : attendanceMinutes;
    const baseSalary = paymentMethod === 'hourly_task' ? Math.round(payrollMinutes / 60 * hourlyRate) : salary;
    const payrollId = `seed-payroll-${key}-1405-06`;
    const bonusId = `${payrollId}-bonus`;
    const deductionId = `${payrollId}-deduction`;
    await upsertModel('PayrollAdjustment', { _id: bonusId }, { payrollId, employeeId: employee(key), type: 'bonus', amount: 5_000_000, reason: 'پاداش عملکرد دوره', adjustmentDate: date('2026-09-20'), createdBy: user('admin'), updatedBy: user('admin') }, bonusId);
    await upsertModel('PayrollAdjustment', { _id: deductionId }, { payrollId, employeeId: employee(key), type: 'deduction', amount: 2_000_000, reason: 'کسورات تاییدشده دوره', adjustmentDate: date('2026-09-20'), createdBy: user('admin'), updatedBy: user('admin') }, deductionId);
    const taskLines = paymentMethod === 'hourly_task' ? timeEntries.filter((entry) => entry[1] === key).map((entry) => {
      const definition = taskDefinitions.find((item) => item[0] === entry[2])!;
      return { timeEntryId: `seed-${entry[0]}`, projectId: project(definition[1]), taskId: task(entry[2]), date: date(entry[4]), minutes: entry[3] * 60, hourlyRate, amount: entry[3] * hourlyRate };
    }) : [];
    const overtimeAmount = 4_000_000;
    const bonusAmount = 5_000_000;
    const deductionAmount = 2_000_000;
    const grossAmount = baseSalary + overtimeAmount + bonusAmount;
    const finalPayableAmount = grossAmount - deductionAmount;
    const workflowStatus = key === 'support' ? 'approved' : 'paid';
    const artifactCode = `20260823-${createHash('sha256').update(payrollId).digest('hex').slice(0, 10).toUpperCase()}`;
    const paymentRecordId = `payroll-payment-${payrollId}`;
    const paymentDocumentId = `payroll-payment-document-${payrollId}`;
    const paymentReference = `SEED-SAL-${artifactCode}`;
    const paymentDocumentNumber = `SAL-DOC-${artifactCode}`;
    await upsertModel('PayrollRecord', { employeeId: employee(key), month: 'شهریور ۱۴۰۵' }, {
      employeeId: employee(key), compensationId: compensationIds.get(key), paymentMethod, month: 'شهریور ۱۴۰۵',
      periodStart: date('2026-08-23'), periodEnd: date('2026-09-22'), taskTimeMinutes: approvedTaskMinutes, attendanceMinutes,
      payrollMinutes, expectedMinutes: attendanceMinutes, regularMinutes: attendanceMinutes, overtimeMinutes: 8 * 60,
      absenceMinutes: 0, approvedLeaveMinutes: 0, baseSalary, workedHours: payrollMinutes / 60,
      hourlyRate: paymentMethod === 'hourly_task' ? hourlyRate : 0, overtime: overtimeAmount, overtimeHours: 8,
      benefits: bonusAmount, adjustments: 0, deductions: deductionAmount, tax: 0, netSalary: finalPayableAmount,
      grossBaseAmount: baseSalary, overtimeAmount, bonusAmount, adjustmentCreditAmount: 0, adjustmentDebitAmount: 0,
      deductionAmount, grossAmount, finalPayableAmount,
      compensationSnapshot: {
        compensationId: compensationIds.get(key), paymentMethod, currency: 'IRR', payPeriod: 'monthly',
        hourlyRate: paymentMethod === 'hourly_task' ? hourlyRate : undefined,
        monthlySalary: paymentMethod === 'full_time_attendance' ? salary : undefined,
        overtimeEnabled: paymentMethod === 'full_time_attendance', overtimeRateMultiplier: 1.4,
        expectedSchedule: paymentMethod === 'full_time_attendance'
          ? { timezone: 'Asia/Tehran', days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, expectedMinutes: 480 })), weeklyExpectedMinutes: 2_400 }
          : { timezone: 'Asia/Tehran', days: [], weeklyExpectedMinutes: 0 },
      },
      taskLines, attendanceLines: [], adjustmentSnapshots: [
        { adjustmentId: bonusId, type: 'bonus', amount: bonusAmount, reason: 'پاداش عملکرد دوره', adjustmentDate: date('2026-09-20'), createdBy: user('admin') },
        { adjustmentId: deductionId, type: 'deduction', amount: deductionAmount, reason: 'کسورات تاییدشده دوره', adjustmentDate: date('2026-09-20'), createdBy: user('admin') },
      ],
      calculationVersion: 1, status: workflowStatus, calculatedAt: date('2026-09-23'), calculatedBy: user('admin'),
      reviewedAt: date('2026-09-24'), reviewedBy: user('admin'), approvedAt: date('2026-09-25'), approvedBy: user('admin'),
      paidAt: workflowStatus === 'paid' ? date('2026-09-30') : undefined, paidBy: workflowStatus === 'paid' ? user('admin') : undefined,
      paymentNote: workflowStatus === 'paid' ? 'پرداخت ثبت‌شده در داده نمونه؛ بدون اتصال بانکی' : undefined,
      paymentRecordId: workflowStatus === 'paid' ? paymentRecordId : undefined,
      paymentDocumentId: workflowStatus === 'paid' ? paymentDocumentId : undefined,
      paymentReference: workflowStatus === 'paid' ? paymentReference : undefined,
      paymentDocumentNumber: workflowStatus === 'paid' ? paymentDocumentNumber : undefined,
      accountingSubmissionStatus: workflowStatus === 'paid' ? 'not_submitted' : undefined,
      createdBy: user('admin'), updatedBy: user('admin'),
    }, payrollId);
    if (workflowStatus === 'paid') {
      const employeeDefinition = employeeDefinitions.find((item) => item[0] === key)!;
      await upsertModel('PayrollPayment', { payrollId }, {
        payrollId, employeeId: employee(key), receiptNumber: `SAL-${artifactCode}`, amount: finalPayableAmount, currency: 'IRR',
        paidAt: date('2026-09-30'), settlementMethod: 'bank_transfer', reference: paymentReference,
        note: 'پرداخت نمونه ثبت‌شده؛ هنوز به سامانه حسابداری ارسال نشده است.', status: 'recorded',
        accountingSubmissionStatus: 'not_submitted', createdBy: user('admin'), updatedBy: user('admin'),
      }, paymentRecordId);
      await upsertModel('PayrollPaymentDocument', { payrollId }, {
        payrollId, paymentId: paymentRecordId, employeeId: employee(key), documentNumber: paymentDocumentNumber,
        title: `سند پرداخت حقوق ${employeeDefinition[2]} - شهریور ۱۴۰۵`, payrollMonth: 'شهریور ۱۴۰۵',
        periodStart: date('2026-08-23'), periodEnd: date('2026-09-22'), amount: finalPayableAmount, currency: 'IRR',
        paidAt: date('2026-09-30'), settlementMethod: 'bank_transfer', reference: paymentReference,
        status: 'issued', accountingSubmissionStatus: 'not_submitted',
        snapshot: { employeeId: employee(key), employeeName: employeeDefinition[2], personnelCode: employeeDefinition[1], compensationMethod: paymentMethod, grossBaseAmount: baseSalary, overtimeAmount, bonusAmount, adjustmentCreditAmount: 0, adjustmentDebitAmount: 0, deductionAmount, grossAmount, finalPayableAmount, taskLines, attendanceLines: [] },
        createdBy: user('admin'), updatedBy: user('admin'),
      }, paymentDocumentId);
    }
    await upsertModel('EmployeeContract', { _id: `seed-employee-contract-${key}` }, { employeeId: employee(key), type: 'تمام‌وقت', startDate: date('2026-03-20'), endDate: date('2027-03-20'), status: 'active', hourlyRate: Number(employeeDefinitions.find((item) => item[0] === key)?.[6] || 0), description: 'قرارداد همکاری سالانه', signed: true, createdBy: user('admin'), updatedBy: user('admin') }, `seed-employee-contract-${key}`);
  }
  await upsertModel('AttendanceRecord', { employeeId: employee('pm'), date: date('2026-09-30') }, { employeeId: employee('pm'), compensationId: compensationIds.get('pm'), date: date('2026-09-30'), clockIn: date('2026-09-30T08:42:00+03:30'), clockOut: date('2026-09-30T17:36:00+03:30'), status: 'present', approvalStatus: 'approved', expectedMinutes: 480, workedMinutes: 534, regularMinutes: 480, overtimeMinutes: 54, absenceMinutes: 0, approvedLeaveMinutes: 0, source: 'clock', notes: 'حضور دفتر مرکزی', approvedBy: user('admin'), approvedAt: date('2026-09-30T18:00:00+03:30'), createdBy: user('pm'), updatedBy: user('admin') }, 'seed-attendance-pm-2026-09-30');
  await upsertModel('PerformancePeriod', { employeeId: employee('developer'), periodKey: '1405-06' }, { employeeId: employee('developer'), periodKey: '1405-06', title: 'ارزیابی شهریور ۱۴۰۵', score: 91, baselineScore: 80, adjustmentTotal: 11, eventIds: [], grade: 'A', trend: 'up', status: 'finalized', evaluatedBy: user('pm'), notes: 'تحویل پایدار و همکاری موثر', startedAt: date('2026-08-23'), endedAt: date('2026-09-22'), finalizedAt: date('2026-09-24'), version: 1 });
  await upsertModel('PerformanceEvent', { employeeId: employee('developer'), periodKey: '1405-07', reason: 'رفع بحرانی اختلال سرویس' }, { employeeId: employee('developer'), periodKey: '1405-07', reason: 'رفع بحرانی اختلال سرویس', category: 'عملکرد پروژه', points: 8, date: date('2026-09-27'), description: 'رفع اختلال زیرساخت بانک پیش از زمان SLA', projectId: project('bank-infra'), taskId: task('bank-agent'), createdBy: user('pm') });

  const projectFile = await seedFile({ key: 'sales-acceptance.txt', name: 'صورتجلسه پذیرش سامانه فروش.txt', body: 'صورتجلسه پذیرش داخلی پروژه توسعه سامانه فروش سپهر\nوضعیت: مورد تایید مشروط\nاقدام بعدی: تکمیل آزمون UAT', uploadedBy: user('pm'), projectId: project('sales-platform'), customerId: customer('sepehr'), description: 'سند پذیرش پروژه فروش' });
  const hrFile = await seedFile({ key: 'employee-handbook.txt', name: 'راهنمای داخلی کارکنان.txt', body: 'راهنمای داخلی کارکنان تری‌لیز\nمرخصی، ثبت زمان، امنیت اطلاعات و فرایندهای منابع انسانی.', uploadedBy: user('admin'), employeeId: employee('pm'), description: 'راهنمای منابع انسانی' });
  await upsertLegacy('file-folders', 'seed-folder-documents', { name: 'اسناد نمونه سازمان', parentId: 'root', createdAt: date('2026-09-01') });
  await upsertLegacy('documents-v2', 'seed-document-sales-acceptance', { documentType: 'acceptance', title: 'صورتجلسه پذیرش سامانه فروش', documentNumber: 'ACC-SEED-001', summary: 'صورتجلسه پذیرش داخلی پروژه توسعه سامانه فروش سپهر و اقدامات باقی‌مانده آزمون پذیرش.', projectId: project('sales-platform'), customerId: customer('sepehr'), requestedDate: date('2026-09-27'), acceptedDate: date('2026-09-28'), attachments: ['صورتجلسه پذیرش سامانه فروش.txt'], fileRecordIds: [idOf(projectFile)], status: 'accepted', customerVisible: false, createdBy: user('pm'), createdAt: date('2026-09-28'), updatedAt: date('2026-09-28') });
  await upsertLegacy('documents-v2', 'seed-document-employee-handbook', { documentType: 'other', title: 'راهنمای داخلی کارکنان', documentNumber: 'DOC-SEED-001', summary: 'راهنمای داخلی کارکنان درباره مرخصی، ثبت زمان، امنیت اطلاعات و فرایندهای منابع انسانی.', employeeId: employee('pm'), attachments: ['راهنمای داخلی کارکنان.txt'], fileRecordIds: [idOf(hrFile)], status: 'active', customerVisible: false, createdBy: user('admin'), createdAt: date('2026-09-01'), updatedAt: date('2026-09-01') });

  await upsertLegacy('leads', 'seed-lead-arya', { name: 'کاوه مرادی', company: 'صنایع آریا برق', email: 'moradi@aryabargh.example', phone: '09121112233', estimatedValue: 640_000_000, status: 'active', stage: 'qualified', source: 'معرفی مشتری', notes: 'نیازمند سامانه نگهداری تجهیزات', createdAt: date('2026-09-10'), lastContactAt: date('2026-09-29'), nextFollowUpAt: date('2026-10-05'), assignedTo: user('sales'), tags: ['صنعتی', 'اولویت بالا'] });
  await upsertLegacy('lead-activities', 'seed-lead-activity-arya-1', { leadId: 'seed-lead-arya', type: 'meeting', title: 'جلسه شناخت نیاز', description: 'دامنه اولیه و بودجه تقریبی تایید شد.', occurredAt: date('2026-09-29'), actorId: user('sales') });
  await upsertLegacy('proposals', 'seed-proposal-arya-1', { number: 'PR-1405-021', customerId: customer('sepehr'), title: 'پیشنهاد فاز پشتیبانی سالانه', amount: 120_000_000, status: 'sent', issuedAt: date('2026-09-26'), validUntil: date('2026-10-15'), ownerId: user('sales'), updatedAt: date('2026-09-26'), items: [{ productId: 'seed-product-support', quantity: 1, unitPrice: 120_000_000, discount: 0, tax: 0 }] });
  await upsertLegacy('tickets', 'seed-ticket-sales-sync', { title: 'عدم همگام‌سازی سفارش‌های شعبه', description: 'سفارش‌های شعبه اصفهان پس از نیمه‌شب نمایش داده نمی‌شوند.', status: 'open', priority: 'high', category: 'bug', assigneeId: user('developer'), reporterId: user('support'), projectId: project('sales-platform'), customerId: customer('sepehr'), customerVisible: true, createdAt: date('2026-09-29'), updatedAt: date('2026-09-30'), tags: ['همگام‌سازی'] });
  await upsertLegacy('tickets', 'seed-ticket-bank-report', { title: 'درخواست گزارش حضور دستگاه‌ها', description: 'گزارش روزانه وضعیت Agent شعب موردنیاز است.', status: 'in_progress', priority: 'medium', category: 'feature', assigneeId: user('support'), reporterId: user('pm'), projectId: project('bank-infra'), customerId: customer('bank'), customerVisible: true, createdAt: date('2026-09-27'), updatedAt: date('2026-09-30'), tags: ['گزارش'] });
  await upsertLegacy('notifications', 'seed-notification-task', { title: 'وظیفه نزدیک به موعد', body: 'پیاده‌سازی API سفارش و پرداخت تا ۲۰ مهر موعد دارد.', createdAt: date('2026-09-30T09:00:00+03:30'), read: false, type: 'task_assigned', taskId: task('sales-api'), projectId: project('sales-platform'), recipientId: user('developer'), actorId: user('pm'), entityType: 'task', entityId: task('sales-api') });
  await upsertLegacy('goals', 'seed-goal-sales-quarter', { title: 'تکمیل تحویل‌های فصل پاییز', ownerId: user('pm'), department: 'مدیریت پروژه', period: 'پاییز ۱۴۰۵', target: 100, current: 68, progress: 68, status: 'in_progress', dueDate: date('2026-12-21'), description: 'تحویل سه پروژه کلیدی تا پایان فصل', createdAt: date('2026-09-23') });
  await upsertLegacy('leave-requests', 'seed-leave-support-1', { employeeId: employee('support'), leaveType: 'annual', startDate: '2026-10-10', endDate: '2026-10-11', days: 2, reason: 'امور شخصی', status: 'approved', approverId: user('pm'), createdAt: date('2026-09-25') });
  await upsertLegacy('missions', 'seed-mission-pm-bank', { employeeId: employee('pm'), destination: 'اصفهان', purpose: 'بازدید از شعب آزمایشی بانک', startDate: '2026-10-06', endDate: '2026-10-08', days: 3, estimatedCost: 18_000_000, actualCost: 0, status: 'approved', approverId: user('admin'), description: 'ماموریت مرتبط با استقرار پروژه بانک' });
  await upsertLegacy('job-openings', 'seed-job-backend', { title: 'توسعه‌دهنده Backend', department: 'فنی', employmentType: 'full_time', openings: 1, applicants: 2, status: 'open', description: 'توسعه APIهای MERN و معماری چندسازمانی', createdAt: date('2026-09-15') });
  await upsertLegacy('recruitment-candidates-v2', 'seed-candidate-backend-1', { jobId: 'seed-job-backend', fullName: 'آرمان اکبری', email: 'arman@example.com', phone: '09123334455', stage: 'interview', status: 'active', ownerId: user('pm'), appliedAt: '2026-09-20', updatedAt: date('2026-09-29'), meetings: [{ id: 'candidate-meeting-1', date: '2026-10-04T10:00:00+03:30', result: 'pending', notes: 'مصاحبه فنی' }] });
  await upsertLegacy('personnel-events', 'seed-personnel-event-designer', { employeeId: employee('designer'), type: 'promotion', title: 'ارتقا به طراح محصول ارشد', description: 'بر اساس عملکرد شش‌ماهه', date: '2026-08-23', createdBy: user('admin') });
  await upsertLegacy('task-labels', 'seed-label-important', { name: 'مهم', color: '#D32F2F', usage: 4 });
  await upsertLegacy('project-notes', 'seed-project-note-sales', { projectId: project('sales-platform'), title: 'ریسک یکپارچه‌سازی پرداخت', body: 'وابستگی به تایید نهایی درگاه بانکی باید تا هفته آینده بسته شود.', authorId: user('pm'), category: 'ریسک', customerVisible: false, createdAt: date('2026-09-30') });
  await upsertLegacy('conversations', 'seed-conversation-sales-team', { participantIds: [user('pm'), user('developer'), user('sales')], title: 'تیم پروژه سامانه فروش', projectId: project('sales-platform'), createdBy: user('pm'), createdAt: date('2026-09-01') });
  await upsertLegacy('messages', 'seed-message-sales-team-1', { conversationId: 'seed-conversation-sales-team', senderId: user('pm'), body: 'لطفاً وضعیت API پرداخت را تا پایان امروز در پروژه به‌روزرسانی کنید.', sentAt: date('2026-09-30T08:30:00+03:30'), readBy: [user('pm'), user('developer')], attachments: [] });

  await upsertModel('ProjectAccess', { _id: 'seed-project-access-sales' }, { projectId: project('sales-platform'), content: 'دسترسی مخزن کد پروژه', kind: 'link', system: 'GitLab', resource: 'repository', permission: 'maintainer', scope: 'role', status: 'granted', roleId: roles.get('sales-platform:delivery'), startDate: date('2026-03-01'), notes: 'دسترسی تیم اجرا بدون نگهداری رمز در رکورد', grantedBy: user('admin'), createdBy: user('admin'), updatedBy: user('admin') }, 'seed-project-access-sales');

  const activeFileTotals = await models.FileRecord.aggregate<{ usedBytes: number }>([
    { $match: { organizationId, $or: [{ deletionStatus: 'active' }, { deletionStatus: { $exists: false } }] } },
    { $group: { _id: null, usedBytes: { $sum: '$sizeBytes' } } },
  ]);
  await storageQuota.reconcile(organizationId, activeFileTotals[0]?.usedBytes || 0);
  const relationshipsValidated = await validateSeedGraph({
    organizationId,
    userIds: [...users.values()], employeeIds: [...employees.values()], customerIds: [...customers.values()],
    projectIds: [...projects.values()], compensationIds: [...compensationIds.values()], taskIds: [...tasks.values()],
    fileIds: [idOf(projectFile), idOf(hrFile)],
  });

  return {
    users: users.size, employees: employees.size, customers: customers.size, projects: projects.size,
    tasks: tasks.size, timeEntries: timeEntryIds.length, meetings: 2, projectEvents: 3,
    projectRoles: 6, projectMembers: 10, projectPhases: 6, compensations: compensationIds.size, attendanceRecords: 1, payrollAdjustments: compensationIds.size * 2,
    payrollPayments: compensationIds.size - 1, payrollPaymentDocuments: compensationIds.size - 1,
    legacyResourceTypes: 18, legacyRecords: 22, files: 2, relationshipsValidated,
  };
}
