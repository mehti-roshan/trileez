import { ArrowBack, PlayArrow, Stop, Add, DeleteOutlined, EditOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import TaskFormDialog from '../components/common/TaskFormDialog.tsx';
import { PriorityChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import { customers, employees, projects, taskLabels, users } from '../mock/data.ts';
import { taskRepository, timesheetRepository } from '../services/repositories.ts';
import { timeTracker, type ActiveTimer } from '../services/timeTracker.ts';
import type { TimesheetEntry } from '../types/index.ts';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';

export default function TaskDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(() => taskRepository.get(id));
  const [entries, setEntries] = useState(() => timesheetRepository.list().filter((entry) => entry.taskId === id));
  const [timer, setTimer] = useState<ActiveTimer | null>(() => timeTracker.current());
  const [elapsed, setElapsed] = useState(0);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeForm, setTimeForm] = useState({ hours: '1', description: '' });
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; done: boolean }>>([]);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const unsubscribeTask = taskRepository.subscribe((rows) => setTask(rows.find((row) => row.id === id)));
    const unsubscribeTimes = timesheetRepository.subscribe((rows) => setEntries(rows.filter((entry) => entry.taskId === id)));
    const unsubscribeTimer = timeTracker.subscribe(setTimer);
    return () => { unsubscribeTask(); unsubscribeTimes(); unsubscribeTimer(); };
  }, [id]);
  useEffect(() => {
    if (!timer || timer.taskId !== id) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [id, timer]);

  if (!task) return <Box><PageHeader title="وظیفه یافت نشد" crumbs={['تری‌لیز', 'کارها']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/tasks')}>بازگشت به کارها</Button></Box>;
  const project = projects.find((item) => item.id === task.projectId);
  const customer = customers.find((item) => item.id === project?.customerId);
  const assignee = users.find((item) => item.id === task.assigneeId);
  const logged = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const estimated = task.estimatedHours ?? 0;
  const cost = entries.reduce((sum, entry) => sum + (entry.calculatedCost ?? entry.hours * (entry.hourlyRate ?? task.hourlyRate ?? 0)), 0);
  const formatElapsed = (seconds: number) => `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const startTimer = () => timeTracker.start(task.id, task.assigneeId || 'u1');
  const stopTimer = () => {
    const stopped = timeTracker.stop();
    if (!stopped || stopped.taskId !== task.id) return;
    const hours = Math.max(0.01, (Date.now() - new Date(stopped.startedAt).getTime()) / 3_600_000);
    const entry: TimesheetEntry = { id: `ts-${Date.now()}`, employeeId: stopped.employeeId, projectId: task.projectId, taskId: task.id, date: new Date().toISOString(), hours: Number(hours.toFixed(2)), hourlyRate: task.hourlyRate ?? 0, calculatedCost: Number((hours * (task.hourlyRate ?? 0)).toFixed(0)), billable: true, description: 'ثبت‌شده از تایمر وظیفه', status: 'draft', createdAt: new Date().toISOString() };
    timesheetRepository.create(entry);
    taskRepository.update(task.id, { loggedHours: logged + entry.hours, updatedAt: new Date().toISOString() });
  };
  const addManualTime = () => {
    const hours = Number(timeForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const entry: TimesheetEntry = { id: `ts-${Date.now()}`, employeeId: task.assigneeId || 'u1', projectId: task.projectId, taskId: task.id, date: new Date().toISOString(), hours, hourlyRate: task.hourlyRate ?? 0, calculatedCost: hours * (task.hourlyRate ?? 0), billable: true, description: timeForm.description || 'ثبت دستی ساعت کاری', status: 'draft', createdAt: new Date().toISOString() };
    timesheetRepository.create(entry);
    taskRepository.update(task.id, { loggedHours: logged + hours, updatedAt: new Date().toISOString() });
    setTimeForm({ hours: '1', description: '' });
    setTimeOpen(false);
  };
  return <Box>
    <PageHeader title={task.title} subtitle={`${project?.code ?? ''} • ${project?.name ?? 'بدون پروژه'} • مشتری: ${customer?.company ?? '—'}`} crumbs={['تری‌لیز', 'کارها', task.title]} actions={<Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => navigate(`/chat?person=${task.assigneeId}`)}>گفتگو با مسئول</Button><Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditOpen(true)}>ویرایش وظیفه</Button><Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate(`/projects/${task.projectId}?view=tasks`)}>بازگشت به پروژه</Button></Stack>} />
    <Stack spacing={2}>
      <Card><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}><Box><Stack direction="row" spacing={1} sx={{ mb: 1 }}><TaskStatusChip value={task.status} /><PriorityChip value={task.priority} /></Stack><Typography variant="body2" color="text.secondary">مسئول: {assignee?.name ?? 'بدون مسئول'} • ایجاد: {formatDateTime(task.createdAt)}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>موعد: {formatDate(task.dueDate)} • شروع: {task.startDate ? formatDate(task.startDate) : '—'}</Typography></Box><Stack direction="row" spacing={1}><Button variant="contained" startIcon={timer?.taskId === task.id ? <Stop /> : <PlayArrow />} onClick={timer?.taskId === task.id ? stopTimer : startTimer}>{timer?.taskId === task.id ? `توقف ${formatElapsed(elapsed)}` : 'شروع تایمر'}</Button><Button variant="outlined" startIcon={<Add />} onClick={() => setTimeOpen(true)}>ثبت ساعت</Button></Stack></Stack><Divider sx={{ my: 2 }} /><Typography>{task.description || 'برای این وظیفه توضیحی ثبت نشده است.'}</Typography><Stack direction="row" spacing={.75} sx={{ mt: 1, flexWrap: 'wrap', gap: .75 }}>{(task.labelIds ?? []).map((labelId) => { const label = taskLabels.find((item) => item.id === labelId); return label ? <Typography key={label.id} sx={{ bgcolor: label.color, color: 'white', borderRadius: 1, px: 1, py: .25, fontSize: 12 }}>{label.name}</Typography> : null; })}{task.tags.map((tag) => <Typography key={tag} variant="caption" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .25 }}>{tag}</Typography>)}</Stack></CardContent></Card>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>{[['زمان تخمینی', `${estimated} ساعت`], ['زمان ثبت‌شده', `${logged.toFixed(2)} ساعت`], ['هزینه زمان', formatCurrency(cost)]].map(([label, value]) => <Card key={label}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography></CardContent></Card>)}</Box>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>زیر وظایف ({subtasks.filter((item) => item.done).length} / {subtasks.length})</Typography><Stack direction="row" spacing={1} sx={{ mb: 1.5 }}><TextField size="small" fullWidth placeholder="عنوان زیر وظیفه..." value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} /><Button variant="outlined" onClick={() => { if (!subtaskTitle.trim()) return; setSubtasks((current) => [...current, { id: `sub-${Date.now()}`, title: subtaskTitle.trim(), done: false }]); setSubtaskTitle(''); }}>افزودن</Button></Stack>{subtasks.map((item) => <Stack key={item.id} direction="row" sx={{ alignItems: 'center' }}><Checkbox checked={item.done} onChange={() => setSubtasks((current) => current.map((subtask) => subtask.id === item.id ? { ...subtask, done: !subtask.done } : subtask))} /><Typography sx={{ textDecoration: item.done ? 'line-through' : undefined, flex: 1 }}>{item.title}</Typography><Button size="small" color="error" onClick={() => setSubtasks((current) => current.filter((subtask) => subtask.id !== item.id))}><DeleteOutlined fontSize="small" /></Button></Stack>)}</CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>تاریخچه ثبت ساعات</Typography>{entries.length ? entries.map((entry) => <Stack key={entry.id} direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}><Typography>{employees.find((employee) => employee.id === entry.employeeId)?.fullName ?? users.find((user) => user.id === entry.employeeId)?.name} • {entry.description}</Typography><Typography color="text.secondary">{entry.hours} ساعت • {formatDate(entry.date)}</Typography></Stack>) : <Typography color="text.secondary">هنوز ساعتی برای این وظیفه ثبت نشده است.</Typography>}</CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800 }}>مشتری</Typography><Typography variant="body2" sx={{ mt: .5 }}>{customer?.company ?? '—'}</Typography><Box sx={{ mt: 1 }}><CustomerVisibilityBadge visible={task.customerVisible} /></Box></CardContent></Card>
    </Stack>
    <Dialog open={timeOpen} onClose={() => setTimeOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ثبت دستی ساعت کاری</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField required type="number" label="مدت (ساعت)" value={timeForm.hours} onChange={(event) => setTimeForm((current) => ({ ...current, hours: event.target.value }))} /><TextField label="توضیحات" multiline minRows={2} value={timeForm.description} onChange={(event) => setTimeForm((current) => ({ ...current, description: event.target.value }))} /><Alert severity="info">ثبت برای {assignee?.name ?? 'کاربر مسئول'} در پروژه {project?.name ?? '—'} انجام می‌شود.</Alert></Stack></DialogContent><DialogActions><Button onClick={() => setTimeOpen(false)}>انصراف</Button><Button variant="contained" onClick={addManualTime}>ثبت زمان</Button></DialogActions></Dialog>
    <TaskFormDialog open={editOpen} task={task} onClose={() => setEditOpen(false)} onSave={(values) => { taskRepository.update(task.id, { ...values, updatedAt: new Date().toISOString() }); setEditOpen(false); }} />
  </Box>;
}
