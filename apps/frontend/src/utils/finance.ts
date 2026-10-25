import type { Invoice, Payment, TimesheetEntry } from '../types/index.ts';

export function lineItemTotals(items: Invoice['items']) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);
  const tax = items.reduce((sum, item) => sum + item.tax, 0);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export function invoicePaidAmount(invoice: Invoice, payments: Payment[]) {
  const linked = payments.filter((payment) => payment.invoiceId === invoice.id && payment.status === 'تایید شده');
  return linked.length ? linked.reduce((sum, payment) => sum + payment.amount, 0) : invoice.paidAmount;
}

export function laborCost(entries: TimesheetEntry[]) {
  return entries.reduce((sum, entry) => sum + (entry.calculatedCost ?? entry.hours * (entry.hourlyRate ?? 0)), 0);
}

/** Aggregates a project's commercial and delivery economics from shared entities. */
export function projectFinanceSummary(projectId: string, invoices: Invoice[], payments: Payment[], timesheets: TimesheetEntry[]) {
  const projectInvoices = invoices.filter((invoice) => invoice.projectId === projectId);
  const revenue = projectInvoices.reduce((sum, invoice) => sum + lineItemTotals(invoice.items).total, 0);
  const received = projectInvoices.reduce((sum, invoice) => sum + invoicePaidAmount(invoice, payments), 0);
  const entries = timesheets.filter((entry) => entry.projectId === projectId);
  const labor = laborCost(entries);
  return { revenue, received, outstanding: Math.max(0, revenue - received), labor, margin: revenue - labor, hours: entries.reduce((sum, entry) => sum + entry.hours, 0) };
}

export function hourlyCompensation(entries: TimesheetEntry[], hourlyRate: number) {
  const approved = entries.filter((entry) => entry.status === 'approved');
  const payable = approved.filter((entry) => entry.billable);
  const hours = payable.reduce((sum, entry) => sum + entry.hours, 0);
  return { loggedHours: entries.reduce((sum, entry) => sum + entry.hours, 0), approvedHours: approved.reduce((sum, entry) => sum + entry.hours, 0), payableHours: hours, amount: hours * hourlyRate };
}
