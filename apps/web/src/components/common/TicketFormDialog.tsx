/* eslint-disable react-hooks/set-state-in-effect */
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { customers, projects, users } from '../../services/repositories.ts';
import type { Ticket, TicketCategory, TicketStatus, Priority } from '../../types/index.ts';

const ticketDepartments = ['فنی', 'فروش', 'مالی', 'پشتیبانی', 'اداری'];
const ticketServices = ['طراحی سایت', 'سئو', 'پشتیبانی سایت', 'هاست و سرور', 'شبکه', 'توسعه نرم‌افزار'];
const statusOptions: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'باز' }, { value: 'in_progress', label: 'در حال بررسی' }, { value: 'waiting', label: 'در انتظار مشتری' }, { value: 'closed', label: 'بسته' },
];
const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'low', label: 'پایین' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'بالا' }, { value: 'urgent', label: 'فوری' },
];

type Props = { open: boolean; ticket?: Ticket | null; defaultProjectId?: string; onClose: () => void; onSave: (value: Partial<Ticket>) => void };

export default function TicketFormDialog({ open, ticket, defaultProjectId, onClose, onSave }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const customer = ticket?.customerId ? customers.find((item) => item.id === ticket.customerId) : undefined;
    setForm({
      title: ticket?.title ?? '', description: ticket?.description ?? '', customerId: ticket?.customerId ?? '', projectId: ticket?.projectId ?? defaultProjectId ?? '',
      assigneeId: ticket?.assigneeId ?? 'u1', reporterId: ticket?.reporterId ?? 'u1', status: ticket?.status ?? 'open', priority: ticket?.priority ?? 'medium',
      category: ticket?.category ?? 'support', department: ticket?.department ?? 'پشتیبانی', service: ticket?.service ?? 'پشتیبانی سایت', tags: ticket?.tags.join(', ') ?? '',
      customerVisible: String(Boolean(ticket?.customerVisible)), contactName: ticket?.contactName ?? customer?.name ?? '', contactEmail: ticket?.contactEmail ?? customer?.email ?? '', contactPhone: ticket?.contactPhone ?? customer?.phone ?? '',
    });
  }, [ticket, defaultProjectId, open]);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const availableProjects = projects.filter((project) => !form.customerId || project.customerId === form.customerId);
  const submit = () => {
    if (!form.title?.trim() || !form.description?.trim()) return;
    const customer = customers.find((item) => item.id === form.customerId);
    const project = projects.find((item) => item.id === form.projectId);
    if (project && customer && project.customerId !== customer.id) return;
    onSave({ title: form.title.trim(), description: form.description.trim(), customerId: form.customerId || undefined, projectId: form.projectId || undefined, assigneeId: form.assigneeId, reporterId: form.reporterId, status: form.status as TicketStatus, priority: form.priority as Priority, category: form.category as TicketCategory, department: form.department, service: form.service, tags: (form.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean), customerVisible: form.customerVisible === 'true', contactName: customer?.name ?? form.contactName, contactEmail: customer?.email ?? form.contactEmail, contactPhone: customer?.phone ?? form.contactPhone });
    onClose();
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle>{ticket ? 'ویرایش تیکت' : 'ایجاد تیکت جدید'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField required label="موضوع" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} />
      <TextField required multiline minRows={4} label="متن تیکت" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth><InputLabel>مشتری</InputLabel><Select label="مشتری" value={form.customerId ?? ''} onChange={(e) => { const value = String(e.target.value); const customer = customers.find((item) => item.id === value); setForm((current) => ({ ...current, customerId: value, projectId: '', contactName: customer?.name ?? '', contactEmail: customer?.email ?? '', contactPhone: customer?.phone ?? '' })); }}>{customers.map((item) => <MenuItem key={item.id} value={item.id}>{item.company}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>پروژه</InputLabel><Select label="پروژه" value={form.projectId ?? ''} onChange={(e) => set('projectId', String(e.target.value))}><MenuItem value="">بدون پروژه</MenuItem>{availableProjects.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth><InputLabel>مسئول</InputLabel><Select label="مسئول" value={form.assigneeId ?? ''} onChange={(e) => set('assigneeId', String(e.target.value))}>{users.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={form.status ?? 'open'} onChange={(e) => set('status', String(e.target.value))}>{statusOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>اولویت</InputLabel><Select label="اولویت" value={form.priority ?? 'medium'} onChange={(e) => set('priority', String(e.target.value))}>{priorityOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth><InputLabel>دپارتمان</InputLabel><Select label="دپارتمان" value={form.department ?? ''} onChange={(e) => set('department', String(e.target.value))}>{ticketDepartments.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>سرویس</InputLabel><Select label="سرویس" value={form.service ?? ''} onChange={(e) => set('service', String(e.target.value))}>{ticketServices.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>دسته</InputLabel><Select label="دسته" value={form.category ?? 'support'} onChange={(e) => set('category', String(e.target.value))}><MenuItem value="bug">خطا</MenuItem><MenuItem value="feature">قابلیت</MenuItem><MenuItem value="support">پشتیبانی</MenuItem><MenuItem value="other">سایر</MenuItem></Select></FormControl>
      </Stack>
      <TextField label="برچسب‌ها" helperText="برچسب‌ها را با ویرگول جدا کنید" value={form.tags ?? ''} onChange={(e) => set('tags', e.target.value)} />
      <FormControlLabel control={<Checkbox checked={form.customerVisible === 'true'} onChange={(e) => set('customerVisible', String(e.target.checked))} />} label="قابل مشاهده برای مشتری" />
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>انصراف</Button><Button variant="contained" disabled={!form.title?.trim() || !form.description?.trim()} onClick={submit}>ذخیره</Button></DialogActions>
  </Dialog>;
}
