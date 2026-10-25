import { roleDefinitions } from '../constants/roleDefinitions.ts';
import type { Customer, Employee, PermissionKey, PermissionOverrides, User, UserRole } from '../types/index.ts';
import { customerRepository, employeeRepository, userRepository } from './repositories.ts';
import { hasPermission } from './accessControl.ts';
import { customerDisplayName, customerEntityType } from '../utils/customer.ts';
import { apiClient } from './apiClient.ts';
import { ApiRepository } from './apiRepository.ts';

export function effectivePermissions(user: User): PermissionKey[] {
  const inherited = roleDefinitions.find((role) => role.id === user.role)?.permissions ?? [];
  const additions = user.permissionOverrides?.additions ?? [];
  const removals = new Set(user.permissionOverrides?.removals ?? []);
  return [...new Set([...inherited, ...additions])].filter((permission) => !removals.has(permission));
}

const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
const passwordCategories = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*_-+='];

export function generateSecurePassword(length = 24) {
  if (length < 16) throw new Error('رمز عبور تولیدشده باید حداقل ۱۶ کاراکتر باشد.');
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  const chars = passwordCategories.map((category, index) => category[values[index] % category.length]);
  for (let index = passwordCategories.length; index < length; index += 1) chars.push(passwordAlphabet[values[index] % passwordAlphabet.length]);
  // Fisher-Yates uses the same cryptographically random stream, so category
  // guarantees do not make the resulting password predictable.
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = values[index] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
}

export async function createEmployeeAccount(input: {
  actor: User;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  password?: string;
  passwordGenerated?: boolean;
  title: string;
  department: string;
  personnelCode: string;
  employmentType?: Employee['employmentType'];
  compensationType: Employee['compensationType'];
  hasGuarantee?: boolean;
  guaranteeAmount?: number;
  overrides: PermissionOverrides;
}) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) throw new Error('فقط مدیر مجاز سامانه می‌تواند کاربر ایجاد یا دسترسی‌ها را ویرایش کند.');
  if (!input.firstName.trim() || !input.lastName.trim() || !input.email.trim() || !input.phone.trim() || !input.personnelCode.trim()) {
    throw new Error('نام، نام خانوادگی، ایمیل، شماره تماس و کد پرسنلی الزامی است.');
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
  const generatedPassword = input.passwordGenerated || !input.password?.trim() ? (input.password?.trim() || generateSecurePassword()) : undefined;
  const password = input.password?.trim() || generatedPassword!;
  if (password.length < 8) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  const userInput = {
    name,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    role: input.role,
    status: 'offline' as const,
    isActive: true,
    title: input.title.trim() || 'همکار',
    permissionOverrides: { additions, removals },
  };
  const user = (userRepository as ApiRepository<User>).adopt((await apiClient.create<User>('users', { ...userInput, password })).data);
  try {
    const employee = await employeeRepository.create({
      userId: user.id,
      personnelCode: input.personnelCode.trim(),
      fullName: name,
      phone: input.phone.trim(),
      email: input.email.trim(),
      nationalId: '',
      jobTitle: input.title.trim() || 'همکار',
      department: input.department.trim() || 'سازمانی',
      employmentType: input.employmentType ?? 'full_time',
      compensationType: input.compensationType,
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
    return { user, employee, generatedPassword };
  } catch (error) {
    await userRepository.remove(user.id).catch(() => false);
    throw error;
  }
}

export async function createCustomerAccount(input: { actor: User; customer: Customer; fullName: string; position: string; email: string; phone: string; password?: string; passwordGenerated?: boolean }) {
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
  const generatedPassword = input.passwordGenerated || !input.password?.trim() ? (input.password?.trim() || generateSecurePassword()) : undefined;
  const password = input.password?.trim() || generatedPassword!;
  if (password.length < 8) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  const customerAccounts = userRepository.list().filter((user) => user.customerId === input.customer.id);
  if (customerEntityType(input.customer) === 'person' && customerAccounts.length > 0) {
    throw new Error('برای مشتری حقیقی فقط یک حساب کاربری قابل ایجاد است.');
  }
  if (userRepository.list().some((user) => user.email.toLocaleLowerCase() === email)) throw new Error('کاربری با این ایمیل قبلاً ثبت شده است.');
  const userInput = { name: fullName, email, phone, role: 'customer' as const, status: 'offline' as const, isActive: true, title: position, customerId: input.customer.id, permissionOverrides: { additions: [], removals: [] } };
  const user = (userRepository as ApiRepository<User>).adopt((await apiClient.create<User>('users', { ...userInput, password })).data);
  try {
    if (!input.customer.email || !input.customer.phone) {
      await customerRepository.update(input.customer.id, {
        email: input.customer.email || email,
        phone: input.customer.phone || phone,
      });
    }
    return { ...user, generatedPassword };
  } catch (error) {
    await userRepository.remove(user.id).catch(() => false);
    throw error;
  }
}

export async function resetUserPassword(input: { actor: User; userId: string }) {
  if (input.actor.role !== 'admin' || !hasPermission(input.actor, 'hr:manage-users')) throw new Error('فقط مدیر مجاز سامانه می‌تواند رمز عبور را بازنشانی کند.');
  const target = userRepository.get(input.userId);
  if (!target) throw new Error('کاربر موردنظر پیدا نشد.');
  const result = await apiClient.resetPassword(target.id);
  const user = (userRepository as ApiRepository<User>).adopt(result.data.user);
  return { user, generatedPassword: result.data.generatedPassword };
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
