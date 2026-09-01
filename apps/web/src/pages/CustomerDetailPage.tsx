import { ArrowBack, Business, Description, Folder, ReceiptLong, SupportAgent } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { businessDocuments, contracts, invoices, payments, projects, tickets, users, tasks, projectEvents, projectNotes } from '../mock/data.ts';
import { customerRepository } from '../services/repositories.ts';
import { formatCurrency, formatRelative } from '../utils/format.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const customer = customerRepository.get(id);
  if (!customer) {
    return <Box><PageHeader title="مشتری یافت نشد" subtitle="شناسه مشتری معتبر نیست" crumbs={['تری‌لیز', 'مشتریان']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>بازگشت به مشتریان</Button></Box>;
  }
  const customerProjects = projects.filter((item) => item.customerId === id);
  const customerInvoices = invoices.filter((item) => item.customerId === id);
  const customerPayments = payments.filter((item) => item.customerId === id);
  const customerContracts = contracts.filter((item) => item.customerId === id);
  const customerTickets = tickets.filter((item) => item.customerId === id);
  const customerDocuments = businessDocuments.filter((item) => item.customerId === id);
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
    <PageHeader title={customer.company} subtitle={`${customer.name} • ${customer.email || 'ایمیل ثبت نشده'}`} crumbs={['تری‌لیز', 'مشتریان', customer.company]} actions={<Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/customers')}>بازگشت</Button>} />
    <Card sx={{ mb: 2 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 2 }}><Box><Typography variant="h6" sx={{ fontWeight: 800 }}>{customer.name}</Typography><Typography color="text.secondary">{customer.phone || 'تلفن ثبت نشده'} • {customer.city || 'موقعیت ثبت نشده'}</Typography><Typography variant="body2" sx={{ mt: 1 }}>{customer.address || 'نشانی ثبت نشده'}</Typography></Box><Chip color={customer.status === 'active' ? 'success' : 'default'} label={customer.status === 'active' ? 'فعال' : customer.status === 'lead' ? 'سرنخ' : 'غیرفعال'} /></Stack></CardContent></Card>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>{summary.map((item) => <Card key={item.label}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Box><Typography variant="caption" color="text.secondary">{item.label}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{typeof item.value === 'number' ? item.value.toLocaleString('fa-IR') : item.value}</Typography></Box>{item.icon}</Stack></CardContent></Card>)}</Box>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1fr' } }}>
      <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>پروژه‌های مشتری</Typography><DataTable rows={customerProjects} getRowId={(item) => item.id} searchPlaceholder="جستجوی پروژه..." onRowClick={(item) => navigate(`/projects/${item.id}`)} columns={[{ key: 'name', label: 'پروژه', value: (item) => `${item.code ?? ''} ${item.name}`, render: (item) => <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography> }, { key: 'status', label: 'وضعیت', value: (item) => item.status }, { key: 'progress', label: 'پیشرفت', value: (item) => item.progress, render: (item) => `${item.progress}٪` }, { key: 'budget', label: 'ارزش', value: (item) => item.budget, render: (item) => formatCurrency(item.budget) }]} /></Card>
      <Card sx={{ p: 2 }}><Typography sx={{ fontWeight: 800, mb: 1.5 }}>اطلاعات ارتباطی و سوابق</Typography><Stack spacing={1}><Typography variant="body2">مسئول حساب: {users.find((item) => item.id === customer.assignedTo)?.name ?? '—'}</Typography><Typography variant="body2">آخرین تماس: {formatRelative(customer.lastContact)}</Typography><Typography variant="body2">قراردادها: {customerContracts.length}</Typography><Typography variant="body2">اسناد مرتبط: {customerDocuments.length}</Typography><Typography variant="body2">مانده قابل وصول: {formatCurrency(invoiced - paid)}</Typography><Button startIcon={<Description />} onClick={() => navigate('/documents?section=customers')}>مشاهده اسناد مشتری</Button></Stack></Card>
    </Box>
    <Card sx={{ mt: 2 }}><CardContent><Typography sx={{ fontWeight: 800, mb: 1 }}>پیش‌نمایش مشتری</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>این بخش فقط رکوردهایی را نشان می‌دهد که صراحتاً برای مشتری قابل مشاهده شده‌اند.</Typography><Stack spacing={1}>{customerTasks.slice(0, 3).map((task) => <Stack key={task.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{task.title}</Typography><CustomerVisibilityBadge visible /></Stack>)}{customerEvents.map((event) => <Stack key={event.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{event.description}</Typography><CustomerVisibilityBadge visible /></Stack>)}{customerNotes.map((note) => <Stack key={note.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ flex: 1 }}>{note.title}</Typography><CustomerVisibilityBadge visible /></Stack>)}{!customerTasks.length && !customerEvents.length && !customerNotes.length && <Typography variant="body2" color="text.secondary">رکورد قابل مشاهده‌ای برای این مشتری ثبت نشده است.</Typography>}</Stack></CardContent></Card>
  </Box>;
}
