import type { Contract, Customer, Invoice, Payment, Product } from '../types/index.ts';

export type SyncState = 'local' | 'pending' | 'synced' | 'needs_review' | 'error';

/**
 * Provider-neutral boundary for the accounting platform configured for a tenant.
 * The prototype intentionally keeps all operations local and does not make
 * network requests. Consumers depend on application models, not provider DTOs.
 */
export interface AccountingProvider {
  syncCustomers(customers: Customer[]): Promise<void>;
  syncProducts(products: Product[]): Promise<void>;
  syncInvoices(invoices: Invoice[]): Promise<void>;
  syncPayments(payments: Payment[]): Promise<void>;
  syncContracts(contracts: Contract[]): Promise<void>;
}

export const unconfiguredAccountingProvider: AccountingProvider = {
  async syncCustomers() { /* future provider hook */ },
  async syncProducts() { /* future provider hook */ },
  async syncInvoices() { /* future provider hook */ },
  async syncPayments() { /* future provider hook */ },
  async syncContracts() { /* future provider hook */ },
};

export const syncStateLabel: Record<SyncState, string> = {
  local: 'فقط داخلی',
  pending: 'در انتظار همگام‌سازی',
  synced: 'همگام شده',
  needs_review: 'نیازمند بررسی',
  error: 'خطای همگام‌سازی',
};
