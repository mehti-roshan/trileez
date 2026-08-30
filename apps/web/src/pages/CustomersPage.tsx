import { Add } from '@mui/icons-material';
import { Box, Button, Card, Typography } from '@mui/material';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { CustomerStatusChip } from '../components/common/StatusChip.tsx';
import { customers, users } from '../mock/data.ts';
import { formatCurrency, formatRelative } from '../utils/format.ts';
import DataTable from '../components/common/DataTable.tsx';
import EntityFormDialog, { type EntityField } from '../components/common/EntityFormDialog.tsx';
import type { Customer, CustomerStatus } from '../types/index.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';

export default function CustomersPage() {
  const [params] = useSearchParams(); const [rows, setRows] = useState(customers); const [open, setOpen] = useState(() => params.get('create') === '1');
  const fields: EntityField[] = [
    { name: 'name', label: 'نام شخص تماس', required: true },
    { name: 'company', label: 'نام شرکت', required: true },
    { name: 'nationalCode', label: 'شناسه ملی' },
    { name: 'email', label: 'ایمیل' },
    { name: 'phone', label: 'شماره تماس اصلی' },
    { name: 'additionalPhones', label: 'شماره‌های اضافی', placeholder: 'با ویرگول جدا کنید' },
    { name: 'fax', label: 'فکس' },
    { name: 'country', label: 'کشور' },
    { name: 'province', label: 'استان' },
    { name: 'city', label: 'شهر' },
    { name: 'postalCode', label: 'کد پستی' },
    { name: 'address', label: 'نشانی کامل', type: 'textarea' },
    { name: 'website', label: 'وب‌سایت' },
    { name: 'status', label: 'وضعیت', type: 'select', options: [{ value: 'active', label: 'فعال' }, { value: 'lead', label: 'سرنخ' }, { value: 'inactive', label: 'غیرفعال' }] },
  ];
  const save = (values: Record<string, string>) => {
    const record: Customer = { id: `c-new-${Date.now()}`, name: values.name, company: values.company, email: values.email ?? '', phone: values.phone ?? '', additionalPhones: values.additionalPhones?.split(/[،,]/).map((item) => item.trim()).filter(Boolean), fax: values.fax, nationalCode: values.nationalCode, country: values.country, province: values.province, city: values.city, postalCode: values.postalCode, address: values.address, website: values.website, status: (values.status || 'active') as CustomerStatus, value: 0, lastContact: new Date().toISOString(), assignedTo: 'u1' };
    customers.unshift(record);
    setRows((items) => [record, ...items]); setOpen(false);
  };
  const importCustomers = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Customer[] = [];
    records.forEach((row, index) => {
      const name = row['نام'] || row['نام شخص تماس']; const company = row['شرکت'] || row['نام شرکت'];
      if (!name || !company) { errors.push(`ردیف ${index + 2}: نام و شرکت الزامی است.`); return; }
      created.push({ id: `c-import-${Date.now()}-${index}`, name, company, email: row['ایمیل'] ?? '', phone: row['تلفن'] ?? '', status: 'active', value: 0, lastContact: new Date().toISOString(), assignedTo: 'u1', country: row['کشور'], province: row['استان'], city: row['شهر'], postalCode: row['کد پستی'], address: row['نشانی'] });
    });
    customers.unshift(...created); setRows((items) => [...created, ...items]); return { created: created.length, errors };
  };
  return (
    <Box>
        <PageHeader title="مشتریان" subtitle="نمای ساده CRM برای حساب‌های سازمانی" crumbs={['تری‌لیز', 'مشتریان']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>مشتری جدید</Button>} />
      <Card sx={{ p: 1 }}>
        <DataTable rows={rows} getRowId={(customer) => customer.id} searchPlaceholder="جستجوی نام، شرکت، ایمیل یا شماره تماس..." toolbar={<CsvToolbar rows={rows} entityLabel="مشتریان" filename="customers.csv" columns={[{ key: 'name', label: 'نام', value: (customer) => customer.name }, { key: 'company', label: 'شرکت', value: (customer) => customer.company }, { key: 'email', label: 'ایمیل', value: (customer) => customer.email }, { key: 'phone', label: 'تلفن', value: (customer) => customer.phone }, { key: 'status', label: 'وضعیت', value: (customer) => customer.status }]} onImport={importCustomers} />} columns={[
          { key: 'name', label: 'نام', value: (customer) => `${customer.name} ${customer.company}`, render: (customer) => <Box><Typography sx={{ fontWeight: 700 }}>{customer.name}</Typography><Typography variant="caption" color="text.secondary">{customer.company}</Typography></Box> },
          { key: 'email', label: 'ایمیل', value: (customer) => customer.email },
          { key: 'phone', label: 'تلفن', value: (customer) => `${customer.phone} ${(customer.additionalPhones ?? []).join(' ')}` },
          { key: 'nationalCode', label: 'شناسه ملی', value: (customer) => customer.nationalCode ?? '—' },
          { key: 'location', label: 'نشانی', value: (customer) => `${customer.city ?? ''} ${customer.province ?? ''} ${customer.address ?? ''}`, render: (customer) => <Box><Typography variant="body2">{[customer.city, customer.province].filter(Boolean).join('، ') || '—'}</Typography><Typography variant="caption" color="text.secondary">{customer.address || customer.website || 'نشانی ثبت نشده'}</Typography></Box> },
          { key: 'status', label: 'وضعیت', value: (customer) => customer.status, render: (customer) => <CustomerStatusChip value={customer.status} /> },
          { key: 'value', label: 'ارزش', value: (customer) => customer.value, render: (customer) => formatCurrency(customer.value), aggregate: 'sum' },
          { key: 'lastContact', label: 'آخرین تماس', value: (customer) => customer.lastContact, render: (customer) => formatRelative(customer.lastContact) },
          { key: 'assignedTo', label: 'مسئول', value: (customer) => users.find((user) => user.id === customer.assignedTo)?.name ?? '—' },
        ]} />
      </Card>
      <EntityFormDialog open={open} onClose={() => setOpen(false)} title="ایجاد مشتری جدید" fields={fields} onSubmit={save} submitLabel="ذخیره مشتری" />
    </Box>
  );
}
