import { Add, ArrowBack, Search } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Divider, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import QuickCreateDialog from '../components/common/QuickCreateDialog.tsx';
import EntityFormDialog, { type EntityField } from '../components/common/EntityFormDialog.tsx';
import { bankAccounts, contracts, customers, installments, invoices, leads, payments, products, proposals, projects, users } from '../mock/data.ts';
import type { Invoice, PaymentMethod, PaymentStatus, Product } from '../types/index.ts';
import { formatCurrency, formatDate, formatRelative } from '../utils/format.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { invoicePaidAmount, lineItemTotals } from '../utils/finance.ts';
import { contractRepository, installmentRepository, invoiceRepository, leadRepository, paymentRepository, productRepository, proposalRepository } from '../services/repositories.ts';

const statusLabels: Record<string, string> = { new: 'جدید', contacted: 'تماس گرفته شد', qualified: 'واجد شرایط', lost: 'از دست‌رفته', converted: 'تبدیل‌شده', draft: 'پیش‌نویس', sent: 'ارسال‌شده', viewed: 'مشاهده شده', approved: 'پذیرفته شده', rejected: 'رد شده', expired: 'منقضی شده', issued: 'صادر شده', partial: 'بخشی پرداخت شده', paid: 'تسویه شده', overdue: 'سررسید شده', cancelled: 'لغو شده', active: 'فعال', expiring: 'در حال انقضا', pending: 'در انتظار امضا', terminated: 'فسخ شده', future: 'آینده', due: 'نزدیک به سررسید' };
const colorFor = (status: string) => ['paid', 'approved', 'active', 'converted', 'issued'].includes(status) ? 'success' : ['overdue', 'lost', 'expired', 'rejected', 'terminated'].includes(status) ? 'error' : ['sent', 'viewed', 'qualified', 'partial', 'due', 'expiring'].includes(status) ? 'warning' : 'default';
const customerName = (id: string) => { const item = customers.find((x) => x.id === id); return item ? `${item.code ?? `C-${600000 + Number(item.id.slice(1))}`} — ${item.company}` : '—'; };
const projectDisplayName = (id?: string) => { const item = projects.find((x) => x.id === id); return item ? `${item.code ?? `P-${700000 + Number(item.id.slice(1))}`} — ${item.name}` : '—'; };
const statusChip = (status: string) => <Chip size="small" color={colorFor(status) as 'default'} label={statusLabels[status] ?? status} />;
const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٬,]/g, '');
const csvField = (row: Record<string, string>, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== '') ?? '';
const resolveCustomerId = (value: string) => customers.find((customer) => customer.id === value || customer.company === value || customer.name === value || `${customer.code ?? ''} — ${customer.company}` === value)?.id ?? customers[0]?.id;
const resolveProjectId = (value: string) => projects.find((project) => project.id === value || project.name === value || `${project.code ?? ''} — ${project.name}` === value)?.id;
const customerForProject = (projectId?: string, fallback?: string) => projects.find((project) => project.id === projectId)?.customerId ?? fallback ?? customers[0]?.id;
const importPayments = (items: Record<string, string>[]) => importFinanceRows(items, (row) => {
  const invoice = invoices.find((item) => item.id === (csvField(row, 'فاکتور', 'invoiceId')) || item.number === csvField(row, 'فاکتور', 'invoiceId'));
  paymentRepository.create({ ...payments[0], id: undefined, receiptNumber: csvField(row, 'شماره پرداخت', 'receipt'), customerId: invoice?.customerId ?? customers[0].id, invoiceId: invoice?.id ?? invoices[0].id, projectId: invoice?.projectId, amount: Number(normalizeDigits(csvField(row, 'مبلغ', 'amount'))) || 0, paidAt: new Date().toISOString(), method: 'انتقال بانکی', reference: csvField(row, 'شماره پیگیری', 'reference') || 'CSV', status: 'در انتظار تایید' });
}, ['شماره پرداخت', 'receipt']);
function importFinanceRows(rows: Record<string, string>[], create: (row: Record<string, string>) => void, required: string[]) {
  const errors: string[] = []; let created = 0;
  rows.forEach((row, index) => {
    const missing = required.filter((key) => !csvField(row, key).trim());
    if (missing.length) { errors.push(`ردیف ${index + 2}: ستون‌های الزامی کامل نیستند (${missing.join('، ')})`); return; }
    try { create(row); created += 1; } catch { errors.push(`ردیف ${index + 2}: قالب داده قابل پردازش نیست`); }
  });
  return { created, errors };
}

function Shell({ title, subtitle, children, action }: { title: string; subtitle: string; children: ReactNode; action?: ReactNode }) {
  const formFields = title.includes('مشتریان احتمالی') ? ['نام', 'شرکت', 'ایمیل', 'تلفن', 'ارزش مشتری احتمالی', 'منبع', 'توضیحات'] : title.includes('پیش‌فاکتور') ? ['شماره پیش‌فاکتور', 'مشتری', 'پروژه', 'تاریخ صدور', 'تاریخ اعتبار', 'مبلغ', 'تخفیف', 'مالیات'] : title.includes('فاکتور') ? ['شماره فاکتور', 'مشتری', 'پروژه', 'تاریخ صدور', 'تاریخ سررسید', 'مبلغ', 'تخفیف', 'مالیات'] : title.includes('پرداخت') ? ['مشتری', 'فاکتور', 'پروژه', 'مبلغ', 'تاریخ پرداخت', 'روش پرداخت', 'شماره پیگیری', 'توضیحات'] : title.includes('محصولات') ? ['نام محصول / خدمت', 'کد محصول', 'دسته‌بندی', 'نوع', 'واحد', 'قیمت', 'نرخ مالیات'] : title.includes('قرارداد') ? ['عنوان قرارداد', 'شماره قرارداد', 'مشتری', 'پروژه', 'تاریخ شروع', 'تاریخ پایان', 'مبلغ', 'شرایط پرداخت'] : title.includes('اقساط') ? ['مشتری', 'قرارداد', 'فاکتور', 'پروژه', 'شماره قسط', 'سررسید', 'مبلغ'] : ['عنوان', 'توضیحات'];
  const defaultAction = action ?? <QuickCreateDialog title={`ایجاد ${title}`} fields={formFields} />;
  return <Box><PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>{action ? null : csvFor(title)}{defaultAction}</Stack>} />{children}</Box>;
}

function FinanceCreateButton({ title, fields, onSave }: { title: string; fields: EntityField[]; onSave: (values: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>ایجاد مورد جدید</Button><EntityFormDialog open={open} onClose={() => setOpen(false)} title={title} fields={fields} onSubmit={async (values) => onSave(values)} /></>;
}
function csvFor(title: string): ReactNode {
  if (title === 'مشتریان احتمالی') return <CsvToolbar rows={leads} entityLabel="مشتریان احتمالی" filename="leads.csv" columns={[{ key: 'name', label: 'نام', value: (x) => x.name }, { key: 'company', label: 'شرکت', value: (x) => x.company }, { key: 'email', label: 'ایمیل', value: (x) => x.email }, { key: 'تلفن', label: 'تلفن', value: (x) => x.phone }, { key: 'status', label: 'وضعیت', value: (x) => statusLabels[x.status] ?? x.status }, { key: 'value', label: 'ارزش احتمالی', value: (x) => x.estimatedValue }]} />;
  if (title === 'پیش‌فاکتورها') return <CsvToolbar rows={proposals} entityLabel="پیش‌فاکتورها" filename="proformas.csv" columns={[{ key: 'number', label: 'شماره', value: (x) => x.number }, { key: 'customer', label: 'مشتری', value: (x) => customerName(x.customerId) }, { key: 'project', label: 'پروژه', value: (x) => projectDisplayName(x.projectId) }, { key: 'issuedAt', label: 'تاریخ صدور', value: (x) => x.issuedAt }, { key: 'validUntil', label: 'اعتبار تا', value: (x) => x.validUntil }, { key: 'amount', label: 'مبلغ', value: (x) => x.amount }, { key: 'status', label: 'وضعیت', value: (x) => statusLabels[x.status] ?? x.status }]} />;
  if (title === 'فاکتورها') return <CsvToolbar rows={invoices} entityLabel="فاکتورها" filename="invoices.csv" columns={[{ key: 'number', label: 'شماره فاکتور', value: (x) => x.number }, { key: 'customer', label: 'مشتری', value: (x) => customerName(x.customerId) }, { key: 'project', label: 'پروژه', value: (x) => projectDisplayName(x.projectId) }, { key: 'issuedAt', label: 'تاریخ صدور', value: (x) => x.issuedAt }, { key: 'dueDate', label: 'سررسید', value: (x) => x.dueDate }, { key: 'amount', label: 'مبلغ', value: (x) => lineItemTotals(x.items).total }, { key: 'paidAmount', label: 'دریافت‌شده', value: (x) => invoicePaidAmount(x, payments) }, { key: 'balance', label: 'مانده', value: (x) => lineItemTotals(x.items).total - invoicePaidAmount(x, payments) }, { key: 'status', label: 'وضعیت', value: (x) => statusLabels[x.status] ?? x.status }]} />;
  if (title === 'پرداخت‌ها') return <CsvToolbar rows={payments} entityLabel="پرداخت‌ها" filename="payments.csv" columns={[{ key: 'receiptNumber', label: 'شماره پرداخت', value: (x) => x.receiptNumber }, { key: 'customer', label: 'مشتری', value: (x) => customerName(x.customerId) }, { key: 'invoice', label: 'فاکتور', value: (x) => invoices.find((i) => i.id === x.invoiceId)?.number }, { key: 'project', label: 'پروژه', value: (x) => projectDisplayName(x.projectId) }, { key: 'amount', label: 'مبلغ', value: (x) => x.amount }, { key: 'paidAt', label: 'تاریخ', value: (x) => x.paidAt }, { key: 'method', label: 'روش پرداخت', value: (x) => x.method }, { key: 'status', label: 'وضعیت', value: (x) => x.status }]} />;
  if (title === 'محصولات و خدمات') return <CsvToolbar rows={products} entityLabel="محصولات و خدمات" filename="products.csv" columns={[{ key: 'name', label: 'نام', value: (x) => x.name }, { key: 'sku', label: 'کد', value: (x) => x.sku }, { key: 'category', label: 'دسته‌بندی', value: (x) => x.category }, { key: 'type', label: 'نوع', value: (x) => x.type }, { key: 'unit', label: 'واحد', value: (x) => x.unit }, { key: 'price', label: 'قیمت', value: (x) => x.price }, { key: 'status', label: 'وضعیت', value: () => 'فعال' }]} />;
  if (title === 'قراردادها') return <CsvToolbar rows={contracts} entityLabel="قراردادها" filename="contracts.csv" columns={[{ key: 'number', label: 'شماره قرارداد', value: (x) => x.number }, { key: 'title', label: 'عنوان', value: (x) => x.title }, { key: 'customer', label: 'مشتری', value: (x) => customerName(x.customerId) }, { key: 'project', label: 'پروژه', value: (x) => projectDisplayName(x.projectId) }, { key: 'startDate', label: 'تاریخ شروع', value: (x) => x.startDate }, { key: 'endDate', label: 'تاریخ پایان', value: (x) => x.endDate }, { key: 'amount', label: 'مبلغ', value: (x) => x.amount }, { key: 'status', label: 'وضعیت', value: (x) => statusLabels[x.status] ?? x.status }]} />;
  if (title === 'لیست اقساط') return <CsvToolbar rows={installments} entityLabel="اقساط" filename="installments.csv" columns={[{ key: 'number', label: 'قسط', value: (x) => x.number }, { key: 'customer', label: 'مشتری', value: (x) => customerName(x.customerId ?? '') }, { key: 'project', label: 'پروژه', value: (x) => projectDisplayName(x.projectId) }, { key: 'dueDate', label: 'سررسید', value: (x) => x.dueDate }, { key: 'amount', label: 'مبلغ', value: (x) => x.amount }, { key: 'paidAmount', label: 'پرداخت‌شده', value: (x) => x.paidAmount }, { key: 'status', label: 'وضعیت', value: (x) => statusLabels[x.status] ?? x.status }]} />;
  return null;
}
function Filters({ query, setQuery, status, setStatus, statuses, customer, setCustomer, methods }: { query: string; setQuery: (v: string) => void; status?: string; setStatus?: (v: string) => void; statuses?: string[]; customer?: string; setCustomer?: (v: string) => void; methods?: string[] }) {
  return <Card sx={{ p: 2, mb: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}><TextField fullWidth placeholder="جستجو بر اساس شماره، مشتری یا عنوان..." value={query} onChange={(e) => setQuery(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />{statuses && setStatus && <FormControl sx={{ minWidth: 180 }}><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={status ?? 'all'} onChange={(e) => setStatus(e.target.value)}><MenuItem value="all">همه وضعیت‌ها</MenuItem>{statuses.map((s) => <MenuItem key={s} value={s}>{statusLabels[s] ?? s}</MenuItem>)}</Select></FormControl>}{setCustomer && <FormControl sx={{ minWidth: 200 }}><InputLabel>مشتری</InputLabel><Select label="مشتری" value={customer ?? 'all'} onChange={(e) => setCustomer(e.target.value)}><MenuItem value="all">همه مشتریان</MenuItem>{customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.company}</MenuItem>)}</Select></FormControl>}{methods && <FormControl sx={{ minWidth: 180 }}><InputLabel>روش پرداخت</InputLabel><Select label="روش پرداخت" defaultValue="all"><MenuItem value="all">همه روش‌ها</MenuItem>{methods.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}</Select></FormControl>}</Stack></Card>;
}
function StatStrip({ items }: { items: { label: string; value: string; tone?: 'success' | 'warning' | 'error' }[] }) {
  return <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: `repeat(${items.length}, 1fr)` }, mb: 2 }}>{items.map((item) => <Card key={item.label}><CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Typography variant="h6" sx={{ fontWeight: 800, mt: .5, color: item.tone ? `${item.tone}.main` : 'text.primary' }}>{item.value}</Typography></CardContent></Card>)}</Box>;
}
function ItemsTable({ invoice }: { invoice: Invoice }) {
  return <Table size="small"><TableHead><TableRow>{['محصول / خدمت', 'تعداد', 'قیمت واحد', 'تخفیف', 'مالیات', 'مبلغ'].map((x) => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{invoice.items.map((item) => { const p = products.find((x) => x.id === item.productId); const gross = item.quantity * item.unitPrice; const total = gross - item.discount + item.tax; return <TableRow key={item.productId}><TableCell sx={{ fontWeight: 700 }}>{p?.name}</TableCell><TableCell>{item.quantity} {p?.unit}</TableCell><TableCell>{formatCurrency(item.unitPrice)}</TableCell><TableCell>{formatCurrency(item.discount)}</TableCell><TableCell>{formatCurrency(item.tax)}</TableCell><TableCell>{formatCurrency(total)}</TableCell></TableRow>; })}<TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell colSpan={5} sx={{ fontWeight: 800 }}>جمع محاسبه‌شده</TableCell><TableCell sx={{ fontWeight: 800 }}>{formatCurrency(lineItemTotals(invoice.items).total)}</TableCell></TableRow></TableBody></Table>;
}

const tableColumns = {
  leads: [
    { key: 'name', label: 'نام', value: (row: typeof leads[number]) => row.name },
    { key: 'company', label: 'شرکت', value: (row: typeof leads[number]) => row.company },
    { key: 'email', label: 'ایمیل', value: (row: typeof leads[number]) => row.email },
    { key: 'value', label: 'ارزش احتمالی', value: (row: typeof leads[number]) => row.estimatedValue, aggregate: 'sum' as const, render: (row: typeof leads[number]) => formatCurrency(row.estimatedValue) },
    { key: 'status', label: 'وضعیت', value: (row: typeof leads[number]) => statusLabels[row.status] ?? row.status, render: (row: typeof leads[number]) => statusChip(row.status) },
  ],
};

function ModernLeadsPage() {
  const [rows, setRows] = useState(() => leadRepository.list());
  useEffect(() => leadRepository.subscribe(setRows), []);
  return <Shell title="مشتریان احتمالی" subtitle="قیف فروش از اولین تماس تا تبدیل به مشتری" action={<QuickCreateDialog title="ایجاد مشتری احتمالی" fields={['نام و شرکت', 'ایمیل', 'تلفن', 'ارزش احتمالی', 'توضیحات']} onSave={(v) => leadRepository.create({ ...leads[0], id: undefined, name: v['نام و شرکت'], company: v['نام و شرکت'], email: v['ایمیل'] ?? '', phone: v['تلفن'] ?? '', estimatedValue: Number(v['ارزش احتمالی']) || 0, status: 'new', source: 'ورودی جدید', notes: v['توضیحات'] ?? '', createdAt: new Date().toISOString(), lastContactAt: new Date().toISOString(), nextFollowUpAt: new Date().toISOString(), assignedTo: 'u1', tags: [] })} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} columns={tableColumns.leads} getRowId={(row) => row.id} searchPlaceholder="جستجوی نام، شرکت، ایمیل یا تلفن..." toolbar={<CsvToolbar rows={rows} entityLabel="مشتریان احتمالی" filename="leads.csv" columns={tableColumns.leads} onImport={(items) => importFinanceRows(items, (row) => leadRepository.create({ ...leads[0], id: undefined, name: csvField(row, 'نام', 'name'), company: csvField(row, 'شرکت', 'company') || csvField(row, 'نام', 'name'), email: csvField(row, 'ایمیل', 'email'), phone: csvField(row, 'تلفن', 'phone'), estimatedValue: Number(normalizeDigits(csvField(row, 'ارزش احتمالی', 'value'))) || 0, status: 'new', source: 'ورود CSV', notes: '', createdAt: new Date().toISOString(), lastContactAt: new Date().toISOString(), nextFollowUpAt: new Date().toISOString(), assignedTo: users[0].id, tags: [] }), ['نام', 'name'])} />} filters={[{ key: 'status', label: 'وضعیت', options: Object.entries(statusLabels).filter(([key]) => ['new', 'contacted', 'qualified', 'converted', 'lost'].includes(key)).map(([value, label]) => ({ value, label })), value: (row) => row.status }]} /></Card>
  </Shell>;
}

function ModernProformaPage() {
  const [rows, setRows] = useState(() => proposalRepository.list());
  useEffect(() => proposalRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'number', label: 'شماره پیش‌فاکتور', required: true },
    { name: 'customerId', label: 'مشتری', type: 'select', required: true, options: customers.map((x) => ({ value: x.id, label: customerName(x.id) })) },
    { name: 'projectId', label: 'پروژه', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectDisplayName(x.id) })) },
    { name: 'title', label: 'عنوان پیشنهاد', required: true },
    { name: 'amount', label: 'مبلغ پایه', type: 'number', required: true },
    { name: 'discount', label: 'تخفیف', type: 'number' },
    { name: 'tax', label: 'مالیات', type: 'number' },
    { name: 'validUntil', label: 'تاریخ اعتبار', type: 'date' },
  ];
  return <Shell title="پیش‌فاکتورها" subtitle="پیشنهاد قیمت، اعتبار و تبدیل به فاکتور" action={<FinanceCreateButton title="ایجاد پیش‌فاکتور" fields={fields} onSave={(v) => proposalRepository.create({ ...proposals[0], id: undefined, number: v.number, customerId: customerForProject(v.projectId, v.customerId), projectId: v.projectId || undefined, title: v.title, amount: Math.max(0, Number(v.amount) || 0) - (Number(v.discount) || 0) + (Number(v.tax) || 0), issuedAt: new Date().toISOString(), validUntil: v.validUntil || new Date().toISOString(), status: 'draft', items: [{ productId: products[0].id, quantity: 1, unitPrice: Number(v.amount) || 0, discount: Number(v.discount) || 0, tax: Number(v.tax) || 0 }], ownerId: 'u1', updatedAt: new Date().toISOString() })} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی شماره، مشتری یا پروژه..." toolbar={<CsvToolbar rows={rows} entityLabel="پیش‌فاکتورها" filename="proformas.csv" columns={[{ key: 'number', label: 'شماره', value: (row) => row.number }, { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) }, { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount }, { key: 'status', label: 'وضعیت', value: (row) => statusLabels[row.status] ?? row.status }]} onImport={(items) => importFinanceRows(items, (row) => { const projectId = resolveProjectId(csvField(row, 'پروژه', 'projectId')); proposalRepository.create({ ...proposals[0], id: undefined, number: csvField(row, 'شماره', 'number'), customerId: customerForProject(projectId, resolveCustomerId(csvField(row, 'مشتری', 'customerId'))), projectId, title: csvField(row, 'عنوان', 'title') || 'پیشنهاد واردشده', amount: Number(normalizeDigits(csvField(row, 'مبلغ', 'amount'))) || 0, status: 'draft', issuedAt: new Date().toISOString(), validUntil: new Date().toISOString(), ownerId: users[0].id, updatedAt: new Date().toISOString(), items: [] }); }, ['شماره', 'number'])} />} columns={[
    { key: 'number', label: 'شماره', value: (row) => row.number, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.number}</Typography> },
    { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) },
    { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) },
    { key: 'issuedAt', label: 'تاریخ صدور', value: (row) => row.issuedAt, render: (row) => formatDate(row.issuedAt) },
    { key: 'validUntil', label: 'اعتبار تا', value: (row) => row.validUntil, render: (row) => formatDate(row.validUntil) },
    { key: 'amount', label: 'مبلغ', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) },
    { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => statusChip(row.status) },
  ]} /></Card></Shell>;
}

function ModernInvoicesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(() => invoiceRepository.list());
  useEffect(() => invoiceRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'number', label: 'شماره فاکتور', required: true },
    { name: 'customerId', label: 'مشتری', type: 'select', required: true, options: customers.map((x) => ({ value: x.id, label: customerName(x.id) })) },
    { name: 'projectId', label: 'پروژه', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectDisplayName(x.id) })) },
    { name: 'amount', label: 'مبلغ پایه', type: 'number', required: true },
    { name: 'discount', label: 'تخفیف', type: 'number' },
    { name: 'tax', label: 'مالیات', type: 'number' },
    { name: 'dueDate', label: 'تاریخ سررسید', type: 'date' },
  ];
  return <Shell title="فاکتورها" subtitle="صدور، پیگیری و وضعیت وصول فاکتورهای مشتریان" action={<FinanceCreateButton title="ایجاد فاکتور" fields={fields} onSave={(v) => invoiceRepository.create({ ...invoices[0], id: undefined, number: v.number, customerId: customerForProject(v.projectId, v.customerId), projectId: v.projectId || undefined, amount: Math.max(0, Number(v.amount) || 0) - (Number(v.discount) || 0) + (Number(v.tax) || 0), paidAmount: 0, status: 'issued', issuedAt: new Date().toISOString(), dueDate: v.dueDate || new Date().toISOString(), items: [{ productId: products[0].id, quantity: 1, unitPrice: Number(v.amount) || 0, discount: Number(v.discount) || 0, tax: Number(v.tax) || 0 }] })} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی شماره فاکتور، مشتری یا پروژه..." toolbar={<CsvToolbar rows={rows} entityLabel="فاکتورها" filename="invoices.csv" columns={[{ key: 'number', label: 'شماره فاکتور', value: (row) => row.number }, { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) }, { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount }, { key: 'paid', label: 'پرداخت‌شده', value: (row) => row.paidAmount }, { key: 'balance', label: 'مانده', value: (row) => row.amount - row.paidAmount }]} onImport={(items) => importFinanceRows(items, (row) => { const projectId = resolveProjectId(csvField(row, 'پروژه', 'projectId')); invoiceRepository.create({ ...invoices[0], id: undefined, number: csvField(row, 'شماره فاکتور', 'number'), customerId: customerForProject(projectId, resolveCustomerId(csvField(row, 'مشتری', 'customerId'))), projectId, amount: Number(normalizeDigits(csvField(row, 'مبلغ', 'amount'))) || 0, paidAmount: 0, status: 'issued', issuedAt: new Date().toISOString(), dueDate: new Date().toISOString(), items: [] }); }, ['شماره فاکتور', 'number'])} />} columns={[
    { key: 'number', label: 'شماره فاکتور', value: (row) => row.number, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.number}</Typography> },
    { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) },
    { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) },
    { key: 'issuedAt', label: 'تاریخ صدور', value: (row) => row.issuedAt, render: (row) => formatDate(row.issuedAt) },
    { key: 'dueDate', label: 'سررسید', value: (row) => row.dueDate, render: (row) => formatDate(row.dueDate) },
    { key: 'amount', label: 'مبلغ کل', value: (row) => lineItemTotals(row.items).total, aggregate: 'sum', render: (row) => formatCurrency(lineItemTotals(row.items).total) },
    { key: 'paidAmount', label: 'پرداخت‌شده', value: (row) => invoicePaidAmount(row, payments), render: (row) => formatCurrency(invoicePaidAmount(row, payments)) },
    { key: 'balance', label: 'مانده', value: (row) => lineItemTotals(row.items).total - invoicePaidAmount(row, payments), render: (row) => formatCurrency(lineItemTotals(row.items).total - invoicePaidAmount(row, payments)) },
    { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => statusChip(row.status) },
  ]} onRowClick={(row) => navigate(`/invoices/${row.id}`)} /></Card></Shell>;
}

function ModernPaymentsPage() {
  const [rows, setRows] = useState(() => paymentRepository.list());
  useEffect(() => paymentRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'receiptNumber', label: 'شماره پرداخت', required: true },
    { name: 'invoiceId', label: 'فاکتور', type: 'select', required: true, options: invoices.map((x) => ({ value: x.id, label: x.number })) },
    { name: 'amount', label: 'مبلغ', type: 'number', required: true },
    { name: 'paidAt', label: 'تاریخ پرداخت', type: 'date', required: true },
    { name: 'method', label: 'روش پرداخت', type: 'select', options: ['انتقال بانکی', 'کارت', 'چک', 'نقدی', 'درگاه اینترنتی'].map((x) => ({ value: x, label: x })) },
    { name: 'reference', label: 'شماره پیگیری' },
  ];
  return <Shell title="پرداخت‌ها" subtitle="دفتر دریافت‌ها و تطبیق با فاکتورهای صادرشده" action={<FinanceCreateButton title="ثبت پرداخت" fields={fields} onSave={(v) => { const invoice = invoices.find((x) => x.id === v.invoiceId); const method = (v.method || 'انتقال بانکی') as PaymentMethod; paymentRepository.create({ ...payments[0], id: undefined, receiptNumber: v.receiptNumber, customerId: invoice?.customerId ?? customers[0].id, invoiceId: v.invoiceId, projectId: invoice?.projectId, amount: Number(v.amount) || 0, paidAt: v.paidAt || new Date().toISOString(), method, reference: v.reference || '—', status: 'ثبت شده' }); }} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی شماره پرداخت، مشتری یا پیگیری..." toolbar={<CsvToolbar rows={rows} entityLabel="پرداخت‌ها" filename="payments.csv" onImport={importPayments} columns={[{ key: 'receipt', label: 'شماره پرداخت', value: (row) => row.receiptNumber }, { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) }, { key: 'invoice', label: 'فاکتور', value: (row) => invoices.find((invoice) => invoice.id === row.invoiceId)?.number }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount }, { key: 'date', label: 'تاریخ', value: (row) => row.paidAt }]} />} columns={[
    { key: 'receipt', label: 'شماره پرداخت', value: (row) => row.receiptNumber, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.receiptNumber}</Typography> },
    { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) },
    { key: 'invoice', label: 'فاکتور', value: (row) => invoices.find((invoice) => invoice.id === row.invoiceId)?.number ?? '—' },
    { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) },
    { key: 'amount', label: 'مبلغ', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) },
    { key: 'paidAt', label: 'تاریخ', value: (row) => row.paidAt, render: (row) => formatDate(row.paidAt) },
    { key: 'method', label: 'روش پرداخت', value: (row) => row.method },
    { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => statusChip(row.status) },
  ]} /></Card></Shell>;
}

export function LegacyLeadsPage() {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [rows, setRows] = useState(leads);
  return <Shell title="مشتریان احتمالی" subtitle="قیف فروش از اولین تماس تا تبدیل به مشتری" action={<Stack direction="row" spacing={1}><CsvToolbar rows={rows} entityLabel="مشتریان احتمالی" filename="leads.csv" columns={[{ key: 'name', label: 'نام', value: (x) => x.name }, { key: 'company', label: 'شرکت', value: (x) => x.company }, { key: 'email', label: 'ایمیل', value: (x) => x.email }, { key: 'status', label: 'وضعیت', value: (x) => x.status }, { key: 'value', label: 'ارزش احتمالی', value: (x) => x.estimatedValue }]} /><QuickCreateDialog title="ایجاد مشتری احتمالی" fields={['نام و شرکت', 'ایمیل', 'تلفن', 'ارزش احتمالی', 'توضیحات']} onSave={(v) => setRows((items) => [{ ...leads[0], id: `lead-${Date.now()}`, name: v['نام و شرکت'], company: v['نام و شرکت'], email: v['ایمیل'] ?? '', phone: v['تلفن'] ?? '', estimatedValue: Number(v['ارزش احتمالی']) || 0, status: 'new', source: 'ورودی جدید', notes: v['توضیحات'] ?? '' }, ...items])} /></Stack>}><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={['new', 'contacted', 'qualified', 'converted', 'lost']} /><Card><Table><TableHead><TableRow>{['نام و شرکت', 'ارزش احتمالی', 'وضعیت', 'منبع', 'آخرین تماس', 'پیگیری بعدی', 'مسئول'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.filter((x) => `${x.name} ${x.company} ${x.email}`.includes(query.trim()) && (status === 'all' || x.status === status)).map((x) => <TableRow hover key={x.id}><TableCell><Typography sx={{ fontWeight: 700 }}>{x.name}</Typography><Typography variant="caption" color="text.secondary">{x.company}</Typography></TableCell><TableCell>{formatCurrency(x.estimatedValue)}</TableCell><TableCell>{statusChip(x.status)}</TableCell><TableCell>{x.source}</TableCell><TableCell>{formatRelative(x.lastContactAt)}</TableCell><TableCell>{formatDate(x.nextFollowUpAt)}</TableCell><TableCell>{users.find((u) => u.id === x.assignedTo)?.name}</TableCell></TableRow>)}</TableBody></Table></Card></Shell>;
}

export function LegacyProformaPage() {
  const navigate = useNavigate(); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [customer, setCustomer] = useState('all');
  const rows = proposals.filter((x) => `${x.number} ${x.title} ${customerName(x.customerId)}`.includes(query.trim()) && (status === 'all' || x.status === status) && (customer === 'all' || x.customerId === customer));
  return <Shell title="پیش‌فاکتورها" subtitle="پیشنهاد قیمت، اعتبار و تبدیل به فاکتور"><StatStrip items={[{ label: 'کل پیش‌فاکتورها', value: `${proposals.length}` }, { label: 'در انتظار پاسخ', value: `${proposals.filter((x) => ['sent', 'viewed'].includes(x.status)).length}`, tone: 'warning' }, { label: 'پذیرفته‌شده', value: `${proposals.filter((x) => x.status === 'approved').length}`, tone: 'success' }, { label: 'ارزش کل', value: formatCurrency(proposals.reduce((s, x) => s + x.amount, 0)) }]} /><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired']} customer={customer} setCustomer={setCustomer} /><Card><Table><TableHead><TableRow>{['شماره', 'مشتری', 'پروژه', 'تاریخ صدور', 'اعتبار تا', 'مبلغ', 'وضعیت', 'مسئول', 'آخرین بروزرسانی', 'عملیات'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell><Button size="small" onClick={() => navigate(`/proposals/${x.id}`)}>{x.number}</Button></TableCell><TableCell>{customerName(x.customerId)}</TableCell><TableCell>{projects.find((p) => p.id === x.projectId)?.name ?? '—'}</TableCell><TableCell>{formatDate(x.issuedAt)}</TableCell><TableCell>{formatDate(x.validUntil)}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{statusChip(x.status)}</TableCell><TableCell>{users.find((u) => u.id === x.ownerId)?.name}</TableCell><TableCell>{formatRelative(x.updatedAt)}</TableCell><TableCell><Button size="small" onClick={() => navigate(`/invoices/new?proposal=${x.id}`)}>تبدیل به فاکتور</Button></TableCell></TableRow>)}</TableBody></Table></Card></Shell>;
}
export function LeadsPage() { return <ModernLeadsPage />; }
export function ProposalsPage() { return <ModernProformaPage />; }

export function LegacyInvoicesPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [customer, setCustomer] = useState('all');
  if (params.get('view') === 'proforma') return <LegacyProformaPage />;
  const rows = invoices.filter((x) => `${x.number} ${customerName(x.customerId)}`.includes(query.trim()) && (status === 'all' || x.status === status) && (customer === 'all' || x.customerId === customer));
  const outstanding = invoices.reduce((s, x) => s + x.amount - x.paidAmount, 0);
  return <Shell title="فاکتورها" subtitle="صدور، پیگیری و وضعیت وصول فاکتورهای مشتریان"><StatStrip items={[{ label: 'فروش این ماه', value: formatCurrency(invoices.reduce((s, x) => s + x.amount, 0)) }, { label: 'مطالبات', value: formatCurrency(outstanding), tone: 'warning' }, { label: 'تسویه‌شده', value: `${invoices.filter((x) => x.status === 'paid').length}`, tone: 'success' }, { label: 'معوق', value: `${invoices.filter((x) => x.status === 'overdue').length}`, tone: 'error' }]} /><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={['draft', 'issued', 'overdue', 'partial', 'paid', 'cancelled']} customer={customer} setCustomer={setCustomer} /><Card><Table><TableHead><TableRow>{['شماره فاکتور', 'مشتری', 'پروژه', 'تاریخ صدور', 'سررسید', 'مبلغ کل', 'پرداخت‌شده', 'مانده', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => { const project = projects.find((p) => p.id === x.projectId); return <TableRow hover key={x.id} onClick={() => navigate(`/invoices/${x.id}`)} sx={{ cursor: 'pointer' }}><TableCell sx={{ fontWeight: 700 }}>{x.number}</TableCell><TableCell>{customerName(x.customerId)}</TableCell><TableCell>{project ? <Button size="small" onClick={(event) => { event.stopPropagation(); navigate(`/projects/${project.id}`); }}>{projectDisplayName(project.id)}</Button> : '—'}</TableCell><TableCell>{formatDate(x.issuedAt)}</TableCell><TableCell>{formatDate(x.dueDate)}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatCurrency(x.paidAmount)}</TableCell><TableCell sx={{ fontWeight: 700, color: x.amount - x.paidAmount > 0 ? 'warning.dark' : 'success.dark' }}>{formatCurrency(x.amount - x.paidAmount)}</TableCell><TableCell>{statusChip(x.status)}</TableCell></TableRow>; })}</TableBody></Table></Card></Shell>;
}

export function LegacyPaymentsPage() {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const paymentStatuses: PaymentStatus[] = ['ثبت شده', 'در انتظار تایید', 'تایید شده', 'برگشت خورده'];
  const rows = payments.filter((x) => `${x.receiptNumber} ${customerName(x.customerId)} ${x.reference}`.includes(query.trim()) && (status === 'all' || x.status === status));
  return <Shell title="پرداخت‌ها" subtitle="دفتر دریافت‌ها و تطبیق با فاکتورهای صادرشده"><StatStrip items={[{ label: 'پرداخت این ماه', value: formatCurrency(payments.reduce((s, x) => s + x.amount, 0)), tone: 'success' }, { label: 'تاییدشده', value: `${payments.filter((x) => x.status === 'تایید شده').length}` }, { label: 'در انتظار تایید', value: `${payments.filter((x) => x.status === 'در انتظار تایید').length}`, tone: 'warning' }]} /><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statuses={paymentStatuses} methods={['انتقال بانکی', 'کارت', 'چک', 'نقدی', 'درگاه اینترنتی', 'سایر']} /><Card><Table><TableHead><TableRow>{['شماره پرداخت', 'مشتری', 'فاکتور', 'پروژه', 'مبلغ', 'تاریخ', 'حساب مقصد', 'روش پرداخت', 'شماره پیگیری', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}>{x.receiptNumber}</TableCell><TableCell>{customerName(x.customerId)}</TableCell><TableCell>{invoices.find((i) => i.id === x.invoiceId)?.number}</TableCell><TableCell>{projects.find((p) => p.id === x.projectId)?.name ?? '—'}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatDate(x.paidAt)}</TableCell><TableCell>{bankAccounts.find((b) => b.id === x.bankAccountId)?.bankName ?? '—'}</TableCell><TableCell>{x.method}</TableCell><TableCell>{x.reference}</TableCell><TableCell><Chip size="small" color={x.status === 'تایید شده' ? 'success' : x.status === 'برگشت خورده' ? 'error' : 'warning'} label={x.status} /></TableCell></TableRow>)}</TableBody></Table></Card></Shell>;
}

export function InvoicesPage() { return <ModernInvoicesPage />; }
export function PaymentsPage() { return <ModernPaymentsPage />; }

function ModernProductsPage() {
  const [rows, setRows] = useState(() => productRepository.list());
  useEffect(() => productRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'name', label: 'نام محصول / خدمت', required: true },
    { name: 'sku', label: 'کد محصول', required: true, direction: 'ltr' },
    { name: 'category', label: 'دسته‌بندی' },
    { name: 'type', label: 'نوع', type: 'select', options: ['خدمات', 'پشتیبانی', 'اشتراک', 'تجهیزات', 'نرم‌افزار'].map((x) => ({ value: x, label: x })) },
    { name: 'unit', label: 'واحد', required: true },
    { name: 'price', label: 'قیمت پایه', type: 'number', required: true },
    { name: 'taxRate', label: 'نرخ مالیات', type: 'number' },
  ];
  return <Shell title="محصولات و خدمات" subtitle="کاتالوگ اقلام قابل فروش و خدمات سازمان" action={<FinanceCreateButton title="ایجاد محصول یا خدمت" fields={fields} onSave={(v) => productRepository.create({ ...products[0], id: undefined, name: v.name, sku: v.sku, category: v.category || 'خدمات حرفه‌ای', type: (v.type || 'خدمات') as Product['type'], unit: v.unit, price: Number(v.price) || 0, taxRate: Number(v.taxRate) || 0, stock: 0, active: true, updatedAt: new Date().toISOString() })} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی نام، کد یا دسته‌بندی..." toolbar={<CsvToolbar rows={rows} entityLabel="محصولات و خدمات" filename="products.csv" columns={[{ key: 'name', label: 'نام', value: (row) => row.name }, { key: 'sku', label: 'کد', value: (row) => row.sku }, { key: 'category', label: 'دسته‌بندی', value: (row) => row.category }, { key: 'type', label: 'نوع', value: (row) => row.type }, { key: 'price', label: 'قیمت', value: (row) => row.price }]} onImport={(items) => importFinanceRows(items, (row) => productRepository.create({ ...products[0], id: undefined, name: csvField(row, 'نام', 'name'), sku: csvField(row, 'کد', 'sku') || `CSV-${Date.now()}`, category: csvField(row, 'دسته‌بندی', 'category') || 'خدمات حرفه‌ای', type: 'خدمات', unit: 'عدد', price: Number(normalizeDigits(csvField(row, 'قیمت', 'price'))) || 0, taxRate: 0, stock: 0, active: true, updatedAt: new Date().toISOString() }), ['نام', 'name'])} />} columns={[
    { key: 'name', label: 'نام محصول / خدمت', value: (row) => row.name, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography> },
    { key: 'sku', label: 'کد', value: (row) => row.sku },
    { key: 'category', label: 'دسته‌بندی', value: (row) => row.category, groupable: true },
    { key: 'type', label: 'نوع', value: (row) => row.type },
    { key: 'unit', label: 'واحد', value: (row) => row.unit },
    { key: 'price', label: 'قیمت', value: (row) => row.price, aggregate: 'average', render: (row) => formatCurrency(row.price) },
    { key: 'taxRate', label: 'مالیات', value: (row) => row.taxRate, render: (row) => `${row.taxRate}٪` },
  ]} /></Card></Shell>;
}

function ModernContractsPage() {
  const [rows, setRows] = useState(() => contractRepository.list());
  useEffect(() => contractRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'number', label: 'شماره قرارداد', required: true },
    { name: 'title', label: 'موضوع قرارداد', required: true },
    { name: 'customerId', label: 'مشتری', type: 'select', required: true, options: customers.map((x) => ({ value: x.id, label: customerName(x.id) })) },
    { name: 'projectId', label: 'پروژه', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectDisplayName(x.id) })) },
    { name: 'amount', label: 'ارزش قرارداد', type: 'number', required: true },
    { name: 'startDate', label: 'تاریخ شروع', type: 'date', required: true },
    { name: 'endDate', label: 'تاریخ خاتمه', type: 'date', required: true },
    { name: 'paymentTerms', label: 'نحوه پرداخت' },
    { name: 'customerVisible', label: 'قابل مشاهده برای مشتری', type: 'checkbox' },
  ];
  return <Shell title="قراردادها" subtitle="تعهدات تجاری، تمدید و ارتباط قرارداد با فاکتور و اقساط" action={<FinanceCreateButton title="ایجاد قرارداد" fields={fields} onSave={(v) => contractRepository.create({ ...contracts[0], id: undefined, number: v.number, title: v.title, customerId: customerForProject(v.projectId, v.customerId), projectId: v.projectId || undefined, amount: Number(v.amount) || 0, startDate: v.startDate || new Date().toISOString(), endDate: v.endDate || new Date().toISOString(), paymentTerms: v.paymentTerms || 'توافقی', status: 'draft', ownerId: users[0].id, renewal: false, customerVisible: v.customerVisible === 'true' })} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی شماره، عنوان، مشتری یا پروژه..." toolbar={<CsvToolbar rows={rows} entityLabel="قراردادها" filename="contracts.csv" columns={[{ key: 'number', label: 'شماره قرارداد', value: (row) => row.number }, { key: 'title', label: 'عنوان', value: (row) => row.title }, { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId) }, { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount }, { key: 'status', label: 'وضعیت', value: (row) => statusLabels[row.status] ?? row.status }]} onImport={(items) => importFinanceRows(items, (row) => { const projectId = resolveProjectId(csvField(row, 'پروژه', 'project', 'projectId')); const customerId = csvField(row, 'مشتری', 'customer', 'customerId') || (projectId ? projects.find((project) => project.id === projectId)?.customerId : undefined) || customers[0].id; return contractRepository.create({ ...contracts[0], id: undefined, number: csvField(row, 'شماره قرارداد', 'number'), title: csvField(row, 'عنوان', 'title') || 'قرارداد واردشده', customerId, projectId, amount: Number(normalizeDigits(csvField(row, 'مبلغ', 'amount'))) || 0, startDate: new Date().toISOString(), endDate: new Date().toISOString(), status: 'draft', ownerId: users[0].id, paymentTerms: 'توافقی', renewal: false }); }, ['شماره قرارداد', 'number'])} />} columns={[
    { key: 'number', label: 'شماره قرارداد', value: (row) => row.number, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.number}</Typography> },
    { key: 'title', label: 'عنوان', value: (row) => row.title },
    { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId), groupable: true },
    { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) },
    { key: 'startDate', label: 'تاریخ شروع', value: (row) => row.startDate, render: (row) => formatDate(row.startDate) },
    { key: 'endDate', label: 'تاریخ پایان', value: (row) => row.endDate, render: (row) => formatDate(row.endDate) },
    { key: 'amount', label: 'مبلغ', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) },
    { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => statusChip(row.status) },
    { key: 'visibility', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> },
  ]} /></Card></Shell>;
}

function ModernInstallmentsPage() {
  const [rows, setRows] = useState(() => installmentRepository.list());
  useEffect(() => installmentRepository.subscribe(setRows), []);
  const fields: EntityField[] = [
    { name: 'contractId', label: 'قرارداد', type: 'select', required: true, options: contracts.map((x) => ({ value: x.id, label: x.number })) },
    { name: 'invoiceId', label: 'فاکتور', type: 'select', required: true, options: invoices.map((x) => ({ value: x.id, label: x.number })) },
    { name: 'number', label: 'شماره قسط', type: 'number', required: true },
    { name: 'amount', label: 'مبلغ قسط', type: 'number', required: true },
    { name: 'dueDate', label: 'تاریخ سررسید', type: 'date', required: true },
  ];
  return <Shell title="لیست اقساط" subtitle="پیگیری سررسیدهای قرارداد و مانده قابل وصول" action={<FinanceCreateButton title="ایجاد قسط" fields={fields} onSave={(v) => { const invoice = invoices.find((x) => x.id === v.invoiceId); installmentRepository.create({ ...installments[0], id: undefined, contractId: v.contractId, invoiceId: v.invoiceId, customerId: invoice?.customerId ?? customers[0].id, projectId: invoice?.projectId, number: Number(v.number) || rows.length + 1, amount: Number(v.amount) || 0, paidAmount: 0, dueDate: v.dueDate || new Date().toISOString(), status: 'future' }); }} />}>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی مشتری، قرارداد، فاکتور یا پروژه..." toolbar={<CsvToolbar rows={rows} entityLabel="اقساط" filename="installments.csv" columns={[{ key: 'number', label: 'قسط', value: (row) => row.number }, { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId ?? '') }, { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) }, { key: 'dueDate', label: 'سررسید', value: (row) => row.dueDate }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount }, { key: 'paid', label: 'پرداخت‌شده', value: (row) => row.paidAmount }, { key: 'status', label: 'وضعیت', value: (row) => statusLabels[row.status] ?? row.status }]} onImport={(items) => importFinanceRows(items, (row) => { const invoice = invoices.find((item) => item.id === csvField(row, 'فاکتور', 'invoiceId') || item.number === csvField(row, 'فاکتور', 'invoiceId')) ?? invoices[0]; const contract = contracts.find((item) => item.id === csvField(row, 'قرارداد', 'contractId') || item.number === csvField(row, 'قرارداد', 'contractId')) ?? contracts[0]; installmentRepository.create({ ...installments[0], id: undefined, contractId: contract.id, invoiceId: invoice.id, customerId: invoice.customerId, projectId: invoice.projectId, number: Number(normalizeDigits(csvField(row, 'قسط', 'number'))) || 1, dueDate: csvField(row, 'سررسید', 'dueDate') || new Date().toISOString(), amount: Number(normalizeDigits(csvField(row, 'مبلغ', 'amount'))) || 0, paidAmount: 0, status: 'future' }); }, ['قسط', 'number'])} />} columns={[
    { key: 'number', label: 'قسط', value: (row) => row.number, render: (row) => `قسط ${row.number}` },
    { key: 'customer', label: 'مشتری', value: (row) => customerName(row.customerId ?? '') },
    { key: 'contract', label: 'قرارداد', value: (row) => contracts.find((contract) => contract.id === row.contractId)?.number ?? '—' },
    { key: 'project', label: 'پروژه', value: (row) => projectDisplayName(row.projectId) },
    { key: 'dueDate', label: 'سررسید', value: (row) => row.dueDate, render: (row) => formatDate(row.dueDate) },
    { key: 'amount', label: 'مبلغ', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) },
    { key: 'paidAmount', label: 'پرداخت‌شده', value: (row) => row.paidAmount, render: (row) => formatCurrency(row.paidAmount) },
    { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => statusChip(row.status) },
  ]} /></Card></Shell>;
}

export function LegacyProductsPage() {
  const [query, setQuery] = useState(''); const [rows, setRows] = useState(products);
  return <Shell title="محصولات و خدمات" subtitle="کاتالوگ اقلام قابل فروش و خدمات سازمان" action={<QuickCreateDialog title="ایجاد محصول یا خدمت" fields={['نام محصول / خدمت', 'کد محصول', 'دسته‌بندی', 'قیمت', 'واحد']} onSave={(v) => setRows((items) => [{ ...products[0], id: `pr-new-${Date.now()}`, name: v['نام محصول / خدمت'], sku: v['کد محصول'] || `NEW-${items.length}`, category: v['دسته‌بندی'] || 'خدمات حرفه‌ای', price: Number(v['قیمت']) || 0, unit: v['واحد'] || 'عدد', updatedAt: new Date().toISOString() }, ...items])} />}><Filters query={query} setQuery={setQuery} /><Card><Table><TableHead><TableRow>{['نام محصول', 'کد محصول', 'دسته‌بندی', 'نوع', 'واحد', 'قیمت', 'نرخ مالیات', 'موجودی', 'آخرین بروزرسانی', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.filter((x) => `${x.name} ${x.sku} ${x.category}`.includes(query.trim())).map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}>{x.name}</TableCell><TableCell>{x.sku}</TableCell><TableCell>{x.category}</TableCell><TableCell>{x.type}</TableCell><TableCell>{x.unit}</TableCell><TableCell>{formatCurrency(x.price)}</TableCell><TableCell>{x.taxRate}٪</TableCell><TableCell>{x.stock ? `${x.stock} واحد` : 'خدماتی'}</TableCell><TableCell>{formatDate(x.updatedAt)}</TableCell><TableCell><Chip size="small" color="success" label="فعال" /></TableCell></TableRow>)}</TableBody></Table></Card></Shell>;
}

export function LegacyContractsPage() {
  const [query, setQuery] = useState(''); const rows = contracts.filter((x) => `${x.number} ${x.title} ${customerName(x.customerId)}`.includes(query.trim()));
  return <Shell title="قراردادها" subtitle="تعهدات تجاری، تمدید و ارتباط قرارداد با فاکتور و اقساط"><Filters query={query} setQuery={setQuery} /><Card><Table><TableHead><TableRow>{['شماره قرارداد', 'عنوان', 'مشتری', 'پروژه', 'تاریخ شروع', 'تاریخ پایان', 'مبلغ', 'فاکتور شده', 'دریافت شده', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => { const linked = invoices.filter((i) => i.contractId === x.id); const billed = linked.reduce((s, i) => s + i.amount, 0); const received = linked.reduce((s, i) => s + i.paidAmount, 0); return <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}>{x.number}</TableCell><TableCell>{x.title}</TableCell><TableCell>{customerName(x.customerId)}</TableCell><TableCell>{projects.find((p) => p.id === x.projectId)?.name ?? '—'}</TableCell><TableCell>{formatDate(x.startDate)}</TableCell><TableCell>{formatDate(x.endDate)}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatCurrency(billed)}</TableCell><TableCell>{formatCurrency(received)}</TableCell><TableCell>{statusChip(x.status)}</TableCell></TableRow>; })}</TableBody></Table></Card></Shell>;
}

export function LegacyInstallmentsPage() {
  const [status, setStatus] = useState('all'); const rows = installments.filter((x) => status === 'all' || x.status === status); const unpaid = installments.reduce((s, x) => s + x.amount - x.paidAmount, 0);
  return <Shell title="لیست اقساط" subtitle="پیگیری سررسیدهای قرارداد و مانده قابل وصول"><StatStrip items={[{ label: 'کل اقساط', value: `${installments.length}` }, { label: 'سررسید نزدیک', value: `${installments.filter((x) => x.status === 'due').length}`, tone: 'warning' }, { label: 'دیرکرد', value: `${installments.filter((x) => x.status === 'overdue').length}`, tone: 'error' }, { label: 'مبلغ پرداخت‌نشده', value: formatCurrency(unpaid), tone: 'warning' }]} /><Card sx={{ p: 2, mb: 2 }}><FormControl sx={{ minWidth: 220 }}><InputLabel>وضعیت قسط</InputLabel><Select label="وضعیت قسط" value={status} onChange={(e) => setStatus(e.target.value)}><MenuItem value="all">همه وضعیت‌ها</MenuItem>{['future', 'due', 'partial', 'paid', 'overdue'].map((s) => <MenuItem key={s} value={s}>{statusLabels[s]}</MenuItem>)}</Select></FormControl></Card><Card><Table><TableHead><TableRow>{['قسط', 'مشتری', 'قرارداد', 'پروژه', 'فاکتور', 'تاریخ سررسید', 'مبلغ', 'پرداخت‌شده', 'مانده', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => { const contract = contracts.find((c) => c.id === x.contractId); return <TableRow hover key={x.id}><TableCell>قسط {x.number}</TableCell><TableCell>{customerName(x.customerId ?? contract?.customerId ?? '')}</TableCell><TableCell>{contract?.number}</TableCell><TableCell>{projects.find((p) => p.id === x.projectId)?.name ?? '—'}</TableCell><TableCell>{invoices.find((i) => i.id === x.invoiceId)?.number}</TableCell><TableCell>{formatDate(x.dueDate)}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatCurrency(x.paidAmount)}</TableCell><TableCell sx={{ fontWeight: 700, color: x.amount - x.paidAmount > 0 ? 'warning.dark' : 'success.dark' }}>{formatCurrency(x.amount - x.paidAmount)}</TableCell><TableCell>{statusChip(x.status)}</TableCell></TableRow>; })}</TableBody></Table></Card></Shell>;
}

export function ProductsPage() { return <ModernProductsPage />; }
export function ContractsPage() { return <ModernContractsPage />; }
export function InstallmentsPage() { return <ModernInstallmentsPage />; }

export function SalesOverviewPage() {
  const total = invoices.reduce((s, x) => s + x.amount, 0); const received = payments.filter((x) => x.status === 'تایید شده').reduce((s, x) => s + x.amount, 0); const receivable = total - received;
  return <Shell title="فروش و امور مالی" subtitle="نمای یکپارچه قیف فروش تا دریافت وجه"><StatStrip items={[{ label: 'سرنخ‌های باز', value: `${leads.filter((x) => !['converted', 'lost'].includes(x.status)).length}` }, { label: 'فروش این ماه', value: formatCurrency(total), tone: 'success' }, { label: 'مطالبات', value: formatCurrency(receivable), tone: 'warning' }, { label: 'اقساط دیرکرد', value: `${installments.filter((x) => x.status === 'overdue').length}`, tone: 'error' }]} /><Card sx={{ p: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>جریان درآمد</Typography><Typography variant="body2" color="text.secondary">از مجموع {formatCurrency(total)} فاکتور صادرشده، {formatCurrency(received)} وصول تأییدشده و {formatCurrency(receivable)} در انتظار وصول است.</Typography><Box sx={{ mt: 2, height: 12, bgcolor: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}><Box sx={{ width: `${Math.min(received / total * 100, 100)}%`, height: '100%', bgcolor: 'success.main' }} /></Box></Card></Shell>;
}

function DocumentDetail({ kind, id }: { kind: 'invoice' | 'proposal'; id: string }) {
  const navigate = useNavigate();
  const doc = kind === 'invoice' ? invoices.find((x) => x.id === id) : proposals.find((x) => x.id === id);
  if (!doc) return <Shell title="رکورد یافت نشد" subtitle="شناسه واردشده معتبر نیست"><Button onClick={() => navigate(-1)}>بازگشت</Button></Shell>;
  const invoice = kind === 'invoice' ? doc as Invoice : invoices.find((x) => x.proposalId === doc.id);
  const proposal = doc as typeof proposals[number];
  const customer = customers.find((x) => x.id === doc.customerId);
  const relatedPayments = invoice ? payments.filter((x) => x.invoiceId === invoice.id) : [];
  const itemsInvoice = invoice ?? ({ ...doc, items: doc.items } as Invoice);
  const dueDate = kind === 'invoice' ? (doc as Invoice).dueDate : proposal.validUntil;
  const ownerId = 'ownerId' in doc ? doc.ownerId : '';
  return (
    <Shell title={kind === 'invoice' ? `فاکتور ${doc.number}` : `پیش‌فاکتور ${doc.number}`} subtitle={kind === 'invoice' ? 'سند مالی' : proposal.title} action={<Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate(-1)}>بازگشت</Button>}>
      <Stack spacing={2}>
        <Card><CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 2 }}>
            <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>{doc.number}</Typography><Typography color="text.secondary">{customer?.company} • {customer?.name} • {customer?.phone}</Typography></Box>
            <Stack direction="row" spacing={1}>{statusChip(doc.status)}<Typography variant="body2">صدور: {formatDate(doc.issuedAt)}</Typography></Stack>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 2 }}>
            <Box><Typography variant="caption" color="text.secondary">مشتری</Typography><Typography sx={{ fontWeight: 700 }}>{customer?.company}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">پروژه</Typography><Typography sx={{ fontWeight: 700 }}>{projects.find((p) => p.id === ('projectId' in doc ? doc.projectId : undefined))?.name ?? '—'}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">اعتبار/سررسید</Typography><Typography sx={{ fontWeight: 700 }}>{formatDate(dueDate)}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">مسئول</Typography><Typography sx={{ fontWeight: 700 }}>{users.find((u) => u.id === ownerId)?.name ?? '—'}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">مبلغ نهایی</Typography><Typography sx={{ fontWeight: 700 }}>{formatCurrency(doc.amount)}</Typography></Box>
          </Box>
        </CardContent></Card>
        <Card sx={{ p: 1 }}><ItemsTable invoice={itemsInvoice} /></Card>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>خلاصه مالی</Typography><Stack spacing={1}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>جمع جزء</Typography><Typography>{formatCurrency(lineItemTotals(itemsInvoice.items).subtotal)}</Typography></Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>تخفیف</Typography><Typography>{formatCurrency(lineItemTotals(itemsInvoice.items).discount)}</Typography></Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>مالیات</Typography><Typography>{formatCurrency(lineItemTotals(itemsInvoice.items).tax)}</Typography></Stack><Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 800 }}>مبلغ نهایی</Typography><Typography sx={{ fontWeight: 800 }}>{formatCurrency(lineItemTotals(itemsInvoice.items).total)}</Typography></Stack>
            {invoice && <><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography>پرداخت‌شده</Typography><Typography color="success.main">{formatCurrency(invoicePaidAmount(invoice, payments))}</Typography></Stack><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 800 }}>مانده</Typography><Typography color="warning.dark" sx={{ fontWeight: 800 }}>{formatCurrency(lineItemTotals(invoice.items).total - invoicePaidAmount(invoice, payments))}</Typography></Stack></>}
          </Stack></CardContent></Card>
          <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>پرداخت‌های مرتبط</Typography>{relatedPayments.length ? relatedPayments.map((p) => <Stack key={p.id} direction="row" sx={{ justifyContent: 'space-between', py: .75, borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{p.receiptNumber}</Typography><Typography variant="caption" color="text.secondary">{p.method} • {formatDate(p.paidAt)}</Typography></Box><Typography color="success.main">{formatCurrency(p.amount)}</Typography></Stack>) : <Typography color="text.secondary">پرداختی ثبت نشده است.</Typography>}</CardContent></Card>
        </Box>
      </Stack>
    </Shell>
  );
}
export function InvoiceDetailPage() { const { id = '' } = useParams(); return <DocumentDetail kind="invoice" id={id} />; }
export function ProposalDetailPage() { const { id = '' } = useParams(); return <DocumentDetail kind="proposal" id={id} />; }
