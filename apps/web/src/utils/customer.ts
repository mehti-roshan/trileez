import type { Customer, CustomerEntityType } from '../types/index.ts';

export function customerEntityType(customer: Partial<Customer>): CustomerEntityType {
  if (customer.entityType) return customer.entityType;
  return customer.company && customer.company !== customer.name ? 'company' : 'person';
}

export function customerDisplayName(customer: Partial<Customer>): string {
  return customerEntityType(customer) === 'company'
    ? customer.company || customer.name || 'مشتری بدون نام'
    : customer.name || customer.company || 'مشتری بدون نام';
}

export function customerEntityTypeLabel(customer: Partial<Customer>): string {
  return customerEntityType(customer) === 'company' ? 'شرکت' : 'شخص حقیقی';
}

export function customerIdentityLabel(customer: Partial<Customer>): string {
  return customerEntityType(customer) === 'company' ? 'کد اقتصادی' : 'شناسه ملی / کد ملی';
}

export function customerCurrencyLabel(currency?: string): string {
  return ({ IRR: 'ریال ایران', IRT: 'تومان ایران', USD: 'دلار آمریکا', EUR: 'یورو', AED: 'درهم امارات' } as Record<string, string>)[currency ?? 'IRR'] ?? currency ?? 'ریال ایران';
}
