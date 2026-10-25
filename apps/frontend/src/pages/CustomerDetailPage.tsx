import { ArrowBack, Business, Description, Edit, Folder, PersonAdd, ReceiptLong, SupportAgent } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CustomerFormDialog from '../components/common/CustomerFormDialog.tsx';
import CustomerAccountDialog from '../components/common/CustomerAccountDialog.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { contracts, invoices, payments, projectEvents, projectNotes, projects, tasks, tickets, users } from '../services/repositories.ts';
import { customerRepository, documentRepository, userRepository } from '../services/repositories.ts';
import { customerCurrencyLabel, customerDisplayName, customerEntityType, customerEntityTypeLabel, customerIdentityLabel } from '../utils/customer.ts';
import { formatCurrency, formatRelative } from '../utils/format.ts';
import { documentStatusColor, documentStatusLabels, documentTypeLabels } from '../utils/document.ts';

function InfoItem({ label, value, ltr = false }: { label: string; value?: string; ltr?: boolean }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" dir={ltr ? 'ltr' : 'rtl'} sx={{ mt: 0.25, fontWeight: 600, textAlign: ltr ? 'right' : undefined, overflowWrap: 'anywhere' }}>{value || '—'}</Typography></Box>;
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(() => customerRepository.get(id));
  const [editOpen, setEditOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [customerAccounts, setCustomerAccounts] = useState(() => userRepository.list().filter((user) => user.customerId === id));
  const [customerDocuments, setCustomerDocuments] = useState(() => documentRepository.list().filter((document) => document.customerId === id));
  useEffect(() => customerRepository.subscribe((items) => setCustomer(items.find((item) => item.id === id))), [id]);
  useEffect(() => userRepository.subscribe((items) => setCustomerAccounts(items.filter((user) => user.customerId === id))), [id]);
  useEffect(() => documentRepository.subscribe((items) => setCustomerDocuments(items.filter((document) => document.customerId === id))), [id]);
  if (!customer) return <Box><PageHeader title="مشتری یافت نشد" subtitle="شناسه مشتری معتبر نیست" crumbs={['تری‌لیز', 'مشتریان']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>بازگشت به مشتریان</Button></Box>;

  const displayName = customerDisplayName(customer);
  const isCompany = customerEntityType(customer) === 'company';
  const canAddCustomerAccount = isCompany || customerAccounts.length === 0;
  const customerProjects = projects.filter((item) => item.customerId === id);
  const customerInvoices = invoices.filter((item) => item.customerId === id);
  const customerPayments = payments.filter((item) => item.customerId === id);
  const customerContracts = contracts.filter((item) => item.customerId === id);
  const customerTickets = tickets.filter((item) => item.customerId === id);
  const customerTasks = tasks.filter((item) => customerProjects.some((project) => project.id === item.projectId) && item.customerVisible);
  const customerEvents = projectEvents.filter((item) => customerProjects.some((project) => project.id === item.projectId) && item.customerVisible).slice(0, 5);
  const customerNotes = projectNotes.filter((item) => customerProjects.some((project) => project.id === item.projectId) && item.customerVisible).slice(0, 5);
  const invoiced = customerInvoices.reduce((sum, item) => sum + item.amount, 0);
  const paid = customerPayments.reduce((sum, item) => sum + item.amount, 0);
  const summary = [
    { label: 'پروژه‌ها', value: customerProjects.length, icon: <Folder /> },
    { label: 'ارزش فاکتورها', value: formatCurrency(invoiced), icon: <ReceiptLong /> },
    { label: 'پرداخت‌شده', value: formatCurrency(paid), icon: <Business /> },
    { label: 'تیکت‌های باز', value: customerTickets.filter((item) => item.status !== 'closed').length, icon: <SupportAgent /> },
  ];

  return <Box>
    <PageHeader title={displayName} subtitle={`${customerEntityTypeLabel(customer)} • ${customer.phone || 'شماره موبایل ثبت نشده'}`} crumbs={['تری‌لیز', 'مشتریان', displayName]} actions={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{customerAccounts.length > 0 && <Chip color="success" label={`${customerAccounts.length.toLocaleString('fa-IR')} کاربر مشتری`} />}{canAddCustomerAccount && <Button variant="contained" startIcon={<PersonAdd />} onClick={() => setAccountOpen(true)}>{isCompany ? 'افزودن کاربر شرکت' : 'ایجاد حساب مشتری'}</Button>}<Button variant={canAddCustomerAccount ? 'outlined' : 'contained'} startIcon={<Edit />} onClick={() => setEditOpen(true)}>ویرایش مشتری</Button><Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>بازگشت</Button></Stack>} />
    <Card sx={{ mb: 2 }}><CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' }, gap: 2 }}>
        <Box><Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography variant="h6" sx={{ fontWeight: 800 }}>{displayName}</Typography><Chip size="small" variant="outlined" label={customerEntityTypeLabel(customer)} />{(customer.groups ?? []).map((group) => <Chip key={group} size="small" label={group} />)}</Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{customer.address || 'نشانی ثبت نشده'}</Typography></Box>
        <Chip color={customer.status === 'active' ? 'success' : 'default'} label={customer.status === 'active' ? 'فعال' : customer.status === 'lead' ? 'سرنخ' : 'غیرفعال'} />
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        <InfoItem label={customerIdentityLabel(customer)} value={customer.nationalCode} ltr />
        <InfoItem label="شماره ثبت مالیات بر ارزش افزوده" value={customer.vatRegistrationNumber} ltr />
        <InfoItem label="شماره موبایل" value={customer.phone} ltr />
        <InfoItem label="وب‌سایت" value={customer.website} ltr />
        <InfoItem label="ارز" value={customerCurrencyLabel(customer.currency)} />
        <InfoItem label="کشور" value={customer.country} />
        <InfoItem label="استان / شهر" value={[customer.province, customer.city].filter(Boolean).join('، ')} />
        <InfoItem label="کد پستی" value={customer.postalCode} ltr />
      </Box>
    </CardContent></Card>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>{summary.map((item) => <Card key={item.label}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Box><Typography variant="caption" color="text.secondary">{item.label}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{typeof item.value === 'number' ? item.value.toLocaleString('fa-IR') : item.value}</Typography></Box>{item.icon}</Stack></CardContent></Card>)}</Box>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1fr' } }}>
      <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>پروژه‌های مشتری</Typography><DataTable rows={customerProjects} getRowId={(item) => item.id} searchPlaceholder="جستجوی پروژه..." onRowClick={(item) => navigate(`/projects/${item.id}`)} columns={[{ key: 'name', label: 'پروژه', value: (item) => `${item.code ?? ''} ${item.name}`, render: (item) => <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography> }, { key: 'status', label: 'وضعیت', value: (item) => item.status }, { key: 'progress', label: 'پیشرفت', value: (item) => item.progress, render: (item) => `${item.progress}٪` }, { key: 'budget', label: 'ارزش', value: (item) => item.budget, render: (item) => formatCurrency(item.budget) }]} /></Card>
      <Card sx={{ p: 2 }}><Typography sx={{ fontWeight: 800, mb: 1.5 }}>اطلاعات حساب و سوابق</Typography><Stack spacing={1}><Typography variant="body2">مسئول حساب: {users.find((item) => item.id === customer.assignedTo)?.name ?? '—'}</Typography><Typography variant="body2">آخرین تماس: {formatRelative(customer.lastContact)}</Typography><Typography variant="body2">قراردادها: {customerContracts.length}</Typography><Typography variant="body2">اسناد مرتبط: {customerDocuments.length}</Typography><Typography variant="body2">مانده قابل وصول: {formatCurrency(invoiced - paid)}</Typography><Divider /><Typography variant="body2" sx={{ fontWeight: 800 }}>کاربران مشتری</Typography>{customerAccounts.length ? customerAccounts.map((account) => <Box key={account.id} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}><Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{account.name}</Typography><Typography variant="caption" color="text.secondary">{account.title} • <span dir="ltr">{account.email}</span></Typography></Box><Chip size="small" color={account.isActive ? 'success' : 'default'} label={account.isActive ? 'فعال' : 'غیرفعال'} /></Stack></Box>) : <Typography variant="body2" color="text.secondary">هنوز حسابی برای این مشتری ایجاد نشده است.</Typography>}<Button startIcon={<Description />} onClick={() => navigate(`/documents?section=customers&customer=${customer.id}`)}>مشاهده اسناد مشتری</Button></Stack></Card>
    </Box>
    <Card sx={{ mt: 2, p: 1 }}><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ px: 1, pt: 1, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}><Typography sx={{ fontWeight: 800 }}>اسناد مرتبط با مشتری</Typography><Button size="small" onClick={() => navigate(`/documents?section=customers&customer=${customer.id}`)}>ایجاد و مدیریت اسناد</Button></Stack><DataTable rows={customerDocuments} getRowId={(document) => document.id} onRowClick={() => navigate(`/documents?section=customers&customer=${customer.id}`)} searchPlaceholder="جستجوی سند مشتری..." columns={[{ key: 'title', label: 'عنوان', value: (document) => document.title }, { key: 'type', label: 'نوع', value: (document) => documentTypeLabels[document.documentType] }, { key: 'project', label: 'پروژه', value: (document) => projects.find((project) => project.id === document.projectId)?.name ?? 'بدون پروژه' }, { key: 'value', label: 'ارزش', value: (document) => document.value ?? 0, render: (document) => document.value ? formatCurrency(document.value) : '—' }, { key: 'status', label: 'وضعیت', value: (document) => documentStatusLabels[document.status], render: (document) => <Chip size="small" color={documentStatusColor(document.status)} label={documentStatusLabels[document.status]} /> }, { key: 'files', label: 'فایل', value: (document) => document.attachments.length, render: (document) => `${document.attachments.length.toLocaleString('fa-IR')} فایل` }]} /></Card>
    <Card sx={{ mt: 2 }}><CardContent><Typography sx={{ fontWeight: 800, mb: 1 }}>پیش‌نمایش مشتری</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>این بخش فقط رکوردهایی را نشان می‌دهد که صراحتاً برای مشتری قابل مشاهده شده‌اند.</Typography><Stack spacing={1}>{customerTasks.slice(0, 3).map((task) => <Stack key={task.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{task.title}</Typography><CustomerVisibilityBadge visible /></Stack>)}{customerEvents.map((event) => <Stack key={event.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{event.title ?? event.description}</Typography><CustomerVisibilityBadge visible /></Stack>)}{customerNotes.map((note) => <Stack key={note.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{note.title}</Typography><CustomerVisibilityBadge visible /></Stack>)}{!customerTasks.length && !customerEvents.length && !customerNotes.length && <Typography variant="body2" color="text.secondary">رکورد قابل مشاهده‌ای برای این مشتری ثبت نشده است.</Typography>}</Stack></CardContent></Card>
    <CustomerFormDialog key={customer.id} open={editOpen} customer={customer} onClose={() => setEditOpen(false)} />
    {accountOpen && <CustomerAccountDialog key={`account-${customer.id}`} open customer={customer} onClose={() => setAccountOpen(false)} />}
  </Box>;
}
