import { Add } from '@mui/icons-material';
import { Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import { chatGroups, customers, users } from '../mock/data.ts';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import type { Project } from '../types/index.ts';
import { projectRepository } from '../services/repositories.ts';
import DataTable from '../components/common/DataTable.tsx';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams(); const [rows, setRows] = useState(() => projectRepository.list()); const [open, setOpen] = useState(() => params.get('create') === '1'); const [form, setForm] = useState({ name: '', customerId: '', managerId: 'u2', startDate: '2026-08-26', endDate: '2026-12-30', budget: '0', description: '' });
  useEffect(() => projectRepository.subscribe(setRows), []);
  const save = () => { if (!form.name.trim() || !form.customerId) return; const id = `p-new-${Date.now()}`; const groupId = `chat-project-${id}`; const project = { id, code: `P-${700100 + rows.length}`, name: form.name, customerId: form.customerId, managerId: form.managerId, budget: Number(form.budget) || 0, status: 'active' as const, progress: 0, startDate: form.startDate, endDate: form.endDate, members: [form.managerId], tasksCount: 0, completedTasksCount: 0, color: '#1E3A8A', description: form.description || 'پروژه جدید سازمانی', defaultChatGroupId: groupId }; chatGroups.push({ id: groupId, name: `پروژه ${project.name}`, projectId: id, memberIds: project.members, isDefault: true, createdAt: new Date().toISOString() }); projectRepository.create(project); setOpen(false); };
  const importProjects = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Project[] = [];
    records.forEach((row, index) => {
      const name = row['نام پروژه'] || row['نام']; const customer = customers.find((item) => item.company === row['مشتری'] || item.name === row['مشتری'] || item.id === row['شناسه مشتری']);
      if (!name || !customer) { errors.push(`ردیف ${index + 2}: نام پروژه و مشتری معتبر الزامی است.`); return; }
      const id = `p-import-${Date.now()}-${index}`; const groupId = `chat-project-${id}`;
      const project = { id, code: row['کد'] || `P-${700200 + rows.length + index}`, name, customerId: customer.id, managerId: 'u2', budget: Number(row['بودجه'] || 0), status: 'active' as const, progress: 0, startDate: row['تاریخ شروع'] || '2026-08-26', endDate: row['تاریخ پایان'] || '2026-12-30', members: ['u2'], tasksCount: 0, completedTasksCount: 0, color: '#1E3A8A', description: row['توضیحات'] || 'پروژه واردشده', defaultChatGroupId: groupId };
      chatGroups.push({ id: groupId, name: `پروژه ${name}`, projectId: id, memberIds: ['u2'], isDefault: true, createdAt: new Date().toISOString() }); created.push(project);
    });
    created.forEach((project) => projectRepository.create(project)); return { created: created.length, errors };
  };

  return (
    <Box>
      <PageHeader
        title="پروژه‌ها"
        subtitle="فضای کاری پروژه‌های جاری سازمان"
        crumbs={['تری‌لیز', 'پروژه‌ها']}
        actions={<Stack direction="row" spacing={1}><CsvToolbar rows={rows} entityLabel="پروژه‌ها" filename="projects.csv" columns={[{ key: 'code', label: 'کد', value: (project) => project.code }, { key: 'name', label: 'نام پروژه', value: (project) => project.name }, { key: 'customer', label: 'مشتری', value: (project) => customers.find((customer) => customer.id === project.customerId)?.company }, { key: 'status', label: 'وضعیت', value: (project) => project.status }]} onImport={importProjects} /><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>پروژه جدید</Button></Stack>}
      />
      <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(project) => project.id} onRowClick={(project) => navigate(`/projects/${project.id}`)} csvFilename="projects.csv" searchPlaceholder="جستجوی کد، نام پروژه، مشتری یا مدیر..." filters={[{ key: 'status', label: 'وضعیت', options: [...new Set(rows.map((row) => row.status))].map((value) => ({ value, label: value })), value: (row) => row.status }, { key: 'customer', label: 'مشتری', options: customers.map((customer) => ({ value: customer.id, label: customer.company })), value: (row) => row.customerId }]} columns={[{ key: 'code', label: 'کد پروژه', value: (row) => row.code ?? row.id }, { key: 'name', label: 'نام پروژه', value: (row) => row.name, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography> }, { key: 'customer', label: 'مشتری', value: (row) => customers.find((customer) => customer.id === row.customerId)?.company ?? '—', groupable: true }, { key: 'manager', label: 'مدیر پروژه', value: (row) => users.find((user) => user.id === row.managerId)?.name ?? '—' }, { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => <ProjectStatusChip value={row.status} /> }, { key: 'startDate', label: 'تاریخ شروع', value: (row) => row.startDate, render: (row) => formatDate(row.startDate) }, { key: 'endDate', label: 'تاریخ پایان', value: (row) => row.endDate, render: (row) => formatDate(row.endDate) }, { key: 'progress', label: 'پیشرفت', value: (row) => row.progress, aggregate: 'average', render: (row) => `${formatNumber(row.progress)}٪` }, { key: 'tasks', label: 'وظایف', value: (row) => row.tasksCount, aggregate: 'sum', render: (row) => `${row.completedTasksCount} از ${row.tasksCount}` }, { key: 'budget', label: 'بودجه', value: (row) => row.budget, aggregate: 'sum', render: (row) => formatCurrency(row.budget) }]} /></Card>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ایجاد پروژه جدید</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField required label="نام پروژه" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><FormControl required><InputLabel>مشتری</InputLabel><Select label="مشتری" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><MenuItem value="">انتخاب مشتری</MenuItem>{customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.company}</MenuItem>)}</Select></FormControl><FormControl><InputLabel>مدیر پروژه</InputLabel><Select label="مدیر پروژه" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>{users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}</Select></FormControl><TextField label="بودجه (تومان)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /><TextField label="توضیحات" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>انصراف</Button><Button variant="contained" disabled={!form.name.trim() || !form.customerId} onClick={save}>ذخیره پروژه</Button></DialogActions></Dialog>
    </Box>
  );
}
