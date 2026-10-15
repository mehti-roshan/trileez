import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { employees, projects, tasks, timesheetRepository, users } from '../services/repositories.ts';
import { taskTimeService, type TaskTimeInput } from '../services/taskTimeService.ts';
import { reviewTimesheet } from '../services/timesheetWorkflow.ts';
import type { TimesheetEntry, TimesheetStatus } from '../types/index.ts';
import { formatCurrency, formatDate, getTimesheetStatusLabel, normalizeTimesheetStatus, timesheetStatusOptions } from '../utils/format.ts';

const today = () => new Date().toISOString().slice(0, 10);
const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? users.find((user) => user.id === id)?.name ?? id;
const emptyForm = (): TaskTimeInput => ({ employeeId: '', projectId: '', taskId: '', date: today(), hours: 1, startTime: '', endTime: '', billable: false, customerVisible: false, description: '' });
const statusColor = (status: TimesheetStatus): 'default' | 'success' | 'warning' | 'error' | 'info' => status === 'approved' ? 'success' : status === 'rejected' ? 'error' : status === 'pending_review' || status === 'review_again' ? 'warning' : status === 'suspended' ? 'default' : 'info';

function Stat({ title, value, color = 'text.primary' }: { title: string; value: string; color?: string }) {
  return <Card variant="outlined"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h6" sx={{ mt: .4, fontWeight: 900, color }}>{value}</Typography></CardContent></Card>;
}

export default function TaskTimePage() {
  const [rows, setRows] = useState(timesheetRepository.list());
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TaskTimeInput>(emptyForm());
  const [reviewing, setReviewing] = useState<TimesheetEntry | null>(null);
  const [reviewStatus, setReviewStatus] = useState<TimesheetStatus>('approved');
  const [reviewReason, setReviewReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => timesheetRepository.subscribe(setRows), []);
  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === form.projectId), [form.projectId]);
  const projectEmployees = useMemo(() => {
    const project = projects.find((item) => item.id === form.projectId);
    return project?.members?.length
      ? employees.filter((employee) => project.members.includes(employee.id) || Boolean(employee.userId && project.members.includes(employee.userId)))
      : employees;
  }, [form.projectId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setError(''); setFormOpen(true); };
  const openEdit = (row: TimesheetEntry) => {
    setEditing(row);
    setForm({ employeeId: row.employeeId, projectId: row.projectId, taskId: row.taskId, date: row.date.slice(0, 10), hours: row.hours, startTime: row.startTime ?? '', endTime: row.endTime ?? '', billable: row.billable, customerVisible: row.customerVisible, description: row.description ?? '' });
    setError(''); setFormOpen(true);
  };

  const save = async () => {
    if (!form.employeeId || !form.projectId || !form.taskId || !form.date || !(Number(form.hours) > 0)) { setError('کارمند، پروژه، وظیفه، تاریخ و ساعت مثبت الزامی هستند.'); return; }
    setBusy(true); setError('');
    try {
      if (editing) {
        await taskTimeService.update(editing.id, { date: form.date, hours: Number(form.hours), startTime: form.startTime || undefined, endTime: form.endTime || undefined, billable: form.billable, customerVisible: form.customerVisible, description: form.description?.trim() || undefined });
        setSuccess('اصلاح زمان وظیفه در سرور ثبت شد و برای تأیید مجدد در انتظار بررسی است.');
      } else {
        await taskTimeService.create({ ...form, hours: Number(form.hours), startTime: form.startTime || undefined, endTime: form.endTime || undefined, description: form.description?.trim() || undefined });
        setSuccess('زمان وظیفه در سرور ثبت شد و در انتظار بررسی است.');
      }
      setFormOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت زمان وظیفه انجام نشد.'); }
    finally { setBusy(false); }
  };

  const review = async () => {
    if (!reviewing) return;
    if (reviewStatus === 'rejected' && !reviewReason.trim()) { setError('برای رد کردن زمان وظیفه، دلیل الزامی است.'); return; }
    setBusy(true); setError('');
    try {
      await reviewTimesheet(reviewing.id, reviewStatus, reviewReason.trim() || undefined);
      setReviewing(null); setReviewReason(''); setSuccess('نتیجه بررسی زمان وظیفه در سرور ثبت شد.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'بررسی زمان وظیفه انجام نشد.'); }
    finally { setBusy(false); }
  };

  const approvedHours = rows.filter((row) => normalizeTimesheetStatus(row.status) === 'approved').reduce((sum, row) => sum + row.hours, 0);
  const pendingHours = rows.filter((row) => ['pending_review', 'review_again'].includes(normalizeTimesheetStatus(row.status))).reduce((sum, row) => sum + row.hours, 0);
  const approvedCost = rows.filter((row) => normalizeTimesheetStatus(row.status) === 'approved').reduce((sum, row) => sum + Number(row.calculatedCost ?? 0), 0);

  return <Box>
    <PageHeader title="زمان وظیفه" subtitle="زمان صرف‌شده روی پروژه و وظیفه؛ تنها رکوردهای تأییدشده وارد حقوق ساعتی می‌شوند" crumbs={['تری‌لیز', 'مدیریت کار', 'زمان وظیفه']} actions={<Stack direction="row" spacing={1}><CsvToolbar rows={rows} entityLabel="زمان وظیفه" filename="task-time.csv" columns={[
      { key: 'employee', label: 'کارمند', value: (row) => employeeName(row.employeeId) }, { key: 'project', label: 'پروژه', value: (row) => projects.find((project) => project.id === row.projectId)?.name },
      { key: 'task', label: 'وظیفه', value: (row) => tasks.find((task) => task.id === row.taskId)?.title }, { key: 'date', label: 'تاریخ', value: (row) => row.date },
      { key: 'hours', label: 'ساعت', value: (row) => row.hours }, { key: 'status', label: 'وضعیت تأیید', value: (row) => getTimesheetStatusLabel(row.status) },
    ]} /><Button variant="contained" onClick={openCreate}>ثبت زمان وظیفه</Button></Stack>} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Alert severity="info" sx={{ mb: 2 }}>زمان وظیفه با حضور و غیاب متفاوت است. اصلاح تاریخ، ساعت شروع/پایان یا مدت، تأیید قبلی را باطل می‌کند و رکورد تا تأیید مجدد وارد محاسبه حقوق نمی‌شود.</Alert>
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}><Stat title="کل رکوردها" value={rows.length.toLocaleString('fa-IR')} /><Stat title="ساعات تأییدشده" value={`${approvedHours.toLocaleString('fa-IR')} ساعت`} color="success.main" /><Stat title="در انتظار بررسی" value={`${pendingHours.toLocaleString('fa-IR')} ساعت`} color="warning.main" /><Stat title="هزینه تأییدشده" value={formatCurrency(approvedCost)} color="primary.main" /></Box>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} onRowClick={openEdit} emptyTitle="زمان وظیفه‌ای ثبت نشده است" emptyDescription="زمان کار روی یک پروژه و وظیفه را ثبت کنید." filters={[{ key: 'status', label: 'وضعیت تأیید', options: timesheetStatusOptions, value: (row) => normalizeTimesheetStatus(row.status) }]} columns={[
      { key: 'employee', label: 'کارمند', value: (row) => employeeName(row.employeeId), groupable: true },
      { key: 'project', label: 'پروژه', value: (row) => projects.find((project) => project.id === row.projectId)?.name ?? '—', groupable: true },
      { key: 'task', label: 'وظیفه', value: (row) => tasks.find((task) => task.id === row.taskId)?.title ?? '—' },
      { key: 'date', label: 'تاریخ', value: (row) => row.date, render: (row) => formatDate(row.date) },
      { key: 'hours', label: 'زمان', value: (row) => row.hours, aggregate: 'sum', render: (row) => <Box><Typography sx={{ fontWeight: 800 }}>{row.hours.toLocaleString('fa-IR')} ساعت</Typography><Typography variant="caption" color="text.secondary">{row.startTime && row.endTime ? `${row.startTime} تا ${row.endTime}` : 'مدت ثبت‌شده'}</Typography></Box> },
      { key: 'cost', label: 'نرخ و مبلغ سرور', value: (row) => row.calculatedCost ?? 0, aggregate: 'sum', render: (row) => <Box><Typography>{formatCurrency(row.calculatedCost ?? 0)}</Typography><Typography variant="caption" color="text.secondary">نرخ {formatCurrency(row.hourlyRate ?? 0)}</Typography></Box> },
      { key: 'status', label: 'تأیید حقوق', value: (row) => normalizeTimesheetStatus(row.status), render: (row) => <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }} onClick={(event) => event.stopPropagation()}><Chip size="small" color={statusColor(normalizeTimesheetStatus(row.status))} label={getTimesheetStatusLabel(row.status)} /><Button size="small" onClick={() => { setReviewing(row); setReviewStatus('approved'); setReviewReason(''); setError(''); }}>بررسی</Button></Stack> },
      { key: 'description', label: 'توضیحات', value: (row) => row.description || '—' },
    ]} /></Card>

    <Dialog open={formOpen} onClose={() => !busy && setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'اصلاح زمان وظیفه' : 'ثبت زمان وظیفه'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {editing && <Alert severity="warning">اصلاح فیلدهای زمانی، وضعیت رکورد را در سرور به «در انتظار بررسی» برمی‌گرداند.</Alert>}
      <FormControl fullWidth disabled={Boolean(editing)}><InputLabel>پروژه</InputLabel><Select label="پروژه" value={form.projectId} onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value, taskId: '', employeeId: '' }))}>{projects.map((project) => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</Select></FormControl>
      <FormControl fullWidth disabled={Boolean(editing) || !form.projectId}><InputLabel>وظیفه</InputLabel><Select label="وظیفه" value={form.taskId} onChange={(event) => setForm((current) => ({ ...current, taskId: event.target.value }))}>{projectTasks.map((task) => <MenuItem key={task.id} value={task.id}>{task.title}</MenuItem>)}</Select></FormControl>
      <FormControl fullWidth disabled={Boolean(editing) || !form.projectId}><InputLabel>کارمند</InputLabel><Select label="کارمند" value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}>{projectEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName}</MenuItem>)}</Select></FormControl>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth type="date" label="تاریخ" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><TextField fullWidth type="number" label="مدت (ساعت)" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: Number(event.target.value) }))} slotProps={{ htmlInput: { min: .01, max: 24, step: .25 } }} /></Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth type="time" label="شروع اختیاری" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><TextField fullWidth type="time" label="پایان اختیاری" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /></Stack>
      <Stack direction="row" spacing={1}><Button variant={form.billable ? 'contained' : 'outlined'} onClick={() => setForm((current) => ({ ...current, billable: !current.billable }))}>قابل صورتحساب: {form.billable ? 'بله' : 'خیر'}</Button><Button variant={form.customerVisible ? 'contained' : 'outlined'} onClick={() => setForm((current) => ({ ...current, customerVisible: !current.customerVisible }))}>نمایش مشتری: {form.customerVisible ? 'بله' : 'خیر'}</Button></Stack>
      <TextField label="توضیحات" multiline minRows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
    </Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setFormOpen(false)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ثبت…' : 'ثبت در سرور'}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(reviewing)} onClose={() => !busy && setReviewing(null)} fullWidth maxWidth="xs"><DialogTitle>بررسی زمان وظیفه</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>نتیجه</InputLabel><Select label="نتیجه" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as TimesheetStatus)}>{timesheetStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><TextField label="دلیل / یادداشت بررسی" required={reviewStatus === 'rejected'} multiline minRows={3} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setReviewing(null)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void review()}>{busy ? 'در حال ثبت…' : 'ثبت نتیجه'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(success)} autoHideDuration={4500} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" variant="filled" onClose={() => setSuccess('')}>{success}</Alert></Snackbar>
  </Box>;
}
