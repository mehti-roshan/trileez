/* eslint-disable react-hooks/set-state-in-effect */
import { Add } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import DataTable from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import TicketFormDialog from '../components/common/TicketFormDialog.tsx';
import { PriorityChip, TicketStatusChip } from '../components/common/StatusChip.tsx';
import { customers, projects, users } from '../services/repositories.ts';
import { ticketRepository } from '../services/repositories.ts';
import { notify } from '../services/notificationService.ts';
import type { Ticket } from '../types/index.ts';
import { formatDateTime, formatNumber, priorityLabel, ticketStatusLabel } from '../utils/format.ts';

export default function TicketsPage() {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Ticket[]>(() => ticketRepository.list());
  const [formOpen, setFormOpen] = useState(params.get('create') === '1');
  useEffect(() => ticketRepository.subscribe(setRows), []);
  useEffect(() => setFormOpen(params.get('create') === '1'), [params]);
  const projectId = params.get('project') ?? undefined;
  const csvColumns = [
    { key: 'title', label: 'موضوع', value: (row: Ticket) => row.title },
    { key: 'customer', label: 'مشتری', value: (row: Ticket) => customers.find((item) => item.id === row.customerId)?.company ?? '' },
    { key: 'project', label: 'پروژه', value: (row: Ticket) => projects.find((item) => item.id === row.projectId)?.name ?? '' },
    { key: 'status', label: 'وضعیت', value: (row: Ticket) => ticketStatusLabel[row.status] },
    { key: 'priority', label: 'اولویت', value: (row: Ticket) => priorityLabel[row.priority] },
    { key: 'assignee', label: 'مسئول', value: (row: Ticket) => users.find((item) => item.id === row.assigneeId)?.name ?? '' },
  ];
  const save = async (value: Partial<Ticket>) => {
    const now = new Date().toISOString();
    if (params.get('edit')) await ticketRepository.update(params.get('edit')!, { ...value, updatedAt: now });
    else {
      const created = await ticketRepository.create({ ...value, createdAt: now, updatedAt: now, tags: value.tags ?? [], title: value.title ?? 'تیکت جدید', description: value.description ?? '', status: value.status ?? 'open', priority: value.priority ?? 'medium', category: value.category ?? 'support', assigneeId: value.assigneeId ?? 'u1', reporterId: value.reporterId ?? 'u1' });
      await ticketRepository.update(created.id, { activities: [{ id: `ta-${Date.now()}`, ticketId: created.id, type: 'created', description: 'تیکت ایجاد شد', actorId: 'u1', createdAt: now }] });
      if (created.assigneeId !== 'u1') await notify({ id: `n-${Date.now()}`, title: 'تیکت جدید به شما اختصاص داده شد', body: `تیکت «${created.title}» به شما اختصاص داده شد.`, createdAt: now, type: 'ticket', ticketId: created.id, recipientId: created.assigneeId, actorId: 'u1', entityType: 'ticket', entityId: created.id });
    }
    setFormOpen(false); setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); next.delete('edit'); return next; });
  };
  const importRows = async (items: Record<string, string>[]) => {
    const errors: string[] = []; let created = 0;
    const actor = users[0];
    if (!actor) return { created: 0, errors: ['برای ورود تیکت‌ها باید حداقل یک کاربر تاییدشده از سرور وجود داشته باشد.'] };
    for (const [index, item] of items.entries()) {
      const title = item['موضوع'] ?? item['عنوان'] ?? item.title;
      if (!title?.trim()) { errors.push(`ردیف ${index + 2}: موضوع الزامی است.`); continue; }
      const customer = customers.find((entry) => entry.company === item['مشتری']); const project = projects.find((entry) => entry.name === item['پروژه']);
      try { await ticketRepository.create({ title: title.trim(), description: item['شرح'] ?? item.description ?? '', status: 'open', priority: 'medium', category: 'support', assigneeId: actor.id, reporterId: actor.id, customerId: customer?.id, projectId: project?.id, tags: [], customerVisible: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); created += 1; }
      catch (error) { errors.push(`ردیف ${index + 2}: ${error instanceof Error ? error.message : 'ذخیره در سرور انجام نشد'}`); }
    }
    return { created, errors };
  };
  const stats = useMemo(() => ({ all: rows.length, open: rows.filter((row) => row.status === 'open').length, progress: rows.filter((row) => row.status === 'in_progress').length, urgent: rows.filter((row) => row.priority === 'urgent').length }), [rows]);
  const closeForm = () => { setFormOpen(false); setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }); };
  return <Box>
    <PageHeader title="تیکت‌ها" subtitle="صف پشتیبانی و درخواست‌های داخلی" crumbs={['تری‌لیز', 'تیکت‌ها']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setFormOpen(true)}>ایجاد تیکت</Button>} />
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, mb: 2 }}>{[['کل تیکت‌ها', stats.all], ['باز', stats.open], ['در حال بررسی', stats.progress], ['فوری', stats.urgent]].map(([label, value]) => <Card key={String(label)}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{formatNumber(Number(value))}</Typography></CardContent></Card>)}</Box>
    <Card><CardContent><DataTable rows={rows} getRowId={(row) => row.id} onRowClick={(row) => navigate(`/tickets/${row.id}`)} searchPlaceholder="جستجوی موضوع، مشتری یا مسئول..." toolbar={<CsvToolbar rows={rows} columns={csvColumns} filename="tickets.csv" entityLabel="تیکت‌ها" onImport={importRows} />} filters={[
      { key: 'status', label: 'وضعیت', options: Object.entries(ticketStatusLabel).map(([value, label]) => ({ value, label })), value: (row) => row.status },
      { key: 'priority', label: 'اولویت', options: Object.entries(priorityLabel).map(([value, label]) => ({ value, label })), value: (row) => row.priority },
      { key: 'assignee', label: 'مسئول', options: users.map((user) => ({ value: user.id, label: user.name })), value: (row) => row.assigneeId },
      { key: 'customer', label: 'مشتری', options: customers.map((customer) => ({ value: customer.id, label: customer.company })), value: (row) => row.customerId ?? '' },
      { key: 'project', label: 'پروژه', options: projects.map((project) => ({ value: project.id, label: project.name })), value: (row) => row.projectId ?? '' },
      { key: 'department', label: 'دپارتمان', options: ['فنی', 'فروش', 'مالی', 'پشتیبانی', 'اداری'].map((value) => ({ value, label: value })), value: (row) => row.department ?? '' },
      { key: 'service', label: 'سرویس', options: ['طراحی سایت', 'سئو', 'پشتیبانی سایت', 'هاست و سرور', 'شبکه', 'توسعه نرم‌افزار'].map((value) => ({ value, label: value })), value: (row) => row.service ?? '' },
      { key: 'visible', label: 'نمایش به مشتری', options: [{ value: 'yes', label: 'قابل مشاهده برای مشتری' }, { value: 'no', label: 'داخلی' }], value: (row) => row.customerVisible ? 'yes' : 'no' },
    ]} columns={[
      { key: 'title', label: 'موضوع', value: (row) => row.title, render: (row) => <Box><Typography sx={{ fontWeight: 700 }}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{row.description}</Typography></Box> },
      { key: 'customer', label: 'مشتری', value: (row) => customers.find((item) => item.id === row.customerId)?.company ?? '—' },
      { key: 'project', label: 'پروژه', value: (row) => projects.find((item) => item.id === row.projectId)?.name ?? '—' },
      { key: 'status', label: 'وضعیت', value: (row) => ticketStatusLabel[row.status], render: (row) => <TicketStatusChip value={row.status} /> },
      { key: 'priority', label: 'اولویت', value: (row) => priorityLabel[row.priority], render: (row) => <PriorityChip value={row.priority} /> },
      { key: 'assignee', label: 'مسئول', value: (row) => users.find((item) => item.id === row.assigneeId)?.name ?? '—' },
      { key: 'department', label: 'دپارتمان', value: (row) => row.department ?? '—' },
      { key: 'service', label: 'سرویس', value: (row) => row.service ?? '—' },
      { key: 'tags', label: 'برچسب‌ها', value: (row) => row.tags.join('، '), render: (row) => <Stack direction="row" spacing={.5}>{row.tags.map((tag) => <Chip key={tag} size="small" label={tag} />)}</Stack> },
      { key: 'visible', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> },
      { key: 'updatedAt', label: 'آخرین بروزرسانی', value: (row) => row.updatedAt, render: (row) => formatDateTime(row.updatedAt) },
    ]} /></CardContent></Card>
    <TicketFormDialog open={formOpen} defaultProjectId={projectId} onClose={closeForm} onSave={save} />
  </Box>;
}
