import { roleDefinitions } from '../mock/data.ts';
import type { Customer, Employee, PermissionKey, PermissionOverrides, User, UserRole } from '../types/index.ts';
import { customerRepository, employeeRepository, userRepository } from './repositories.ts';
import { hasPermission } from './accessControl.ts';
import { customerDisplayName, customerEntityType } from '../utils/customer.ts';

export function effectivePermissions(user: User): PermissionKey[] {
  const inherited = roleDefinitions.find((role) => role.id === user.role)?.permissions ?? [];
  const additions = user.permissionOverrides?.additions ?? [];
  const removals = new Set(user.permissionOverrides?.removals ?? []);
  return [...new Set([...inherited, ...additions])].filter((permission) => !removals.has(permission));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltText = Array.from(salt).map((value) => value.toString(16).padStart(2, '0')).join('');
  const bytes = new TextEncoder().encode(`${saltText}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${saltText}:${hash}`;
}

export async function createEmployeeAccount(input: {
  actor: User;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
  title: string;
  department: string;
  personnelCode: string;
  employmentType?: Employee['employmentType'];
  hasGuarantee?: boolean;
  guaranteeAmount?: number;
  overrides: PermissionOverrides;
}) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) throw new Error('فقط مدیر مجاز سامانه می‌تواند کاربر ایجاد یا دسترسی‌ها را ویرایش کند.');
  if (!input.firstName.trim() || !input.lastName.trim() || !input.email.trim() || !input.phone.trim() || !input.personnelCode.trim() || input.password.length < 8) {
    throw new Error('نام، نام خانوادگی، ایمیل، شماره تماس، کد پرسنلی و رمز عبور حداقل ۸ کاراکتری الزامی است.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new Error('نشانی ایمیل معتبر نیست.');
  }
  if (input.role === 'customer' || !roleDefinitions.some((role) => role.id === input.role)) {
    throw new Error('نقش انتخاب‌شده معتبر نیست.');
  }
  if (userRepository.list().some((user) => user.email.toLocaleLowerCase() === input.email.trim().toLocaleLowerCase())) {
    throw new Error('کاربری با این ایمیل قبلاً ثبت شده است.');
  }
  const validPermissions = new Set<PermissionKey>(roleDefinitions.flatMap((definition) => definition.permissions));
  const additions = [...new Set(input.overrides.additions)].filter((permission): permission is PermissionKey => validPermissions.has(permission));
  const removals = [...new Set(input.overrides.removals)].filter((permission): permission is PermissionKey => validPermissions.has(permission));
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`;
  const user = userRepository.create({
    name,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    role: input.role,
    status: 'offline',
    isActive: true,
    title: input.title.trim() || 'همکار',
    permissionOverrides: { additions, removals },
    credentialHash: await hashPassword(input.password),
  });
  const employee = employeeRepository.create({
    userId: user.id,
    personnelCode: input.personnelCode.trim(),
    fullName: name,
    phone: input.phone.trim(),
    email: input.email.trim(),
    nationalId: '',
    jobTitle: input.title.trim() || 'همکار',
    department: input.department.trim() || 'سازمانی',
    employmentType: input.employmentType ?? 'full_time',
    contractType: input.employmentType === 'project' ? 'قرارداد فریلنسری / پروژه‌ای' : 'قرارداد همکاری',
    employmentStatus: 'active',
    hireDate: new Date().toISOString(),
    workLocation: 'تعیین نشده',
    workMode: input.employmentType === 'project' ? 'دورکاری' : 'ترکیبی',
    salary: 0,
    leaveBalance: 0,
    hasGuarantee: Boolean(input.hasGuarantee),
    guaranteeAmount: input.hasGuarantee && Number(input.guaranteeAmount) > 0 ? Number(input.guaranteeAmount) : undefined,
  });
  return { user, employee };
}

export async function createCustomerAccount(input: { actor: User; customer: Customer; fullName: string; position: string; email: string; phone: string; password: string }) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) {
    throw new Error('فقط مدیر مجاز سامانه می‌تواند برای مشتری حساب کاربری ایجاد کند.');
  }
  const email = input.email.trim().toLocaleLowerCase();
  const phone = input.phone.trim();
  const fullName = input.fullName.trim() || (customerEntityType(input.customer) === 'person' ? customerDisplayName(input.customer) : '');
  const position = input.position.trim() || (customerEntityType(input.customer) === 'person' ? 'مشتری' : '');
  if (!fullName) throw new Error('نام و نام خانوادگی کاربر مشتری الزامی است.');
  if (!position) throw new Error('سمت کاربر در شرکت مشتری الزامی است.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('نشانی ایمیل معتبر الزامی است.');
  if (!phone) throw new Error('شماره موبایل مشتری الزامی است.');
  if (input.password.length < 8) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  const customerAccounts = userRepository.list().filter((user) => user.customerId === input.customer.id);
  if (customerEntityType(input.customer) === 'person' && customerAccounts.length > 0) {
    throw new Error('برای مشتری حقیقی فقط یک حساب کاربری قابل ایجاد است.');
  }
  if (userRepository.list().some((user) => user.email.toLocaleLowerCase() === email)) throw new Error('کاربری با این ایمیل قبلاً ثبت شده است.');
  const user = userRepository.create({ name: fullName, email, phone, role: 'customer', status: 'offline', isActive: true, title: position, customerId: input.customer.id, permissionOverrides: { additions: [], removals: [] }, credentialHash: await hashPassword(input.password) });
  if (!input.customer.email || !input.customer.phone) {
    customerRepository.update(input.customer.id, {
      email: input.customer.email || email,
      phone: input.customer.phone || phone,
    });
  }
  return user;
}

export function updateUserActiveStatus(input: { actor: User; userId: string; isActive: boolean }) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) {
    throw new Error('فقط مدیر مجاز سامانه می‌تواند وضعیت فعال بودن حساب را تغییر دهد.');
  }
  const target = userRepository.get(input.userId);
  if (!target) throw new Error('حساب کاربری مرتبط با این کارمند پیدا نشد.');
  return userRepository.update(target.id, { isActive: input.isActive });
}

export function updateUserPermissionOverrides(input: { actor: User; userId: string; overrides: PermissionOverrides }) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) {
    throw new Error('فقط مدیر مجاز سامانه می‌تواند دسترسی‌های اختصاصی را ویرایش کند.');
  }
  const target = userRepository.get(input.userId);
  if (!target) throw new Error('کاربر موردنظر پیدا نشد.');
  const validPermissions = new Set<PermissionKey>(roleDefinitions.flatMap((definition) => definition.permissions));
  const inherited = new Set(roleDefinitions.find((role) => role.id === target.role)?.permissions ?? []);
  const additions = [...new Set(input.overrides.additions)].filter((permission) => validPermissions.has(permission) && !inherited.has(permission));
  const removals = [...new Set(input.overrides.removals)].filter((permission) => validPermissions.has(permission) && inherited.has(permission));
  return userRepository.update(target.id, { permissionOverrides: { additions, removals } });
}
