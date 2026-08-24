import { Add, Search } from '@mui/icons-material';
import { Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader.tsx';
import { customers, contracts, installments, invoices, leads, payments, products, proposals, users } from '../mock/data.ts';
import { formatCurrency, formatDate, formatRelative } from '../utils/format.ts';

const statusLabels: Record<string, string> = { new: 'جدید', contacted: 'تماس گرفته شد', qualified: 'واجد شرایط', lost: 'از دست‌رفته', converted: 'تبدیل‌شده', draft: 'پیش‌نویس', sent: 'ارسال‌شده', approved: 'تأییدشده', paid: 'پرداخت‌شده', overdue: 'معوق', cancelled: 'لغوشده', active: 'فعال', expired: 'منقضی', pending: 'در انتظار', due: 'سررسید', paidAmount: 'پرداخت‌شده' };
const statusColor = (status: string) => ['paid', 'approved', 'active', 'converted'].includes(status) ? 'success' : ['overdue', 'lost', 'expired'].includes(status) ? 'error' : ['sent', 'qualified', 'due'].includes(status) ? 'warning' : 'default';

function BusinessShell({ title, subtitle, children, onAdd }: { title: string; subtitle: string; children: React.ReactNode; onAdd?: () => void }) {
  const [open, setOpen] = useState(false);
  return <Box>
    <PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={<Button variant="contained" startIcon={<Add />} onClick={() => { setOpen(true); onAdd?.(); }}>ایجاد مورد جدید</Button>} />
    {children}
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>ایجاد رکورد جدید</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="عنوان / نام" autoFocus /><TextField label="توضیحات" multiline minRows={3} /><TextField label="مبلغ (ریال)" /></Stack></DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)}>انصراف</Button><Button variant="contained" onClick={() => setOpen(false)}>ذخیره پیش‌نویس</Button></DialogActions>
    </Dialog>
  </Box>;
}

function Toolbar({ query, setQuery, hint = 'جستجو در رکوردها...' }: { query: string; setQuery: (value: string) => void; hint?: string }) {
  return <Card sx={{ p: 2, mb: 2 }}><TextField fullWidth placeholder={hint} value={query} onChange={(e) => setQuery(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Card>;
}

export function LeadsPage() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => leads.filter((x) => `${x.name} ${x.company} ${x.email}`.includes(query.trim())), [query]);
  return <BusinessShell title="مشتریان احتمالی" subtitle="قیف فروش از اولین تماس تا تبدیل به مشتری"><Toolbar query={query} setQuery={setQuery} hint="جستجو بر اساس نام، شرکت، تلفن..." /><Card><Table><TableHead><TableRow>{['نام و شرکت', 'ارزش احتمالی', 'وضعیت', 'منبع', 'آخرین تماس', 'پیگیری بعدی', 'مسئول', 'برچسب‌ها'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell><Typography sx={{ fontWeight: 700 }}> {x.name}</Typography><Typography variant="caption" color="text.secondary">{x.company}</Typography></TableCell><TableCell>{formatCurrency(x.estimatedValue)}</TableCell><TableCell><Chip size="small" color={statusColor(x.status) as any} label={statusLabels[x.status]} /></TableCell><TableCell>{x.source}</TableCell><TableCell>{formatRelative(x.lastContactAt)}</TableCell><TableCell>{formatDate(x.nextFollowUpAt)}</TableCell><TableCell>{users.find((u) => u.id === x.assignedTo)?.name}</TableCell><TableCell>{x.tags.map((t) => <Chip key={t} label={t} size="small" variant="outlined" sx={{ mr: .5 }} />)}</TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function ProposalsPage() {
  const [query, setQuery] = useState('');
  const rows = proposals.filter((x) => `${x.number} ${x.title}`.includes(query.trim()));
  return <BusinessShell title="پیشنهادها و پیش‌فاکتورها" subtitle="مدیریت پیشنهادهای قیمت و پیگیری تصمیم مشتری"><Toolbar query={query} setQuery={setQuery} /><Card><Table><TableHead><TableRow>{['شماره', 'عنوان', 'مشتری', 'مبلغ', 'وضعیت', 'اعتبار تا', 'مسئول'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}>{x.number}</TableCell><TableCell>{x.title}</TableCell><TableCell>{customers.find((c) => c.id === x.customerId)?.company}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell><Chip size="small" color={statusColor(x.status) as any} label={statusLabels[x.status]} /></TableCell><TableCell>{formatDate(x.validUntil)}</TableCell><TableCell>{users.find((u) => u.id === x.ownerId)?.name}</TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function InvoicesPage() {
  const [query, setQuery] = useState('');
  const rows = invoices.filter((x) => `${x.number} ${customers.find((c) => c.id === x.customerId)?.company}`.includes(query.trim()));
  return <BusinessShell title="فاکتورها" subtitle="صدور، پیگیری و وضعیت وصول فاکتورهای مشتریان"><Toolbar query={query} setQuery={setQuery} /><Card><Table><TableHead><TableRow>{['شماره', 'مشتری', 'قرارداد', 'مبلغ', 'وصول‌شده', 'مانده', 'وضعیت', 'سررسید'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}> {x.number}</TableCell><TableCell>{customers.find((c) => c.id === x.customerId)?.company}</TableCell><TableCell>{contracts.find((c) => c.id === x.contractId)?.number ?? '—'}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatCurrency(x.paidAmount)}</TableCell><TableCell>{formatCurrency(x.amount - x.paidAmount)}</TableCell><TableCell><Chip size="small" color={statusColor(x.status) as any} label={statusLabels[x.status]} /></TableCell><TableCell>{formatDate(x.dueDate)}</TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function PaymentsPage() {
  return <BusinessShell title="پرداخت‌ها" subtitle="دفتر دریافت‌ها و تطبیق با فاکتورهای صادرشده"><Card><Table><TableHead><TableRow>{['رسید', 'مشتری', 'فاکتور', 'مبلغ', 'روش پرداخت', 'تاریخ', 'شماره مرجع'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{payments.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}> {x.receiptNumber}</TableCell><TableCell>{customers.find((c) => c.id === x.customerId)?.company}</TableCell><TableCell>{invoices.find((i) => i.id === x.invoiceId)?.number}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{x.method}</TableCell><TableCell>{formatDate(x.paidAt)}</TableCell><TableCell>{x.reference}</TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function ProductsPage() {
  return <BusinessShell title="محصولات و خدمات" subtitle="کاتالوگ اقلام قابل فروش و خدمات سازمان"><Card><Table><TableHead><TableRow>{['نام', 'کد کالا', 'دسته‌بندی', 'واحد', 'قیمت', 'موجودی', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{products.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}> {x.name}</TableCell><TableCell>{x.sku}</TableCell><TableCell>{x.category}</TableCell><TableCell>{x.unit}</TableCell><TableCell>{formatCurrency(x.price)}</TableCell><TableCell>{x.stock ? `${x.stock} واحد` : 'خدماتی'}</TableCell><TableCell><Chip size="small" color="success" label="فعال" /></TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function ContractsPage() {
  return <BusinessShell title="قراردادها" subtitle="تعهدات تجاری، تمدید و ارتباط قرارداد با فاکتور و اقساط"><Card><Table><TableHead><TableRow>{['شماره', 'عنوان', 'مشتری', 'ارزش قرارداد', 'شروع', 'پایان', 'وضعیت', 'تمدید'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{contracts.map((x) => <TableRow hover key={x.id}><TableCell sx={{ fontWeight: 700 }}> {x.number}</TableCell><TableCell>{x.title}</TableCell><TableCell>{customers.find((c) => c.id === x.customerId)?.company}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatDate(x.startDate)}</TableCell><TableCell>{formatDate(x.endDate)}</TableCell><TableCell><Chip size="small" color={statusColor(x.status) as any} label={statusLabels[x.status]} /></TableCell><TableCell>{x.renewal ? 'بله' : 'خیر'}</TableCell></TableRow>)}</TableBody></Table></Card></BusinessShell>;
}

export function InstallmentsPage() {
  return <BusinessShell title="لیست اقساط" subtitle="پیگیری سررسیدهای قرارداد و مانده قابل وصول"><Card><Table><TableHead><TableRow>{['قسط', 'قرارداد', 'مشتری', 'سررسید', 'مبلغ', 'پرداخت‌شده', 'مانده', 'وضعیت'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{installments.map((x) => { const contract = contracts.find((c) => c.id === x.contractId); return <TableRow hover key={x.id}><TableCell>قسط {x.number}</TableCell><TableCell>{contract?.number}</TableCell><TableCell>{customers.find((c) => c.id === contract?.customerId)?.company}</TableCell><TableCell>{formatDate(x.dueDate)}</TableCell><TableCell>{formatCurrency(x.amount)}</TableCell><TableCell>{formatCurrency(x.paidAmount)}</TableCell><TableCell>{formatCurrency(x.amount - x.paidAmount)}</TableCell><TableCell><Chip size="small" color={statusColor(x.status) as any} label={statusLabels[x.status]} /></TableCell></TableRow>; })}</TableBody></Table></Card></BusinessShell>;
}

export function SalesOverviewPage() {
  const total = invoices.reduce((s, x) => s + x.amount, 0);
  const received = payments.reduce((s, x) => s + x.amount, 0);
  return <BusinessShell title="فروش و امور مالی" subtitle="نمای یکپارچه قیف فروش تا دریافت وجه"><Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4,1fr)' }, mb: 2 }}>{[['سرنخ‌های باز', leads.filter((x) => !['converted', 'lost'].includes(x.status)).length], ['پیشنهادهای فعال', proposals.filter((x) => x.status !== 'approved').length], ['فاکتور صادرشده', invoices.length], ['دریافت این ماه', formatCurrency(received)]].map(([label, value]) => <Card key={String(label)} sx={{ p: 2 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ fontWeight: 800, mt: .5 }}>{value}</Typography></Card>)}</Box><Card sx={{ p: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>وضعیت جریان درآمد</Typography><Typography variant="body2" color="text.secondary">از مجموع {formatCurrency(total)} فاکتور صادرشده، {formatCurrency(received)} وصول شده و {formatCurrency(total - received)} در انتظار وصول است.</Typography><Box sx={{ mt: 2, height: 12, bgcolor: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}><Box sx={{ width: `${Math.min(received / total * 100, 100)}%`, height: '100%', bgcolor: 'success.main' }} /></Box><Stack direction="row" spacing={2} sx={{ mt: 1 }}><Chip size="small" color="success" label="وصول‌شده" /><Chip size="small" label="در انتظار وصول" /></Stack></Card></BusinessShell>;
}
