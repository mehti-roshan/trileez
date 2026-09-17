import { Add } from '@mui/icons-material';
import { Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import TaskFormDialog from '../components/common/TaskFormDialog.tsx';
import { PriorityChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { customers, taskLabels, users } from '../mock/data.ts';
import type { Task } from '../types/index.ts';
import { formatDate, priorityLabel, taskStatusLabel } from '../utils/format.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { projectActivityRepository, projectMemberRepository, projectPhaseRepository, projectRepository, taskRepository, timesheetRepository } from '../services/repositories.ts';
import { notify } from '../services/notificationService.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';

export default function TasksPage() {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Task[]>(() => taskRepository.list()); const [projectRows, setProjectRows] = useState(() => projectRepository.list()); const [timesheetRows, setTimesheetRows] = useState(() => timesheetRepository.list()); const [editorOpen, setEditorOpen] = useState(() => params.get('create') === '1'); const [editing, setEditing] = useState<Task | null>(null);
  const formOpen = editorOpen || params.get('create') === '1';
  useEffect(() => taskRepository.subscribe(setRows), []);
  useEffect(() => projectRepository.subscribe(setProjectRows), []);
  useEffect(() => timesheetRepository.subscribe(setTimesheetRows), []);
  const closeEditor = () => { setEditorOpen(false); setEditing(null); setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true }); };
  const saveTask = (values: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    if (editing) {
      const updated = { ...editing, ...values, updatedAt: now };
      taskRepository.update(editing.id, updated);
    } else {
      const created = { ...values, id: `t-new-${Date.now()}`, createdAt: now, updatedAt: now };
      taskRepository.create(created);
      const recipients = [...new Set(values.assigneeIds ?? [values.assigneeId])].filter(Boolean);
      recipients.forEach((recipientId) => {
        if (recipientId === 'u1') return;
        notify({
          id: `notification-task-${created.id}-${recipientId}`,
          title: 'وظیفه جدید به شما اختصاص یافت',
          body: `${created.title} • پروژه: ${projectRows.find((project) => project.id === created.projectId)?.name ?? '—'}`,
          createdAt: now,
          type: 'task_assigned',
          recipientId,
          actorId: 'u1',
          entityType: 'task',
          entityId: created.id,
          taskId: created.id,
          projectId: created.projectId,
          smsStatus: 'queued',
        });
      });
    }
    closeEditor();
  };
  const importTasks = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Task[] = [];
    records.forEach((row, index) => {
      const title = row['عنوان'] || row['عنوان وظیفه']; const project = projectRows.find((item) => item.name === row['پروژه'] || item.code === row['کد پروژه']);
      if (!title || !project) { errors.push(`ردیف ${index + 2}: عنوان و پروژه معتبر الزامی است.`); return; }
      const projectPhaseRows = projectPhaseRepository.list().filter((phase) => phase.projectId === project.id);
      const phase = projectPhaseRows.find((item) => item.id === row['شناسه فاز'] || item.title === row['فاز']) ?? projectPhaseRows[0];
      if (!phase) { errors.push(`ردیف ${index + 2}: پروژه فاقد فاز است؛ ابتدا یک فاز برای پروژه بسازید.`); return; }
      const member = projectMemberRepository.list().find((item) => item.projectId === project.id && item.personId === project.managerId && item.status === 'active') ?? projectMemberRepository.list().find((item) => item.projectId === project.id && item.status === 'active');
      if (!member) { errors.push(`ردیف ${index + 2}: پروژه عضو فعال ندارد.`); return; }
      const activity = projectActivityRepository.list().find((item) => item.projectId === project.id && member.roleIds.includes(item.roleId));
      const due = row['موعد'] || row['تاریخ پایان'] || new Date().toISOString();
      created.push({ id: `t-import-${Date.now()}-${index}`, title, projectId: project.id, phaseId: phase.id, activityId: activity?.id, description: row['توضیحات'] ?? '', status: 'todo', priority: 'medium', assigneeId: member.personId, assigneeIds: [member.personId], assigneeMemberIds: [member.id], followerIds: [project.managerId], dueDate: due, startDate: row['تاریخ شروع'], estimatedHours: Number(row['ساعت تخمینی']) || 0, hourlyRate: Number(row['نرخ ساعتی']) || 0, tags: (row['تگ‌ها'] ?? '').split(/[،,]/).filter(Boolean), labelIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    created.forEach((task) => taskRepository.create(task)); return { created: created.length, errors };
  };
  return <Box>
    <PageHeader title="کارها" subtitle="فهرست کارها با وضعیت، اولویت و مسئول" crumbs={['تری‌لیز', 'کارها']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => { setEditing(null); setEditorOpen(true); }}>وظیفه جدید</Button>} />
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(task) => task.id} searchPlaceholder="جستجوی عنوان، پروژه، مشتری یا مسئول..." toolbar={<CsvToolbar rows={rows} entityLabel="وظایف" filename="tasks.csv" columns={[{ key: 'title', label: 'عنوان', value: (task) => task.title }, { key: 'project', label: 'پروژه', value: (task) => projectRows.find((project) => project.id === task.projectId)?.name }, { key: 'status', label: 'وضعیت', value: (task) => task.status }, { key: 'priority', label: 'اولویت', value: (task) => task.priority }, { key: 'dueDate', label: 'موعد', value: (task) => task.dueDate }]} onImport={importTasks} />} onRowClick={(task) => navigate(`/tasks/${task.id}`)} columns={[
      { key: 'title', label: 'عنوان', value: (task) => `${task.title} ${task.description ?? ''}`, render: (task) => <Typography sx={{ fontWeight: 600 }}>{task.title}</Typography> },
      { key: 'labels', label: 'برچسب‌ها', value: (task) => `${(task.labelIds ?? []).map((id) => taskLabels.find((item) => item.id === id)?.name ?? '').join(' ')} ${task.tags.join(' ')}`, render: (task) => <Stack direction="row" spacing={.5} sx={{ flexWrap: 'wrap', gap: .5 }}>{(task.labelIds ?? []).map((id) => { const item = taskLabels.find((x) => x.id === id); return item ? <Chip key={id} size="small" label={item.name} sx={{ bgcolor: item.color, color: 'white' }} /> : null; })}{task.tags.map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}</Stack> },
      { key: 'project', label: 'پروژه', value: (task) => projectRows.find((item) => item.id === task.projectId)?.name ?? '—' },
      { key: 'phase', label: 'فاز', value: (task) => projectPhaseRepository.get(task.phaseId ?? '')?.title ?? '—' },
      { key: 'activity', label: 'فعالیت', value: (task) => projectActivityRepository.get(task.activityId ?? '')?.title ?? '—' },
      { key: 'customer', label: 'مشتری', value: (task) => customers.find((customer) => customer.id === projectRows.find((item) => item.id === task.projectId)?.customerId)?.company ?? '—' },
      { key: 'status', label: 'وضعیت', value: (task) => taskStatusLabel[task.status], render: (task) => <TaskStatusChip value={task.status} /> },
      { key: 'priority', label: 'اولویت', value: (task) => priorityLabel[task.priority], render: (task) => <PriorityChip value={task.priority} /> },
      { key: 'assignee', label: 'مسئول', value: (task) => users.find((user) => user.id === task.assigneeId)?.name ?? 'بدون مسئول', render: (task) => { const assignee = users.find((user) => user.id === task.assigneeId); return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><UserAvatar user={assignee} size={28} />{assignee?.name ?? 'بدون مسئول'}</Box>; } },
      { key: 'estimated', label: 'ساعت تخمینی', value: (task) => task.estimatedHours ?? 0, aggregate: 'sum' },
      { key: 'actual', label: 'ساعت واقعی', value: (task) => timesheetRows.filter((entry) => entry.taskId === task.id).reduce((sum, entry) => sum + entry.hours, 0), aggregate: 'sum' },
      { key: 'dueDate', label: 'موعد', value: (task) => task.dueDate, render: (task) => formatDate(task.dueDate) },
      { key: 'customerVisible', label: 'نمایش به مشتری', value: (task) => task.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (task) => <CustomerVisibilityBadge visible={task.customerVisible} /> },
    ]} /></Card>
    <TaskFormDialog open={formOpen} task={editing} defaultProjectId={params.get('project') ?? undefined} onClose={closeEditor} onSave={saveTask} />
  </Box>;
}
