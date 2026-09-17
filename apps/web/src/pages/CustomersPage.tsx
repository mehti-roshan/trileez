import { Add } from '@mui/icons-material';
import { Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import CustomerFormDialog from '../components/common/CustomerFormDialog.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { CustomerStatusChip } from '../components/common/StatusChip.tsx';
import { customerRepository, userRepository } from '../services/repositories.ts';
import type { CustomerEntityType } from '../types/index.ts';
import { customerCurrencyLabel, customerDisplayName, customerEntityType, customerEntityTypeLabel, customerIdentityLabel } from '../utils/customer.ts';
import { formatCurrency, formatRelative } from '../utils/format.ts';

function parseEntityType(value?: string): CustomerEntityType {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'person' || normalized === 'شخص' || normalized === 'شخص حقیقی' || normalized === 'حقیقی' ? 'person' : 'company';
}

function splitGroups(value?: string): string[] {
  return value?.split(/[،,;|]/).map((item) => item.trim()).filter(Boolean) ?? [];
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(() => customerRepository.list());
  const [accounts, setAccounts] = useState(() => userRepository.list().filter((user) => user.role === 'customer'));
  const [localOpen, setLocalOpen] = useState(false);
  const open = localOpen || params.get('create') === '1';
  useEffect(() => customerRepository.subscribe(setRows), []);
  useEffect(() => userRepository.subscribe((items) => setAccounts(items.filter((user) => user.role === 'customer'))), []);
  const closeForm = () => {
    setLocalOpen(false);
    setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true });
  };
  const importCustomers = (records: Record<string, string>[]) => {
    const errors: string[] = [];
    let created = 0;
    records.forEach((row, index) => {
      const entityType = parseEntityType(row['نوع مشتری'] || row['نوع']);
      const displayName = row['شرکت / نام شخص'] || row['نام شرکت'] || row['نام شخص'] || row['شرکت'] || row['نام'];
      if (!displayName?.trim()) { errors.push(`ردیف ${index + 2}: نام شخص یا شرکت الزامی است.`); return; }
      const name = displayName.trim();
      customerRepository.create({
        entityType, name, company: name,
        nationalCode: row['کد ملی / کد اقتصادی'] || row['شناسه ملی / کد ملی'] || row['کد ملی'] || row['شناسه ملی'] || row['کد اقتصادی'] || undefined,
        vatRegistrationNumber: row['شماره ثبت مالیات بر ارزش افزوده'] || undefined,
        phone: row['شماره موبایل'] || row['موبایل'] || row['تلفن'] || '',
        website: row['وبسایت'] || row['وب‌سایت'] || undefined,
        groups: splitGroups(row['گروه‌ها']), currency: row['ارز'] || 'IRR',
        address: row['آدرس'] || row['نشانی'] || undefined, province: row['استان'] || undefined, city: row['شهر'] || undefined,
        postalCode: row['کد پستی'] || undefined, country: row['کشور'] || 'ایران',
        email: '', status: 'active', value: 0, lastContact: new Date().toISOString(), assignedTo: 'u1',
      });
      created += 1;
    });
    return { created, errors };
  };

  return <Box>
    <PageHeader title="مشتریان" subtitle="مدیریت اشخاص حقیقی و شرکت‌های طرف حساب" crumbs={['تری‌لیز', 'مشتریان']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setLocalOpen(true)}>مشتری جدید</Button>} />
    <Card sx={{ p: 1 }}>
      <DataTable rows={rows} getRowId={(customer) => customer.id} onRowClick={(customer) => navigate(`/customers/${customer.id}`)} searchPlaceholder="جستجوی نام، شناسه، موبایل یا نشانی..." toolbar={<CsvToolbar rows={rows} entityLabel="مشتریان" filename="customers.csv" columns={[
        { key: 'entityType', label: 'نوع مشتری', value: customerEntityTypeLabel },
        { key: 'name', label: 'شرکت / نام شخص', value: customerDisplayName },
        { key: 'identity', label: 'کد ملی / کد اقتصادی', value: (customer) => customer.nationalCode ?? '' },
        { key: 'vat', label: 'شماره ثبت مالیات بر ارزش افزوده', value: (customer) => customer.vatRegistrationNumber ?? '' },
        { key: 'phone', label: 'شماره موبایل', value: (customer) => customer.phone },
        { key: 'website', label: 'وبسایت', value: (customer) => customer.website ?? '' },
        { key: 'groups', label: 'گروه‌ها', value: (customer) => (customer.groups ?? []).join('، ') },
        { key: 'currency', label: 'ارز', value: (customer) => customer.currency ?? 'IRR' },
        { key: 'address', label: 'آدرس', value: (customer) => customer.address ?? '' },
        { key: 'province', label: 'استان', value: (customer) => customer.province ?? '' },
        { key: 'city', label: 'شهر', value: (customer) => customer.city ?? '' },
        { key: 'postalCode', label: 'کد پستی', value: (customer) => customer.postalCode ?? '' },
        { key: 'country', label: 'کشور', value: (customer) => customer.country ?? '' },
      ]} onImport={importCustomers} />} columns={[
        { key: 'entityType', label: 'نوع مشتری', value: customerEntityType, filterLabel: (value) => value === 'person' ? 'شخص حقیقی' : 'شرکت', render: (customer) => <Chip size="small" variant="outlined" label={customerEntityTypeLabel(customer)} /> },
        { key: 'name', label: 'شرکت / نام شخص', value: customerDisplayName, render: (customer) => <Box><Typography sx={{ fontWeight: 700 }}>{customerDisplayName(customer)}</Typography><Typography variant="caption" color="text.secondary">{customerEntityType(customer) === 'company' ? 'شخص حقوقی' : 'شخص حقیقی'}</Typography></Box> },
        { key: 'nationalCode', label: 'شناسه', value: (customer) => `${customerIdentityLabel(customer)} ${customer.nationalCode ?? ''}`, render: (customer) => <Box><Typography variant="caption" color="text.secondary">{customerIdentityLabel(customer)}</Typography><Typography variant="body2" dir="ltr" sx={{ textAlign: 'right' }}>{customer.nationalCode || '—'}</Typography></Box> },
        { key: 'phone', label: 'شماره موبایل', value: (customer) => customer.phone, render: (customer) => <Typography dir="ltr" sx={{ textAlign: 'right' }}>{customer.phone || '—'}</Typography> },
        { key: 'account', label: 'کاربران مشتری', value: (customer) => accounts.filter((user) => user.customerId === customer.id).length, render: (customer) => { const customerAccounts = accounts.filter((user) => user.customerId === customer.id); const activeCount = customerAccounts.filter((user) => user.isActive).length; return <Chip size="small" color={activeCount > 0 ? 'success' : customerAccounts.length ? 'warning' : 'default'} label={customerAccounts.length ? `${customerAccounts.length.toLocaleString('fa-IR')} کاربر${activeCount < customerAccounts.length ? ` • ${activeCount.toLocaleString('fa-IR')} فعال` : ''}` : 'ایجاد نشده'} />; } },
        { key: 'groups', label: 'گروه‌ها', value: (customer) => (customer.groups ?? []).join(' '), render: (customer) => <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>{(customer.groups ?? []).length ? customer.groups.map((group) => <Chip key={group} size="small" label={group} />) : <Typography color="text.secondary">—</Typography>}</Stack> },
        { key: 'currency', label: 'ارز', value: (customer) => customer.currency ?? 'IRR', filterLabel: customerCurrencyLabel, render: (customer) => customerCurrencyLabel(customer.currency) },
        { key: 'location', label: 'نشانی', value: (customer) => `${customer.country ?? ''} ${customer.province ?? ''} ${customer.city ?? ''} ${customer.address ?? ''}`, render: (customer) => <Box><Typography variant="body2">{[customer.city, customer.province, customer.country].filter(Boolean).join('، ') || '—'}</Typography><Typography variant="caption" color="text.secondary">{customer.address || 'نشانی ثبت نشده'}</Typography></Box> },
        { key: 'status', label: 'وضعیت', value: (customer) => customer.status, render: (customer) => <CustomerStatusChip value={customer.status} /> },
        { key: 'value', label: 'ارزش', value: (customer) => customer.value, render: (customer) => formatCurrency(customer.value), aggregate: 'sum' },
        { key: 'lastContact', label: 'آخرین تماس', value: (customer) => customer.lastContact, render: (customer) => formatRelative(customer.lastContact) },
      ]} />
    </Card>
    <CustomerFormDialog open={open} onClose={closeForm} />
  </Box>;
}
