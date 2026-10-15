import { OpenInNewOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography, useTheme } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { employees, payrollRepository, users } from '../services/repositories.ts';
import type { AccountingSubmissionStatus, PayrollRecord } from '../types/index.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';
import { accountingSubmissionLabels, payrollPaidAmount, summarizePaidPayroll } from '../utils/payrollFinance.ts';

const accountingColors: Record<AccountingSubmissionStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  not_submitted: 'default', queued: 'warning', submitted: 'info', synced: 'success', error: 'error',
};
const paymentMethodLabels = { hourly_task: 'پروژه‌ای/ساعتی', full_time_attendance: 'تمام‌وقت/حضور' } as const;
const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? users.find((user) => user.id === id)?.name ?? id;
const compactCurrency = (value: number) => new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

function Stat({ label, value, color = 'text.primary' }: { label: string; value: string; color?: string }) {
  return <Card variant="outlined"><CardContent sx={{ p: 1.7, '&:last-child': { pb: 1.7 } }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: .5, fontWeight: 900, color }}>{value}</Typography></CardContent></Card>;
}

export default function PayrollFinancePage() {
  const theme = useTheme();
  const [records, setRecords] = useState(() => payrollRepository.list());
  useEffect(() => payrollRepository.subscribe(setRecords), []);
  const summary = useMemo(() => summarizePaidPayroll(records), [records]);
  const paidRows = useMemo(() => [...summary.paidRecords].sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? ''))), [summary.paidRecords]);
  const pieColors: Record<AccountingSubmissionStatus, string> = {
    not_submitted: theme.palette.grey[500], queued: theme.palette.warning.main, submitted: theme.palette.info.main,
    synced: theme.palette.success.main, error: theme.palette.error.main,
  };

  return <Box>
    <PageHeader
      title="حقوق‌های ثبت‌شده"
      subtitle="نمای مالی پرداخت‌های قطعی حقوق و وضعیت ارسال اسناد به سامانه حسابداری"
      crumbs={['تری‌لیز', 'امور مالی', 'حقوق‌های ثبت‌شده']}
      actions={<Stack direction="row" spacing={1}><CsvToolbar rows={paidRows} entityLabel="حقوق پرداخت‌شده" filename="paid-payroll.csv" columns={[
        { key: 'employee', label: 'کارمند', value: (row) => employeeName(row.employeeId) },
        { key: 'month', label: 'دوره', value: (row) => row.month },
        { key: 'paidAt', label: 'تاریخ پرداخت', value: (row) => row.paidAt ?? '' },
        { key: 'amount', label: 'مبلغ خالص', value: (row) => payrollPaidAmount(row) },
        { key: 'document', label: 'شماره سند', value: (row) => row.paymentDocumentNumber ?? '' },
        { key: 'accounting', label: 'وضعیت حسابداری', value: (row) => accountingSubmissionLabels[row.accountingSubmissionStatus ?? 'not_submitted'] },
      ]} /><Button component={Link} to="/hr/payroll" variant="outlined" endIcon={<OpenInNewOutlined />}>گردش کار حقوق</Button></Stack>}
    />
    <Alert severity="info" sx={{ mb: 2 }}>این صفحه فقط گزارش مالی است. محاسبه، بازبینی، تأیید و ثبت پرداخت حقوق فقط از مسیر «منابع انسانی ← حقوق و مزایا» انجام می‌شود و ارقام اینجا مستقیماً از snapshot قطعی backend خوانده می‌شوند.</Alert>

    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, mb: 2 }}>
      <Stat label="جمع خالص پرداخت‌شده" value={formatCurrency(summary.totalNet)} color="success.main" />
      <Stat label="تعداد پرداخت قطعی" value={summary.paidRecords.length.toLocaleString('fa-IR')} />
      <Stat label="کسورات ثبت‌شده" value={formatCurrency(summary.totalDeductions)} color="warning.main" />
      <Stat label="در انتظار ارسال حسابداری" value={summary.pendingAccounting.toLocaleString('fa-IR')} color={summary.pendingAccounting ? 'warning.main' : 'success.main'} />
    </Box>

    {!paidRows.length ? <Alert severity="warning">هنوز هیچ رکورد حقوقی به مرحله «پرداخت‌شده» نرسیده است. پس از ثبت پرداخت در گردش کار حقوق، رکورد و سند پرداخت به‌صورت خودکار در این گزارش نمایش داده می‌شوند.</Alert> : <>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.7fr) minmax(320px, .8fr)' }, mb: 2 }}>
        <Card variant="outlined"><CardContent><Typography sx={{ fontWeight: 800, mb: .5 }}>روند پرداخت حقوق بر اساس دوره</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>مقایسه مبلغ ناخالص، کسورات و مبلغ خالص پرداخت‌شده</Typography><Box sx={{ height: 330, direction: 'ltr' }}><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.periods} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} /><XAxis dataKey="period" tick={{ fill: theme.palette.text.secondary }} /><YAxis tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fill: theme.palette.text.secondary }} /><Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} /><Legend /><Bar dataKey="gross" name="ناخالص" fill={theme.palette.primary.main} radius={[5, 5, 0, 0]} /><Bar dataKey="deductions" name="کسورات" fill={theme.palette.warning.main} radius={[5, 5, 0, 0]} /><Bar dataKey="net" name="خالص پرداختی" fill={theme.palette.success.main} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Box></CardContent></Card>
        <Card variant="outlined"><CardContent><Typography sx={{ fontWeight: 800, mb: .5 }}>وضعیت ارسال به حسابداری</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>وضعیت اسناد پرداخت در اتصال حسابداری سازمان</Typography><Box sx={{ height: 250, direction: 'ltr' }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.accountingStatuses} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={3}>{summary.accountingStatuses.map((item) => <Cell key={item.status} fill={pieColors[item.status]} />)}</Pie><Tooltip formatter={(value) => Number(value ?? 0).toLocaleString('fa-IR')} /></PieChart></ResponsiveContainer></Box><Stack spacing={.75}>{summary.accountingStatuses.map((item) => <Stack key={item.status} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Chip size="small" color={accountingColors[item.status]} label={item.label} /><Typography sx={{ fontWeight: 800 }}>{item.count.toLocaleString('fa-IR')}</Typography></Stack>)}</Stack></CardContent></Card>
      </Box>

      <Card variant="outlined"><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>سوابق پرداخت قطعی</Typography><DataTable rows={paidRows} getRowId={(row) => row.id} toolbar={<Typography variant="caption" color="text.secondary">برای محدود کردن گزارش از فیلتر ستون‌ها استفاده کنید.</Typography>} columns={[
        { key: 'employee', label: 'کارمند', value: (row: PayrollRecord) => employeeName(row.employeeId) },
        { key: 'method', label: 'نوع پرداخت', value: (row: PayrollRecord) => paymentMethodLabels[row.paymentMethod ?? row.compensationSnapshot?.paymentMethod ?? 'full_time_attendance'] },
        { key: 'month', label: 'دوره', value: (row: PayrollRecord) => row.month },
        { key: 'paidAt', label: 'تاریخ پرداخت', value: (row: PayrollRecord) => row.paidAt ? formatDate(row.paidAt) : '—' },
        { key: 'gross', label: 'ناخالص', value: (row: PayrollRecord) => formatCurrency(Number(row.grossAmount ?? payrollPaidAmount(row) + Number(row.deductionAmount ?? row.deductions ?? 0))) },
        { key: 'deductions', label: 'کسورات', value: (row: PayrollRecord) => formatCurrency(Number(row.deductionAmount ?? row.deductions ?? 0)) },
        { key: 'net', label: 'خالص پرداختی', value: (row: PayrollRecord) => formatCurrency(payrollPaidAmount(row)) },
        { key: 'document', label: 'سند پرداخت', value: (row: PayrollRecord) => row.paymentDocumentNumber || row.paymentDocumentId || '—' },
        { key: 'reference', label: 'مرجع پرداخت', value: (row: PayrollRecord) => row.paymentReference || '—' },
        { key: 'accounting', label: 'وضعیت حسابداری', value: (row: PayrollRecord) => row.accountingSubmissionStatus ?? 'not_submitted', render: (row: PayrollRecord) => { const status = row.accountingSubmissionStatus ?? 'not_submitted'; return <Chip size="small" color={accountingColors[status]} label={accountingSubmissionLabels[status]} />; } },
      ]} /></CardContent></Card>
    </>}
  </Box>;
}
