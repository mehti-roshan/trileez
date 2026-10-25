import { hashPassword } from '../utils/password.js';
import { seedCollection } from './mockStore.js';
import { models } from '../models/index.js';
import { env } from '../config/env.js';
import { DEFAULT_ORGANIZATION_ID } from '../config/organizations.js';
import { seedApplicationData } from './applicationSeed.js';

const SECONDARY_ORGANIZATION_ID = 'org2';

let seeded = false;

export async function seedMockData(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const now = new Date().toISOString();
  const adminHash = await hashPassword('Admin123!');
  const managerHash = await hashPassword('Manager123!');
  seedCollection('User', [
    { id: 'u1', organizationId: DEFAULT_ORGANIZATION_ID, name: 'مدیر سامانه', email: 'admin@trileez.ir', role: 'admin', status: 'online', isActive: true, title: 'مدیر سامانه', passwordHash: adminHash, permissionOverrides: { additions: [], removals: [] }, createdAt: now, updatedAt: now },
    { id: 'u2', organizationId: DEFAULT_ORGANIZATION_ID, name: 'علی رضایی', email: 'manager@trileez.ir', role: 'manager', status: 'online', isActive: true, title: 'مدیر پروژه', passwordHash: managerHash, permissionOverrides: { additions: [], removals: [] }, createdAt: now, updatedAt: now },
    { id: 'u3', organizationId: DEFAULT_ORGANIZATION_ID, name: 'مریم حسینی', email: 'member@trileez.ir', role: 'member', status: 'away', isActive: true, title: 'طراح محصول', passwordHash: managerHash, permissionOverrides: { additions: [], removals: [] }, createdAt: now, updatedAt: now },
    { id: 'u-org2-admin', organizationId: SECONDARY_ORGANIZATION_ID, name: 'مدیر سازمان دوم', email: 'admin.org2@trileez.ir', role: 'admin', status: 'offline', isActive: true, title: 'مدیر سامانه', passwordHash: adminHash, permissionOverrides: { additions: [], removals: [] }, createdAt: now, updatedAt: now },
  ]);
  seedCollection('Employee', [
    { id: 'e1', organizationId: DEFAULT_ORGANIZATION_ID, userId: 'u2', personnelCode: 'EMP-1002', fullName: 'علی رضایی', phone: '09120000002', email: 'manager@trileez.ir', jobTitle: 'مدیر پروژه', department: 'فنی', employmentType: 'full_time', compensationType: 'full_time_attendance', employmentStatus: 'active', hireDate: now, workLocation: 'دفتر مرکزی', workMode: 'ترکیبی', salary: 0, leaveBalance: 0, createdAt: now, updatedAt: now },
    { id: 'e2', organizationId: DEFAULT_ORGANIZATION_ID, userId: 'u3', personnelCode: 'EMP-1003', fullName: 'مریم حسینی', phone: '09120000003', email: 'member@trileez.ir', jobTitle: 'طراح محصول', department: 'محصول', employmentType: 'full_time', compensationType: 'hourly_task', employmentStatus: 'active', hireDate: now, workLocation: 'دورکاری', workMode: 'دورکاری', salary: 0, leaveBalance: 0, createdAt: now, updatedAt: now },
  ]);
  seedCollection('EmploymentCompensation', [
    { id: 'comp-e1-fulltime', organizationId: DEFAULT_ORGANIZATION_ID, employeeId: 'e1', paymentMethod: 'full_time_attendance', effectiveFrom: '2020-01-01', currency: 'IRR', payPeriod: 'monthly', monthlySalary: 88_000_000, expectedSchedule: { timezone: 'Asia/Tehran', days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, expectedMinutes: 480 })), weeklyExpectedMinutes: 2_400 }, overtimeEnabled: true, overtimeRateMultiplier: 1.4, status: 'active', createdBy: 'u1', createdAt: now, updatedAt: now },
    { id: 'comp-e2-hourly', organizationId: DEFAULT_ORGANIZATION_ID, employeeId: 'e2', paymentMethod: 'hourly_task', effectiveFrom: '2020-01-01', currency: 'IRR', payPeriod: 'monthly', hourlyRate: 390_000, expectedSchedule: { timezone: 'Asia/Tehran', days: [], weeklyExpectedMinutes: 0 }, overtimeEnabled: false, overtimeRateMultiplier: 1.4, status: 'active', createdBy: 'u1', createdAt: now, updatedAt: now },
  ]);
  seedCollection('AttendanceRecord', []);
  seedCollection('Project', [{ id: 'p1', organizationId: DEFAULT_ORGANIZATION_ID, name: 'پروژه نمونه تری‌لیز', code: 'TRX-001', status: 'active', progress: 0, tasksCount: 1, completedTasksCount: 0, plannedHours: 0, estimatedHours: 0, actualHours: 0, managerId: 'u2', members: ['u2', 'u3'], createdAt: now, updatedAt: now }]);
  seedCollection('ProjectMember', [
    { id: 'pm1', organizationId: DEFAULT_ORGANIZATION_ID, projectId: 'p1', personId: 'u2', roleIds: [], status: 'active', joinedAt: now, createdBy: 'u1', createdAt: now, updatedAt: now },
    { id: 'pm2', organizationId: DEFAULT_ORGANIZATION_ID, projectId: 'p1', personId: 'u3', roleIds: [], status: 'active', joinedAt: now, createdBy: 'u1', createdAt: now, updatedAt: now },
  ]);
  seedCollection('Task', [{ id: 't1', organizationId: DEFAULT_ORGANIZATION_ID, title: 'راه‌اندازی نسخه اولیه', projectId: 'p1', assigneeId: 'u3', status: 'in_progress', priority: 'high', createdAt: now, updatedAt: now }]);
  seedCollection('Meeting', [{ id: 'meeting-1', organizationId: DEFAULT_ORGANIZATION_ID, title: 'جلسه نمونه پروژه', startAt: now, durationMinutes: 60, status: 'scheduled', organizerId: 'u2', participantIds: ['u2', 'u3'], departments: ['فنی', 'محصول'], projectId: 'p1', agenda: 'بررسی پیشرفت', createdBy: 'u2', createdAt: now, updatedAt: now }]);
  seedCollection('ProjectEvent', []);
  seedCollection('PerformanceEvent', []);
  seedCollection('PerformancePeriod', []);
  seedCollection('AuditLog', []);
  seedCollection('FileRecord', []);
}

export async function seedMongoData(): Promise<Record<string, number>> {
  return seedApplicationData();
}
