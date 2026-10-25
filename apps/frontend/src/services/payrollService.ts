import type { PayrollAdjustment, PayrollAdjustmentType, PayrollRecord, PayrollSettlementMethod } from '../types/index.ts';
import { apiClient } from './apiClient.ts';
import { reportApiFailure } from './apiEvents.ts';
import { payrollRepository } from './repositories.ts';

export interface PayrollDraftInput {
  employeeId: string;
  month: string;
  periodStart: string;
  periodEnd: string;
}

export interface PayrollAdjustmentInput {
  type: PayrollAdjustmentType;
  amount: number;
  reason: string;
  adjustmentDate: string;
}

type PayrollAction = 'calculate' | 'review' | 'approve' | 'pay';

const actionLabels: Record<PayrollAction, string> = {
  calculate: 'محاسبه حقوق',
  review: 'بازبینی حقوق',
  approve: 'تأیید حقوق',
  pay: 'ثبت پرداخت حقوق',
};

async function guarded<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    reportApiFailure({
      message: error instanceof Error ? error.message : `${operation} در سرور انجام نشد.`,
      operation,
      resource: 'payroll',
    });
    throw error;
  }
}

export const payrollService = {
  createDraft(input: PayrollDraftInput) {
    return guarded('ایجاد پیش‌نویس حقوق', async () => {
      const response = await apiClient.create<PayrollRecord>('data/payroll', input);
      return payrollRepository.adopt(response.data);
    });
  },

  transition(id: string, action: PayrollAction, input: { reason?: string; paidAt?: string; paymentNote?: string; settlementMethod?: PayrollSettlementMethod; paymentReference?: string } = {}) {
    return guarded(actionLabels[action], async () => {
      const response = await apiClient.create<PayrollRecord>(`data/payroll/${id}/${action}`, input);
      return payrollRepository.adopt(response.data);
    });
  },

  async listAdjustments(payrollId: string) {
    return guarded('دریافت تعدیلات حقوق', async () => {
      const response = await apiClient.list<PayrollAdjustment>(`data/payroll/${payrollId}/adjustments`);
      return response.data;
    });
  },

  createAdjustment(payrollId: string, input: PayrollAdjustmentInput) {
    return guarded('ثبت تعدیل حقوق', async () => {
      const response = await apiClient.create<PayrollAdjustment>(`data/payroll/${payrollId}/adjustments`, input);
      return response.data;
    });
  },

  removeAdjustment(payrollId: string, adjustmentId: string) {
    return guarded('حذف تعدیل حقوق', () => apiClient.remove(`data/payroll/${payrollId}/adjustments`, adjustmentId));
  },
};
