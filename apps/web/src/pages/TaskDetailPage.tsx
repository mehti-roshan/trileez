import { ArrowBack, Add, DeleteOutlined, EditOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import TaskFormDialog from '../components/common/TaskFormDialog.tsx';
import { PriorityChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import { customers, employees, taskLabels, users } from '../services/repositories.ts';
import { projectActivityRepository, projectMemberRepository, projectNoteRepository, projectPhaseRepository, projectRepository, taskRepository, timesheetRepository } from '../services/repositories.ts';
import { formatCurrency, formatDate, formatDateTime, timesheetBillingStatusLabel, timesheetStatusOptions } from '../utils/format.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { useApp } from '../context/AppContext.tsx';
import { reviewTimesheet } from '../services/timesheetWorkflow.ts';
import { taskTimeService } from '../services/taskTimeService.ts';

export default function TaskDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const [task, setTask] = useState(() => taskRepository.get(id));
  const [entries, setEntries] = useState(() => timesheetRepository.list().filter((entry) => entry.taskId === id));
  const [notes, setNotes] = useState(() => projectNoteRepository.list().filter((note) => note.taskId === id));
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeForm, setTimeForm] = useState({ hours: '1', description: '' });
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; done: boolean }>>([]);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteCustomerVisible, setNoteCustomerVisible] = useState(false);

  useEffect(() => {
    const unsubscribeTask = taskRepository.subscribe((rows) => setTask(rows.find((row) => row.id === id)));
    const unsubscribeTimes = timesheetRepository.subscribe((rows) => setEntries(rows.filter((entry) => entry.taskId === id)));
    const unsubscribeNotes = projectNoteRepository.subscribe((rows) => setNotes(rows.filter((note) => note.taskId === id)));
    return () => { unsubscribeTask(); unsubscribeTimes(); unsubscribeNotes(); };
  }, [id]);

  if (!task) return <Box><PageHeader title="وظیفه یافت نشد" crumbs={['تری‌لیز', 'کارها']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/tasks')}>بازگشت به کارها</Button></Box>;
  const project = projectRepository.get(task.projectId);
  const customer = customers.find((item) => item.id === project?.customerId);
  const phase = projectPhaseRepository.get(task.phaseId ?? '');
  const activity = projectActivityRepository.get(task.activityId ?? '');
  const assignedMembers = projectMemberRepository.list().filter((member) => task.assigneeMemberIds?.includes(member.id) || (task.assigneeIds ?? [task.assigneeId]).includes(member.personId));
  const assignees = users.filter((item) => assignedMembers.some((member) => member.personId === item.id));
  const assignee = assignees[0] ?? users.find((item) => item.id === task.assigneeId);
  const logged = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const estimated = task.estimatedHours ?? 0;
  const cost = entries.reduce((sum, entry) => sum + Number(entry.calculatedCost ?? 0), 0);
  const addManualTime = async () => {
    const hours = Number(timeForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) return;
    await taskTimeService.create({ employeeId: task.assigneeId || user.id, projectId: task.projectId, taskId: task.id, date: new Date().toISOString(), hours, billable: true, customerVisible: false, description: timeForm.description || 'ثبت دستی زمان وظیفه' });
    setTimeForm({ hours: '1', description: '' });
    setTimeOpen(false);
  };
  const addNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    await projectNoteRepository.create({
      projectId: task.projectId,
      taskId: task.id,
      title: `یادداشت وظیفه: ${task.title}`,
      body,
      authorId: user.id,
      category: 'وظیفه',
      customerVisible: noteCustomerVisible,
      createdAt: new Date().toISOString(),
    });
    setNoteText('');
    setNoteCustomerVisible(false);
  };
  return <Box>
    <PageHeader title={task.title} subtitle={`${project?.code ?? ''} • ${project?.name ?? 'بدون پروژه'} • مشتری: ${customer?.company ?? '—'}`} crumbs={['تری‌لیز', 'کارها', task.title]} actions={<Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => navigate(`/chat?person=${task.assigneeId}`)}>گفتگو با مسئول</Button><Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditOpen(true)}>ویرایش وظیفه</Button><Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate(`/projects/${task.projectId}?view=tasks`)}>بازگشت به پروژه</Button></Stack>} />
    <Stack spacing={2}>
      <Card><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}><Box><Stack direction="row" spacing={1} sx={{ mb: 1 }}><TaskStatusChip value={task.status} /><PriorityChip value={task.priority} /></Stack><Typography variant="body2" color="text.secondary">اعضای مسئول: {assignees.map((item) => item.name).join('، ') || assignee?.name || 'بدون مسئول'} • ایجاد: {formatDateTime(task.createdAt)}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>فاز: {phase?.title ?? 'تعیین نشده'} • فعالیت: {activity?.title ?? 'تعیین نشده'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>برنامه: {task.startDate ? formatDate(task.startDate) : '—'} تا {formatDate(task.dueDate)}</Typography></Box><Button variant="outlined" startIcon={<Add />} onClick={() => setTimeOpen(true)}>ثبت ساعت</Button></Stack><Divider sx={{ my: 2 }} /><Typography>{task.description || 'برای این وظیفه توضیحی ثبت نشده است.'}</Typography><Stack direction="row" spacing={.75} sx={{ mt: 1, flexWrap: 'wrap', gap: .75 }}>{(task.labelIds ?? []).map((labelId) => { const label = taskLabels.find((item) => item.id === labelId); return label ? <Typography key={label.id} sx={{ bgcolor: label.color, color: 'white', borderRadius: 1, px: 1, py: .25, fontSize: 12 }}>{label.name}</Typography> : null; })}{task.tags.map((tag) => <Typography key={tag} variant="caption" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .25 }}>{tag}</Typography>)}</Stack></CardContent></Card>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>{[['زمان تخمینی', `${estimated} ساعت`], ['زمان ثبت‌شده', `${logged.toFixed(2)} ساعت`], ['هزینه زمان', formatCurrency(cost)]].map(([label, value]) => <Card key={label}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography></CardContent></Card>)}</Box>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>زیر وظایف ({subtasks.filter((item) => item.done).length} / {subtasks.length})</Typography><Stack direction="row" spacing={1} sx={{ mb: 1.5 }}><TextField size="small" fullWidth placeholder="عنوان زیر وظیفه..." value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} /><Button variant="outlined" onClick={() => { if (!subtaskTitle.trim()) return; setSubtasks((current) => [...current, { id: `sub-${Date.now()}`, title: subtaskTitle.trim(), done: false }]); setSubtaskTitle(''); }}>افزودن</Button></Stack>{subtasks.map((item) => <Stack key={item.id} direction="row" sx={{ alignItems: 'center' }}><Checkbox checked={item.done} onChange={() => setSubtasks((current) => current.map((subtask) => subtask.id === item.id ? { ...subtask, done: !subtask.done } : subtask))} /><Typography sx={{ textDecoration: item.done ? 'line-through' : undefined, flex: 1 }}>{item.title}</Typography><Button size="small" color="error" onClick={() => setSubtasks((current) => current.filter((subtask) => subtask.id !== item.id))}><DeleteOutlined fontSize="small" /></Button></Stack>)}</CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>یادداشت‌های وظیفه</Typography><Stack spacing={1.25}><TextField multiline minRows={3} label="یادداشت جدید" placeholder="متن یادداشت را وارد کنید..." value={noteText} onChange={(event) => setNoteText(event.target.value)} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Stack direction="row" sx={{ alignItems: 'center' }}><Checkbox checked={noteCustomerVisible} onChange={(event) => setNoteCustomerVisible(event.target.checked)} /><Box><Typography variant="body2">قابل مشاهده برای مشتری</Typography><Typography variant="caption" color="text.secondary">حالت پیش‌فرض یادداشت داخلی است.</Typography></Box></Stack><Button variant="contained" disabled={!noteText.trim()} onClick={addNote}>ثبت یادداشت</Button></Stack></Stack><Divider sx={{ my: 2 }} />{notes.length ? <Stack spacing={1.25}>{notes.map((note) => <Box key={note.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', mb: .75 }}><Box><Typography sx={{ fontWeight: 700 }}>{users.find((item) => item.id === note.authorId)?.name ?? 'کاربر'}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(note.createdAt)}</Typography></Box><Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}><CustomerVisibilityBadge visible={note.customerVisible} /><Button size="small" variant="outlined" onClick={() => projectNoteRepository.update(note.id, { customerVisible: !note.customerVisible })}>{note.customerVisible ? 'تبدیل به داخلی' : 'نمایش برای مشتری'}</Button>{note.authorId === user.id && <Button size="small" color="error" aria-label="حذف یادداشت" onClick={() => projectNoteRepository.remove(note.id)}><DeleteOutlined fontSize="small" /></Button>}</Stack></Stack><Typography sx={{ whiteSpace: 'pre-wrap' }}>{note.body}</Typography></Box>)}</Stack> : <Typography color="text.secondary">هنوز یادداشتی برای این وظیفه ثبت نشده است.</Typography>}</CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>تاریخچه ثبت ساعات</Typography>{entries.length ? entries.map((entry) => <Stack key={entry.id} direction={{ xs: 'column', lg: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { lg: 'center' }, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography>{employees.find((employee) => employee.id === entry.employeeId)?.fullName ?? users.find((user) => user.id === entry.employeeId)?.name} • {entry.description}</Typography><Typography variant="body2" color="text.secondary">{entry.hours} ساعت • {formatDate(entry.date)} • {formatCurrency(entry.calculatedCost ?? 0)}</Typography></Box><Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Select size="small" value={entry.status} onChange={(event) => { void reviewTimesheet(entry.id, event.target.value as typeof entry.status); }} sx={{ minWidth: 165 }}>{timesheetStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select><Typography variant="caption" sx={{ color: entry.billingStatus === 'paid' ? 'success.main' : 'warning.main', fontWeight: 700 }}>وضعیت مالی: {timesheetBillingStatusLabel[entry.billingStatus ?? 'suspended']}</Typography></Stack></Stack>) : <Typography color="text.secondary">هنوز ساعتی برای این وظیفه ثبت نشده است.</Typography>}</CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800 }}>مشتری</Typography><Typography variant="body2" sx={{ mt: .5 }}>{customer?.company ?? '—'}</Typography><Box sx={{ mt: 1 }}><CustomerVisibilityBadge visible={task.customerVisible} /></Box></CardContent></Card>
    </Stack>
    <Dialog open={timeOpen} onClose={() => setTimeOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ثبت دستی ساعت کاری</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField required type="number" label="مدت (ساعت)" value={timeForm.hours} onChange={(event) => setTimeForm((current) => ({ ...current, hours: event.target.value }))} /><TextField label="توضیحات" multiline minRows={2} value={timeForm.description} onChange={(event) => setTimeForm((current) => ({ ...current, description: event.target.value }))} /><Alert severity="info">ثبت برای {assignee?.name ?? 'کاربر مسئول'} در پروژه {project?.name ?? '—'} انجام می‌شود.</Alert></Stack></DialogContent><DialogActions><Button onClick={() => setTimeOpen(false)}>انصراف</Button><Button variant="contained" onClick={addManualTime}>ثبت زمان</Button></DialogActions></Dialog>
    <TaskFormDialog open={editOpen} task={task} onClose={() => setEditOpen(false)} onSave={(values) => taskRepository.update(task.id, { ...values, updatedAt: new Date().toISOString() })} />
  </Box>;
}
