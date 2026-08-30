import { Add } from '@mui/icons-material';
import { Box, Button, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import TaskFormDialog from '../components/common/TaskFormDialog.tsx';
import { PriorityChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { customers, projects, taskLabels, tasks, users } from '../mock/data.ts';
import type { Priority, Task, TaskStatus } from '../types/index.ts';
import { formatDate, priorityLabel, taskStatusLabel } from '../utils/format.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';

export default function TasksPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'all' | TaskStatus>('all'); const [priority, setPriority] = useState<'all' | Priority>('all'); const [label, setLabel] = useState('all');
  const [rows, setRows] = useState<Task[]>(tasks); const [editorOpen, setEditorOpen] = useState(() => params.get('create') === '1'); const [editing, setEditing] = useState<Task | null>(null);
  const filteredRows = useMemo(() => rows.filter((task) => {
    return (status === 'all' || task.status === status) && (priority === 'all' || task.priority === priority) && (label === 'all' || (task.labelIds ?? []).includes(label));
  }), [label, priority, rows, status]);
  const saveTask = (values: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    if (editing) {
      const updated = { ...editing, ...values, updatedAt: now };
      const sourceIndex = tasks.findIndex((item) => item.id === editing.id);
      if (sourceIndex >= 0) tasks[sourceIndex] = updated;
      setRows((items) => items.map((item) => item.id === editing.id ? updated : item));
    } else {
      const created = { ...values, id: `t-new-${Date.now()}`, createdAt: now, updatedAt: now };
      tasks.unshift(created);
      setRows((items) => [created, ...items]);
    }
    setEditorOpen(false); setEditing(null);
  };
  const importTasks = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Task[] = [];
    records.forEach((row, index) => {
      const title = row['عنوان'] || row['عنوان وظیفه']; const project = projects.find((item) => item.name === row['پروژه'] || item.code === row['کد پروژه']);
      if (!title || !project) { errors.push(`ردیف ${index + 2}: عنوان و پروژه معتبر الزامی است.`); return; }
      const due = row['موعد'] || row['تاریخ پایان'] || new Date().toISOString();
      created.push({ id: `t-import-${Date.now()}-${index}`, title, projectId: project.id, description: row['توضیحات'] ?? '', status: 'todo', priority: 'medium', assigneeId: 'u1', assigneeIds: ['u1'], followerIds: [project.managerId], dueDate: due, startDate: row['تاریخ شروع'], hourlyRate: Number(row['نرخ ساعتی']) || 0, tags: (row['تگ‌ها'] ?? '').split(/[،,]/).filter(Boolean), labelIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    tasks.unshift(...created); setRows((items) => [...created, ...items]); return { created: created.length, errors };
  };
  return <Box>
    <PageHeader title="کارها" subtitle="فهرست کارها با وضعیت، اولویت و مسئول" crumbs={['تری‌لیز', 'کارها']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => { setEditing(null); setEditorOpen(true); }}>وظیفه جدید</Button>} />
    <Card sx={{ p: 2, mb: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}><FormControl sx={{ minWidth: 160 }}><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={status} onChange={(event) => setStatus(event.target.value as 'all' | TaskStatus)}><MenuItem value="all">همه</MenuItem>{Object.entries(taskStatusLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl sx={{ minWidth: 160 }}><InputLabel>اولویت</InputLabel><Select label="اولویت" value={priority} onChange={(event) => setPriority(event.target.value as 'all' | Priority)}><MenuItem value="all">همه</MenuItem>{Object.entries(priorityLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl sx={{ minWidth: 160 }}><InputLabel>لیبل</InputLabel><Select label="لیبل" value={label} onChange={(event) => setLabel(event.target.value)}><MenuItem value="all">همه لیبل‌ها</MenuItem>{taskLabels.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select></FormControl></Stack></Card>
    <Card sx={{ p: 1 }}><DataTable rows={filteredRows} getRowId={(task) => task.id} searchPlaceholder="جستجوی عنوان، پروژه، مشتری یا مسئول..." toolbar={<CsvToolbar rows={filteredRows} entityLabel="وظایف" filename="tasks.csv" columns={[{ key: 'title', label: 'عنوان', value: (task) => task.title }, { key: 'project', label: 'پروژه', value: (task) => projects.find((project) => project.id === task.projectId)?.name }, { key: 'status', label: 'وضعیت', value: (task) => task.status }, { key: 'priority', label: 'اولویت', value: (task) => task.priority }, { key: 'dueDate', label: 'موعد', value: (task) => task.dueDate }]} onImport={importTasks} />} onRowClick={(task) => { setEditing(task); setEditorOpen(true); }} columns={[
      { key: 'title', label: 'عنوان', value: (task) => `${task.title} ${task.description ?? ''}`, render: (task) => <Typography sx={{ fontWeight: 600 }}>{task.title}</Typography> },
      { key: 'labels', label: 'برچسب‌ها', value: (task) => `${(task.labelIds ?? []).map((id) => taskLabels.find((item) => item.id === id)?.name ?? '').join(' ')} ${task.tags.join(' ')}`, render: (task) => <Stack direction="row" spacing={.5} sx={{ flexWrap: 'wrap', gap: .5 }}>{(task.labelIds ?? []).map((id) => { const item = taskLabels.find((x) => x.id === id); return item ? <Chip key={id} size="small" label={item.name} sx={{ bgcolor: item.color, color: 'white' }} /> : null; })}{task.tags.map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}</Stack> },
      { key: 'project', label: 'پروژه', value: (task) => projects.find((item) => item.id === task.projectId)?.name ?? '—' },
      { key: 'customer', label: 'مشتری', value: (task) => customers.find((customer) => customer.id === projects.find((item) => item.id === task.projectId)?.customerId)?.company ?? '—' },
      { key: 'status', label: 'وضعیت', value: (task) => taskStatusLabel[task.status], render: (task) => <TaskStatusChip value={task.status} /> },
      { key: 'priority', label: 'اولویت', value: (task) => priorityLabel[task.priority], render: (task) => <PriorityChip value={task.priority} /> },
      { key: 'assignee', label: 'مسئول', value: (task) => users.find((user) => user.id === task.assigneeId)?.name ?? 'بدون مسئول', render: (task) => { const assignee = users.find((user) => user.id === task.assigneeId); return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><UserAvatar user={assignee} size={28} />{assignee?.name ?? 'بدون مسئول'}</Box>; } },
      { key: 'dueDate', label: 'موعد', value: (task) => task.dueDate, render: (task) => formatDate(task.dueDate) },
    ]} /></Card>
    <TaskFormDialog open={editorOpen} task={editing} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={saveTask} />
  </Box>;
}
