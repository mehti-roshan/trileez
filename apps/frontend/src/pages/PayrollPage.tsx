import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Snackbar, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { employees, projects, tasks, users } from '../services/repositories.ts';
import { compensationRepository, payrollRepository } from '../services/repositories.ts';
import { payrollService } from '../services/payrollService.ts';
import type { CompensationPaymentMethod, EmploymentCompensation, PayrollAdjustment, PayrollAdjustmentSnapshot, PayrollAdjustmentType, PayrollRecord, PayrollSettlementMethod, PayrollStatus } from '../types/index.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';

const statusLabels: Record<PayrollStatus, string> = {
  draft: 'پیش‌نویس', calculated: 'محاسبه‌شده', reviewed: 'بازبینی‌شده', approved: 'تأییدشده', paid: 'پرداخت‌شده',
};
const statusColors: Record<PayrollStatus, 'default' | 'info' | 'warning' | 'success' | 'primary'> = {
  draft: 'default', calculated: 'info', reviewed: 'warning', approved: 'primary', paid: 'success',
};
const adjustmentLabels: Record<PayrollAdjustmentType, string> = {
  adjustment_credit: 'اصلاح افزایشی', adjustment_debit: 'اصلاح کاهشی', bonus: 'پاداش', deduction: 'کسورات',
};
const settlementMethodOptions: Array<{ value: PayrollSettlementMethod; label: string }> = [
  { value: 'bank_transfer', label: 'انتقال بانکی' }, { value: 'cash', label: 'نقدی' },
  { value: 'cheque', label: 'چک' }, { value: 'other', label: 'سایر' },
];
const workflow: Array<{ status: PayrollStatus; label: string }> = [
  { status: 'draft', label: 'پیش‌نویس' }, { status: 'calculated', label: 'محاسبه' }, { status: 'reviewed', label: 'بازبینی' },
  { status: 'approved', label: 'تأیید' }, { status: 'paid', label: 'پرداخت' },
];
const weekdays = [
  { value: 6, label: 'شنبه' }, { value: 0, label: 'یکشنبه' }, { value: 1, label: 'دوشنبه' },
  { value: 2, label: 'سه‌شنبه' }, { value: 3, label: 'چهارشنبه' }, { value: 4, label: 'پنجشنبه' }, { value: 5, label: 'جمعه' },
];

const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? users.find((user) => user.id === id)?.name ?? id;
const actorName = (id?: string) => id ? users.find((user) => user.id === id)?.name ?? employees.find((employee) => employee.id === id)?.fullName ?? id : '—';
const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? id;
const taskName = (id: string) => tasks.find((task) => task.id === id)?.title ?? id;
const hours = (minutes?: number) => `${((minutes ?? 0) / 60).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ساعت`;
const amount = (value?: number) => formatCurrency(Number(value ?? 0));
const inputDate = (date = new Date()) => date.toISOString().slice(0, 10);
const initialPeriod = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    month: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long' }).format(now),
    periodStart: inputDate(start), periodEnd: inputDate(end),
  };
};
const netAmount = (record: PayrollRecord) => Number(record.finalPayableAmount ?? record.netSalary ?? 0);
const grossAmount = (record: PayrollRecord) => Number(record.grossAmount ?? record.baseSalary ?? 0);
const deductionAmount = (record: PayrollRecord) => Number(record.deductionAmount ?? record.deductions ?? 0) + Number(record.adjustmentDebitAmount ?? 0) + Number(record.tax ?? 0);
const positiveAdjustments = (record: PayrollRecord) => Number(record.bonusAmount ?? record.benefits ?? 0) + Number(record.adjustmentCreditAmount ?? 0) + Number(record.overtimeAmount ?? record.overtime ?? 0);

function SummaryCard({ title, value, hint, color = 'text.primary' }: { title: string; value: string; hint?: string; color?: string }) {
  return <Card variant="outlined"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h6" sx={{ mt: .4, fontWeight: 900, color }}>{value}</Typography>{hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}</CardContent></Card>;
}

function WorkflowStrip({ status }: { status: PayrollStatus }) {
  const current = workflow.findIndex((step) => step.status === status);
  return <Stack direction="row" spacing={.75} sx={{ flexWrap: 'wrap' }}>{workflow.map((step, index) => <Chip key={step.status} size="small" color={index <= current ? statusColors[step.status] : 'default'} variant={index <= current ? 'filled' : 'outlined'} label={`${index + 1}. ${step.label}`} />)}</Stack>;
}

function DetailDialog({ record, adjustments, adjustmentsLoading, onClose, onAction, onAddAdjustment, onRemoveAdjustment }: {
  record: PayrollRecord | null;
  adjustments: PayrollAdjustment[];
  adjustmentsLoading: boolean;
  onClose: () => void;
  onAction: (action: 'calculate' | 'review' | 'approve' | 'pay') => void;
  onAddAdjustment: () => void;
  onRemoveAdjustment: (adjustmentId: string) => void;
}) {
  if (!record) return null;
  const snapshots: Array<PayrollAdjustment | PayrollAdjustmentSnapshot> = record.status === 'draft' ? adjustments : record.adjustmentSnapshots ?? [];
  const method = record.paymentMethod === 'hourly_task' ? 'ساعتی / وظیفه‌ای' : 'تمام‌وقت / حضور و غیاب';
  const action = record.status === 'draft' ? ['calculate', 'محاسبه حقوق'] as const
    : record.status === 'calculated' ? ['review', 'ثبت بازبینی'] as const
      : record.status === 'reviewed' ? ['approve', 'تأیید حقوق'] as const
        : record.status === 'approved' ? ['pay', 'ثبت پرداخت'] as const : null;
  return <Dialog open onClose={onClose} fullWidth maxWidth="lg">
    <DialogTitle><Stack spacing={1}><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1 }}><Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{employeeName(record.employeeId)}</Typography><Typography variant="body2" color="text.secondary">{record.month} • {method} • {record.periodStart ? formatDate(record.periodStart) : '—'} تا {record.periodEnd ? formatDate(record.periodEnd) : '—'}</Typography></Box><Chip color={statusColors[record.status]} label={statusLabels[record.status]} /></Stack><WorkflowStrip status={record.status} /></Stack></DialogTitle>
    <DialogContent dividers>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, mb: 2 }}>
        <SummaryCard title="ساعات مبنای حقوق" value={hours(record.payrollMinutes)} hint={record.paymentMethod === 'hourly_task' ? 'زمان وظیفه تأییدشده' : 'حضور و مرخصی پرداختی'} />
        <SummaryCard title="مبلغ پایه" value={amount(record.grossBaseAmount ?? record.baseSalary)} />
        <SummaryCard title="ناخالص" value={amount(grossAmount(record))} color="primary.main" />
        <SummaryCard title="خالص پرداختی" value={amount(netAmount(record))} color="success.main" />
      </Box>

      {record.status === 'draft' ? <Alert severity="info" sx={{ mb: 2 }}>این رکورد هنوز محاسبه نشده است. تعدیلات را ثبت کنید و سپس محاسبه را اجرا کنید؛ مبالغ و منابع زمان توسط سرور تعیین می‌شوند.</Alert> : <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, mb: 2 }}>
        <SummaryCard title="اضافه‌کاری" value={amount(record.overtimeAmount)} hint={hours(record.overtimeMinutes)} />
        <SummaryCard title="پاداش و افزایش" value={amount(Number(record.bonusAmount ?? 0) + Number(record.adjustmentCreditAmount ?? 0))} />
        <SummaryCard title="کسورات و کاهش" value={amount(deductionAmount(record))} />
        <SummaryCard title="نسخه محاسبه" value={`${record.calculationVersion ?? 0}`} hint="اسنپ‌شات تاریخی" />
      </Box>}

      {record.paymentMethod === 'hourly_task' && record.status !== 'draft' && <Box sx={{ mb: 2 }}><Typography sx={{ fontWeight: 900, mb: 1 }}>کارکرد پروژه‌ها و وظایف</Typography><Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>{['تاریخ', 'پروژه', 'وظیفه', 'ساعت تأییدشده', 'نرخ ساعتی', 'مبلغ'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{record.taskLines?.length ? record.taskLines.map((line) => <TableRow key={line.timeEntryId}><TableCell>{formatDate(line.date)}</TableCell><TableCell>{projectName(line.projectId)}</TableCell><TableCell>{taskName(line.taskId)}</TableCell><TableCell>{hours(line.minutes)}</TableCell><TableCell>{amount(line.hourlyRate)}</TableCell><TableCell sx={{ fontWeight: 800 }}>{amount(line.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} align="center">زمان وظیفه تأییدشده‌ای در این دوره ثبت نشده است.</TableCell></TableRow>}</TableBody></Table></Box></Box>}

      {record.paymentMethod === 'full_time_attendance' && record.status !== 'draft' && <Box sx={{ mb: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }}><Chip variant="outlined" label={`انتظار: ${hours(record.expectedMinutes)}`} /><Chip variant="outlined" label={`عادی: ${hours(record.regularMinutes)}`} /><Chip variant="outlined" label={`اضافه‌کاری: ${hours(record.overtimeMinutes)}`} /><Chip variant="outlined" label={`غیبت: ${hours(record.absenceMinutes)}`} /><Chip variant="outlined" label={`مرخصی تأییدشده: ${hours(record.approvedLeaveMinutes)}`} /></Stack><Typography sx={{ fontWeight: 900, mb: 1 }}>جزئیات حضور و غیاب</Typography><Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>{['تاریخ', 'ورود', 'خروج', 'کارکرد', 'عادی', 'اضافه‌کاری', 'غیبت / مرخصی'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{record.attendanceLines?.length ? record.attendanceLines.map((line) => <TableRow key={line.attendanceRecordId}><TableCell>{formatDate(line.date)}</TableCell><TableCell>{line.clockIn ? new Date(line.clockIn).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell><TableCell>{line.clockOut ? new Date(line.clockOut).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell><TableCell>{hours(line.workedMinutes)}</TableCell><TableCell>{hours(line.regularMinutes)}</TableCell><TableCell>{hours(line.overtimeMinutes)}</TableCell><TableCell>{hours(line.absenceMinutes)} / {hours(line.approvedLeaveMinutes)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} align="center">رکورد حضور تأییدشده‌ای در این دوره ثبت نشده است.</TableCell></TableRow>}</TableBody></Table></Box><Typography variant="caption" color="text.secondary">حقوق مبنا: {amount(record.compensationSnapshot?.monthlySalary)} • ضریب اضافه‌کاری: {record.compensationSnapshot?.overtimeRateMultiplier?.toLocaleString('fa-IR') ?? '—'}</Typography></Box>}

      <Divider sx={{ my: 2 }} />
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}><Typography sx={{ fontWeight: 900 }}>تعدیلات، پاداش‌ها و کسورات</Typography>{record.status === 'draft' && <Button size="small" variant="outlined" onClick={onAddAdjustment}>افزودن تعدیل</Button>}</Stack>
      {adjustmentsLoading ? <CircularProgress size={24} /> : <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>{['نوع', 'مبلغ', 'دلیل', 'تاریخ', 'ثبت‌کننده', ''].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{snapshots.length ? snapshots.map((item) => <TableRow key={'id' in item ? item.id : item.adjustmentId}><TableCell>{adjustmentLabels[item.type]}</TableCell><TableCell sx={{ fontWeight: 800 }}>{amount(item.amount)}</TableCell><TableCell>{item.reason}</TableCell><TableCell>{formatDate(item.adjustmentDate)}</TableCell><TableCell>{actorName(item.createdBy)}</TableCell><TableCell>{record.status === 'draft' && 'id' in item ? <Button size="small" color="error" onClick={() => onRemoveAdjustment(item.id)}>حذف</Button> : null}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} align="center">تعدیلی برای این دوره ثبت نشده است.</TableCell></TableRow>}</TableBody></Table></Box>}

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontWeight: 900, mb: 1 }}>ردپای گردش کار</Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' } }}>
        <SummaryCard title="محاسبه" value={record.calculatedAt ? formatDate(record.calculatedAt) : 'انجام نشده'} hint={record.calculatedAt ? actorName(record.calculatedBy) : undefined} />
        <SummaryCard title="بازبینی" value={record.reviewedAt ? formatDate(record.reviewedAt) : 'انجام نشده'} hint={record.reviewedAt ? actorName(record.reviewedBy) : undefined} />
        <SummaryCard title="تأیید" value={record.approvedAt ? formatDate(record.approvedAt) : 'انجام نشده'} hint={record.approvedAt ? actorName(record.approvedBy) : undefined} />
        <SummaryCard title="پرداخت" value={record.paidAt ? formatDate(record.paidAt) : 'انجام نشده'} hint={record.paymentNote || (record.paidAt ? actorName(record.paidBy) : undefined)} />
      </Box>
      {record.status === 'paid' && <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>رکورد و سند پرداخت در سرور ثبت شده‌اند.</Typography>
        <Typography variant="caption" sx={{ display: 'block' }}>سند: {record.paymentDocumentNumber ?? record.paymentDocumentId ?? '—'} • مرجع پرداخت: {record.paymentReference ?? '—'}</Typography>
        <Typography variant="caption" sx={{ display: 'block' }}>وضعیت حسابداری: {record.accountingSubmissionStatus === 'not_submitted' ? 'هنوز به سامانه حسابداری ارسال نشده' : record.accountingSubmissionStatus ?? '—'}</Typography>
      </Alert>}
    </DialogContent>
    <DialogActions><Button color="inherit" onClick={onClose}>بستن</Button>{action && <Button variant="contained" onClick={() => onAction(action[0])}>{action[1]}</Button>}</DialogActions>
  </Dialog>;
}

export default function PayrollPage() {
  const [records, setRecords] = useState(() => payrollRepository.list());
  const [period, setPeriod] = useState('all');
  const [selected, setSelected] = useState<PayrollRecord | null>(null);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ employeeId: '', ...initialPeriod() });
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustment, setAdjustment] = useState<{ type: PayrollAdjustmentType; amount: string; reason: string; adjustmentDate: string }>({ type: 'bonus', amount: '', reason: '', adjustmentDate: inputDate() });
  const [transition, setTransition] = useState<'calculate' | 'review' | 'approve' | 'pay' | null>(null);
  const [transitionForm, setTransitionForm] = useState({ reason: '', paidAt: inputDate(), paymentNote: '', settlementMethod: 'bank_transfer' as PayrollSettlementMethod, paymentReference: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [compensations, setCompensations] = useState(() => compensationRepository.list());
  const [compensationOpen, setCompensationOpen] = useState(false);
  const [compensation, setCompensation] = useState({
    employeeId: '', paymentMethod: 'hourly_task' as CompensationPaymentMethod, effectiveFrom: inputDate(), rate: '',
    workdays: [6, 0, 1, 2, 3], minutesPerDay: '480', overtimeEnabled: false, overtimeRateMultiplier: '1.4', notes: '',
  });

  useEffect(() => payrollRepository.subscribe(setRecords), []);
  useEffect(() => compensationRepository.subscribe(setCompensations), []);
  const periods = useMemo(() => [...new Set(records.map((record) => record.month))].sort((a, b) => b.localeCompare(a, 'fa')), [records]);
  const rows = useMemo(() => records.filter((record) => period === 'all' || record.month === period), [period, records]);
  const totalNet = rows.reduce((sum, record) => sum + netAmount(record), 0);
  const totalGross = rows.reduce((sum, record) => sum + grossAmount(record), 0);

  const openDetails = async (record: PayrollRecord) => {
    setSelected(record); setError(''); setAdjustments([]);
    if (record.status !== 'draft') return;
    setAdjustmentsLoading(true);
    try { setAdjustments(await payrollService.listAdjustments(record.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'دریافت تعدیلات ناموفق بود.'); }
    finally { setAdjustmentsLoading(false); }
  };

  const createDraft = async () => {
    if (!draft.employeeId || !draft.month.trim() || !draft.periodStart || !draft.periodEnd) { setError('کارمند، عنوان دوره و بازه زمانی الزامی هستند.'); return; }
    setBusy(true); setError('');
    try {
      const created = await payrollService.createDraft({ ...draft, month: draft.month.trim() });
      setDraftOpen(false); setSuccess('پیش‌نویس حقوق ایجاد شد.'); setPeriod(created.month); await openDetails(created);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ایجاد پیش‌نویس انجام نشد.'); }
    finally { setBusy(false); }
  };

  const runTransition = async () => {
    if (!selected || !transition) return;
    setBusy(true); setError('');
    try {
      const input = transition === 'pay'
        ? { reason: transitionForm.reason.trim() || undefined, paidAt: transitionForm.paidAt || undefined, paymentNote: transitionForm.paymentNote.trim() || undefined, settlementMethod: transitionForm.settlementMethod, paymentReference: transitionForm.paymentReference.trim() || undefined }
        : { reason: transitionForm.reason.trim() || undefined };
      const updated = await payrollService.transition(selected.id, transition, input);
      setSelected(updated); setTransition(null); setTransitionForm({ reason: '', paidAt: inputDate(), paymentNote: '', settlementMethod: 'bank_transfer', paymentReference: '' });
      setSuccess(`${statusLabels[updated.status]} با موفقیت در سرور ثبت شد.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تغییر وضعیت حقوق انجام نشد.'); }
    finally { setBusy(false); }
  };

  const addAdjustment = async () => {
    if (!selected || !adjustment.reason.trim() || !adjustment.amount || Number(adjustment.amount) <= 0) { setError('مبلغ مثبت، دلیل و تاریخ تعدیل الزامی هستند.'); return; }
    setBusy(true); setError('');
    try {
      await payrollService.createAdjustment(selected.id, { ...adjustment, amount: Number(adjustment.amount), reason: adjustment.reason.trim() });
      setAdjustments(await payrollService.listAdjustments(selected.id)); setAdjustmentOpen(false);
      setAdjustment({ type: 'bonus', amount: '', reason: '', adjustmentDate: selected.periodStart?.slice(0, 10) || inputDate() });
      setSuccess('تعدیل حقوق ثبت شد و در محاسبه این پیش‌نویس لحاظ می‌شود.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت تعدیل انجام نشد.'); }
    finally { setBusy(false); }
  };

  const removeAdjustment = async (adjustmentId: string) => {
    if (!selected || !window.confirm('این تعدیل از پیش‌نویس حقوق حذف شود؟')) return;
    setBusy(true); setError('');
    try { await payrollService.removeAdjustment(selected.id, adjustmentId); setAdjustments((items) => items.filter((item) => item.id !== adjustmentId)); setSuccess('تعدیل حذف شد.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'حذف تعدیل انجام نشد.'); }
    finally { setBusy(false); }
  };

  const createCompensation = async () => {
    const selectedEmployee = employees.find((employee) => employee.id === compensation.employeeId);
    const paymentMethod = selectedEmployee?.compensationType;
    const rate = Number(compensation.rate);
    const minutesPerDay = Number(compensation.minutesPerDay);
    if (!selectedEmployee || !paymentMethod || !compensation.effectiveFrom || !(rate > 0)) { setError('کارمند، تاریخ شروع و نرخ/حقوق مثبت الزامی هستند.'); return; }
    if (paymentMethod === 'full_time_attendance' && (!compensation.workdays.length || !(minutesPerDay > 0))) {
      setError('برای روش تمام‌وقت، روزهای کاری و دقیقه کار روزانه الزامی است.'); return;
    }
    setBusy(true); setError('');
    try {
      const days = paymentMethod === 'full_time_attendance'
        ? compensation.workdays.map((weekday) => ({ weekday, expectedMinutes: minutesPerDay }))
        : [];
      await compensationRepository.create({
        employeeId: compensation.employeeId,
        paymentMethod,
        effectiveFrom: compensation.effectiveFrom,
        currency: 'IRR', payPeriod: 'monthly', status: 'active',
        hourlyRate: paymentMethod === 'hourly_task' ? rate : undefined,
        monthlySalary: paymentMethod === 'full_time_attendance' ? rate : undefined,
        expectedSchedule: { timezone: 'Asia/Tehran', days, weeklyExpectedMinutes: days.reduce((sum, day) => sum + day.expectedMinutes, 0) },
        overtimeEnabled: paymentMethod === 'full_time_attendance' && compensation.overtimeEnabled,
        overtimeRateMultiplier: Number(compensation.overtimeRateMultiplier) || 1.4,
        notes: compensation.notes.trim() || undefined,
      } as Omit<EmploymentCompensation, 'id'>);
      setCompensationOpen(false); setSuccess('روش پرداخت و پیکربندی جبران خدمت در سرور ثبت شد.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت پیکربندی جبران خدمت انجام نشد.'); }
    finally { setBusy(false); }
  };

  const configuredEmployees = new Set(compensations.filter((item) => item.status === 'active').map((item) => item.employeeId));
  const missingCompensation = employees.filter((employee) => employee.employmentStatus === 'active' && !configuredEmployees.has(employee.id));

  return <Box>
    <PageHeader title="حقوق و مزایا" subtitle="محاسبه، بازبینی، تأیید و پرداخت بر اساس زمان و پیکربندی ثبت‌شده در سرور" actions={<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}><CsvToolbar rows={rows} entityLabel="حقوق و مزایا" filename={`payroll-${period}.csv`} columns={[
      { key: 'employee', label: 'کارمند', value: (record) => employeeName(record.employeeId) },
      { key: 'method', label: 'روش پرداخت', value: (record) => record.paymentMethod === 'hourly_task' ? 'ساعتی / وظیفه‌ای' : 'تمام‌وقت / حضور' },
      { key: 'period', label: 'دوره', value: (record) => record.month }, { key: 'hours', label: 'ساعات حقوق', value: (record) => (record.payrollMinutes ?? 0) / 60 },
      { key: 'rate', label: 'نرخ', value: (record) => record.hourlyRate ?? record.compensationSnapshot?.monthlySalary ?? 0 },
      { key: 'base', label: 'مبلغ پایه', value: (record) => record.grossBaseAmount ?? record.baseSalary },
      { key: 'adjustments', label: 'افزایش‌ها', value: positiveAdjustments }, { key: 'gross', label: 'ناخالص', value: grossAmount },
      { key: 'deductions', label: 'کسورات', value: deductionAmount }, { key: 'net', label: 'خالص', value: netAmount },
      { key: 'status', label: 'وضعیت', value: (record) => statusLabels[record.status] },
    ]} /><Button variant="outlined" onClick={() => { setCompensation({ employeeId: '', paymentMethod: 'hourly_task', effectiveFrom: inputDate(), rate: '', workdays: [6, 0, 1, 2, 3], minutesPerDay: '480', overtimeEnabled: false, overtimeRateMultiplier: '1.4', notes: '' }); setCompensationOpen(true); setError(''); }}>تعریف روش پرداخت</Button><Button variant="contained" onClick={() => { setDraft({ employeeId: '', ...initialPeriod() }); setDraftOpen(true); setError(''); }}>ایجاد پیش‌نویس حقوق</Button></Stack>} />

    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {missingCompensation.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{missingCompensation.length.toLocaleString('fa-IR')} کارمند فعال هنوز روش پرداخت مؤثر ندارد و تا زمان تعریف آن، پیش‌نویس حقوق برای او محاسبه نمی‌شود.</Alert>}
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}>
      <SummaryCard title="کارکنان دوره" value={rows.length.toLocaleString('fa-IR')} />
      <SummaryCard title="منتظر اقدام" value={rows.filter((record) => record.status !== 'paid').length.toLocaleString('fa-IR')} />
      <SummaryCard title="جمع ناخالص" value={amount(totalGross)} color="primary.main" />
      <SummaryCard title="جمع خالص" value={amount(totalNet)} color="success.main" />
    </Box>
    <Card sx={{ p: 2, mb: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}><FormControl size="small" sx={{ minWidth: 260 }}><InputLabel>دوره حقوق</InputLabel><Select label="دوره حقوق" value={period} onChange={(event) => setPeriod(event.target.value)}><MenuItem value="all">همه دوره‌ها</MenuItem>{periods.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl><Typography variant="body2" color="text.secondary">هر ردیف یک اسنپ‌شات مستقل است؛ برای دیدن منابع زمان، تعدیلات و ردپای تأیید روی ردیف کلیک کنید.</Typography></Stack></Card>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(record) => record.id} onRowClick={(record) => void openDetails(record)} emptyTitle="برای این دوره حقوقی ثبت نشده است" emptyDescription="یک پیش‌نویس ایجاد کنید؛ محاسبات پس از تأیید سرور نمایش داده می‌شوند." initialHiddenColumns={['period']} columns={[
      { key: 'employee', label: 'کارمند', value: (record) => employeeName(record.employeeId), render: (record) => <Box><Typography sx={{ fontWeight: 900 }}>{employeeName(record.employeeId)}</Typography><Typography variant="caption" color="text.secondary">{employees.find((employee) => employee.id === record.employeeId)?.personnelCode ?? record.employeeId}</Typography></Box> },
      { key: 'method', label: 'روش پرداخت', value: (record) => record.paymentMethod ?? '', render: (record) => <Chip size="small" variant="outlined" color="primary" label={record.paymentMethod === 'hourly_task' ? 'ساعتی / وظیفه‌ای' : 'تمام‌وقت / حضور'} /> },
      { key: 'period', label: 'دوره', value: (record) => record.month },
      { key: 'hours', label: 'ساعات', value: (record) => (record.payrollMinutes ?? 0) / 60, render: (record) => <Box><Typography sx={{ fontWeight: 800 }}>{hours(record.payrollMinutes)}</Typography><Typography variant="caption" color="text.secondary">{record.paymentMethod === 'hourly_task' ? `تأیید وظیفه: ${hours(record.taskTimeMinutes)}` : `عادی ${hours(record.regularMinutes)} • اضافه ${hours(record.overtimeMinutes)}`}</Typography></Box> },
      { key: 'rate', label: 'نرخ / حقوق', value: (record) => record.hourlyRate ?? record.compensationSnapshot?.monthlySalary ?? 0, render: (record) => <Box><Typography>{amount(record.paymentMethod === 'hourly_task' ? record.hourlyRate : record.compensationSnapshot?.monthlySalary)}</Typography><Typography variant="caption" color="text.secondary">{record.paymentMethod === 'hourly_task' ? 'نرخ ساعتی snapshot' : 'حقوق دوره snapshot'}</Typography></Box> },
      { key: 'adjustments', label: 'افزایش‌ها', value: positiveAdjustments, render: (record) => amount(positiveAdjustments(record)) },
      { key: 'gross', label: 'ناخالص', value: grossAmount, render: (record) => amount(grossAmount(record)) },
      { key: 'deductions', label: 'کسورات', value: deductionAmount, render: (record) => amount(deductionAmount(record)) },
      { key: 'net', label: 'خالص', value: netAmount, render: (record) => <Typography sx={{ fontWeight: 900, color: 'success.main' }}>{amount(netAmount(record))}</Typography> },
      { key: 'status', label: 'تأیید / پرداخت', value: (record) => statusLabels[record.status], render: (record) => <Stack spacing={.5}><Chip size="small" color={statusColors[record.status]} label={statusLabels[record.status]} /><Typography variant="caption" color="text.secondary">{record.paidAt ? formatDate(record.paidAt) : record.approvedAt ? `تأیید ${formatDate(record.approvedAt)}` : 'برای اقدام باز کنید'}</Typography></Stack> },
    ]} /></Card>

    <DetailDialog record={selected} adjustments={adjustments} adjustmentsLoading={adjustmentsLoading} onClose={() => setSelected(null)} onAction={(action) => { setTransition(action); setError(''); }} onAddAdjustment={() => { setAdjustment({ type: 'bonus', amount: '', reason: '', adjustmentDate: selected?.periodStart?.slice(0, 10) || inputDate() }); setAdjustmentOpen(true); }} onRemoveAdjustment={(id) => void removeAdjustment(id)} />

    <Dialog open={draftOpen} onClose={() => !busy && setDraftOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ایجاد پیش‌نویس حقوق</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">روش پرداخت و نرخ از پیکربندی جبران خدمت کارمند در سرور خوانده می‌شود.</Alert><FormControl fullWidth><InputLabel>کارمند</InputLabel><Select label="کارمند" value={draft.employeeId} onChange={(event) => setDraft((current) => ({ ...current, employeeId: event.target.value }))}>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName} • {employee.personnelCode} • {employee.compensationType === 'hourly_task' ? 'پروژه‌ای/ساعتی' : 'تمام‌وقت/حضور'}</MenuItem>)}</Select></FormControl><TextField label="عنوان دوره" value={draft.month} onChange={(event) => setDraft((current) => ({ ...current, month: event.target.value }))} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth type="date" label="شروع دوره" value={draft.periodStart} onChange={(event) => setDraft((current) => ({ ...current, periodStart: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><TextField fullWidth type="date" label="پایان دوره" value={draft.periodEnd} onChange={(event) => setDraft((current) => ({ ...current, periodEnd: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /></Stack></Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setDraftOpen(false)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void createDraft()}>{busy ? 'در حال ثبت…' : 'ایجاد پیش‌نویس'}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(transition)} onClose={() => !busy && setTransition(null)} fullWidth maxWidth="sm"><DialogTitle>{transition === 'calculate' ? 'محاسبه حقوق' : transition === 'review' ? 'ثبت بازبینی' : transition === 'approve' ? 'تأیید حقوق' : 'ثبت پرداخت'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity={transition === 'pay' ? 'warning' : 'info'}>{transition === 'calculate' ? 'سرور منابع زمان تأییدشده، نرخ و تعدیلات را محاسبه و snapshot می‌کند.' : transition === 'review' ? 'با ثبت بازبینی، رکورد برای تأیید نهایی آماده می‌شود.' : transition === 'approve' ? 'با تأیید، رکورد آماده ثبت پرداخت خواهد شد.' : 'با ثبت پرداخت، رکورد مالی و سند پرداخت در سرور ایجاد می‌شوند. این اسناد تا زمان اجرای همگام‌سازی به سامانه حسابداری متصل سازمان ارسال نخواهند شد.'}</Alert><TextField label="دلیل / توضیح گردش کار" multiline minRows={2} value={transitionForm.reason} onChange={(event) => setTransitionForm((current) => ({ ...current, reason: event.target.value }))} />{transition === 'pay' && <><TextField type="date" label="تاریخ پرداخت" value={transitionForm.paidAt} onChange={(event) => setTransitionForm((current) => ({ ...current, paidAt: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><FormControl fullWidth><InputLabel>روش تسویه</InputLabel><Select label="روش تسویه" value={transitionForm.settlementMethod} onChange={(event) => setTransitionForm((current) => ({ ...current, settlementMethod: event.target.value as PayrollSettlementMethod }))}>{settlementMethodOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><TextField label="شماره پیگیری / مرجع پرداخت (اختیاری)" value={transitionForm.paymentReference} onChange={(event) => setTransitionForm((current) => ({ ...current, paymentReference: event.target.value }))} helperText="اگر خالی بماند، سرور یک مرجع پایدار برای سند ایجاد می‌کند." /><TextField label="یادداشت پرداخت" multiline minRows={2} value={transitionForm.paymentNote} onChange={(event) => setTransitionForm((current) => ({ ...current, paymentNote: event.target.value }))} /></>}</Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setTransition(null)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void runTransition()}>{busy ? 'در حال ثبت…' : 'تأیید و ثبت'}</Button></DialogActions></Dialog>

    <Dialog open={compensationOpen} onClose={() => !busy && setCompensationOpen(false)} fullWidth maxWidth="sm"><DialogTitle>تعریف روش پرداخت کارمند</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">این رکورد منبع نرخ و روش محاسبه حقوق است. برای تغییرات بعدی، بازه مؤثر قبلی باید بسته و رکورد جدید ایجاد شود.</Alert><FormControl fullWidth><InputLabel>کارمند</InputLabel><Select label="کارمند" value={compensation.employeeId} onChange={(event) => { const employeeId = event.target.value; const employee = employees.find((item) => item.id === employeeId); setCompensation((current) => ({ ...current, employeeId, paymentMethod: employee?.compensationType ?? current.paymentMethod })); }}>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName} • {employee.personnelCode}</MenuItem>)}</Select></FormControl><FormControl fullWidth><InputLabel>روش پرداخت</InputLabel><Select disabled label="روش پرداخت" value={compensation.paymentMethod}><MenuItem value="hourly_task">پروژه‌ای/ساعتی — پرداخت بر اساس ساعات تسک‌ها</MenuItem><MenuItem value="full_time_attendance">تمام‌وقت — حقوق ماهانه بر اساس کارکرد</MenuItem></Select></FormControl><Typography variant="caption" color="text.secondary">روش پرداخت از نوع جبران خدمت پروفایل کارمند خوانده می‌شود و در این فرم قابل تغییر مستقل نیست.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth type="date" label="شروع اعتبار" value={compensation.effectiveFrom} onChange={(event) => setCompensation((current) => ({ ...current, effectiveFrom: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><TextField fullWidth type="number" label={compensation.paymentMethod === 'hourly_task' ? 'نرخ هر ساعت' : 'حقوق ماهانه'} value={compensation.rate} onChange={(event) => setCompensation((current) => ({ ...current, rate: event.target.value }))} /></Stack>{compensation.paymentMethod === 'full_time_attendance' && <><Box><Typography variant="body2" sx={{ fontWeight: 800, mb: .5 }}>روزهای کاری مورد انتظار</Typography><Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }}>{weekdays.map((day) => <FormControlLabel key={day.value} control={<Checkbox checked={compensation.workdays.includes(day.value)} onChange={(event) => setCompensation((current) => ({ ...current, workdays: event.target.checked ? [...current.workdays, day.value] : current.workdays.filter((value) => value !== day.value) }))} />} label={day.label} />)}</Stack></Box><TextField type="number" label="دقیقه کار مورد انتظار در هر روز" value={compensation.minutesPerDay} onChange={(event) => setCompensation((current) => ({ ...current, minutesPerDay: event.target.value }))} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}><FormControlLabel control={<Checkbox checked={compensation.overtimeEnabled} onChange={(event) => setCompensation((current) => ({ ...current, overtimeEnabled: event.target.checked }))} />} label="محاسبه اضافه‌کاری" /><TextField disabled={!compensation.overtimeEnabled} type="number" label="ضریب اضافه‌کاری" value={compensation.overtimeRateMultiplier} onChange={(event) => setCompensation((current) => ({ ...current, overtimeRateMultiplier: event.target.value }))} /></Stack></>}<TextField label="یادداشت" multiline minRows={2} value={compensation.notes} onChange={(event) => setCompensation((current) => ({ ...current, notes: event.target.value }))} /></Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setCompensationOpen(false)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void createCompensation()}>{busy ? 'در حال ثبت…' : 'ثبت روش پرداخت'}</Button></DialogActions></Dialog>

    <Dialog open={adjustmentOpen} onClose={() => !busy && setAdjustmentOpen(false)} fullWidth maxWidth="sm"><DialogTitle>افزودن تعدیل حقوق</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>نوع</InputLabel><Select label="نوع" value={adjustment.type} onChange={(event) => setAdjustment((current) => ({ ...current, type: event.target.value as PayrollAdjustmentType }))}>{Object.entries(adjustmentLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><TextField type="number" label="مبلغ" value={adjustment.amount} onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))} slotProps={{ htmlInput: { min: 1 } }} /><TextField label="دلیل" required multiline minRows={2} value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} /><TextField type="date" label="تاریخ" value={adjustment.adjustmentDate} onChange={(event) => setAdjustment((current) => ({ ...current, adjustmentDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setAdjustmentOpen(false)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void addAdjustment()}>{busy ? 'در حال ثبت…' : 'ثبت تعدیل'}</Button></DialogActions></Dialog>

    <Snackbar open={Boolean(success)} autoHideDuration={4500} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" variant="filled" onClose={() => setSuccess('')}>{success}</Alert></Snackbar>
  </Box>;
}
