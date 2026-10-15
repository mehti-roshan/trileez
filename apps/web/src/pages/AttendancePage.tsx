import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { attendanceRepository, employees, leaveRequests, users } from '../services/repositories.ts';
import { attendanceService, type AttendanceInput } from '../services/attendanceService.ts';
import type { AttendanceRecord, AttendanceStatus } from '../types/index.ts';
import { formatDate } from '../utils/format.ts';

const today = () => new Date().toISOString().slice(0, 10);
const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? users.find((user) => user.id === id)?.name ?? id;
const statusLabels: Record<AttendanceStatus, string> = { present: 'حاضر', absent: 'غایب', late: 'تأخیر', leave: 'مرخصی', mission: 'ماموریت', remote: 'دورکاری' };
const approvalLabels = { pending: 'در انتظار تأیید', approved: 'تأییدشده', rejected: 'ردشده' } as const;
const hours = (minutes?: number) => `${((minutes ?? 0) / 60).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ساعت`;
const emptyForm = (): AttendanceInput => ({ employeeId: '', date: today(), status: 'present', clockIn: '', clockOut: '', source: 'manual', leaveRequestId: '', notes: '' });
const toTimeInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(11, 16);
};
const toIso = (date: string, time?: string) => time ? new Date(`${date}T${time}:00`).toISOString() : undefined;

function Stat({ title, value, color = 'text.primary' }: { title: string; value: string; color?: string }) {
  return <Card variant="outlined"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h6" sx={{ mt: .4, fontWeight: 900, color }}>{value}</Typography></CardContent></Card>;
}

export default function AttendancePage() {
  const [rows, setRows] = useState(attendanceRepository.list());
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AttendanceInput>(emptyForm());
  const [reviewing, setReviewing] = useState<AttendanceRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved');
  const [reviewReason, setReviewReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => attendanceRepository.subscribe(setRows), []);
  const approvedLeaves = useMemo(() => leaveRequests.filter((leave) => leave.status === 'approved' && (!form.employeeId || leave.employeeId === form.employeeId)), [form.employeeId]);
  const fullTimeEmployeeRows = employees.filter((employee) => employee.compensationType === 'full_time_attendance');
  const fullTimeEmployees = new Set(fullTimeEmployeeRows.map((employee) => employee.id));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setError(''); setFormOpen(true); };
  const openEdit = (row: AttendanceRecord) => {
    setEditing(row);
    setForm({ employeeId: row.employeeId, date: row.date.slice(0, 10), status: row.status, clockIn: toTimeInput(row.clockIn), clockOut: toTimeInput(row.clockOut), source: row.source ?? 'manual', leaveRequestId: row.leaveRequestId ?? '', notes: row.notes ?? '' });
    setError(''); setFormOpen(true);
  };

  const save = async () => {
    if (!form.employeeId || !form.date || !form.status) { setError('کارمند، تاریخ و وضعیت حضور الزامی هستند.'); return; }
    if (['present', 'late', 'remote'].includes(form.status) && (!form.clockIn || !form.clockOut)) { setError('برای وضعیت کاری، ورود و خروج باید ثبت شود.'); return; }
    if (form.status === 'leave' && !form.leaveRequestId) { setError('برای مرخصی، درخواست مرخصی تأییدشده را انتخاب کنید.'); return; }
    const payload = { ...form, clockIn: toIso(form.date, form.clockIn), clockOut: toIso(form.date, form.clockOut), leaveRequestId: form.leaveRequestId || undefined, notes: form.notes?.trim() || undefined };
    setBusy(true); setError('');
    try {
      if (editing) {
        await attendanceService.update(editing.id, { status: payload.status, clockIn: payload.clockIn, clockOut: payload.clockOut, source: payload.source, leaveRequestId: payload.leaveRequestId, notes: payload.notes });
        setSuccess('اصلاح حضور در سرور ثبت شد و رکورد برای تأیید مجدد در انتظار است.');
      } else {
        await attendanceService.create(payload);
        setSuccess('رکورد حضور در سرور ثبت شد و در انتظار تأیید است.');
      }
      setFormOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت حضور و غیاب انجام نشد.'); }
    finally { setBusy(false); }
  };

  const review = async () => {
    if (!reviewing) return;
    if (reviewStatus === 'rejected' && !reviewReason.trim()) { setError('برای رد رکورد حضور، دلیل الزامی است.'); return; }
    setBusy(true); setError('');
    try {
      await attendanceService.review(reviewing.id, reviewStatus, reviewReason.trim() || undefined);
      setReviewing(null); setReviewReason(''); setSuccess('نتیجه بررسی حضور در سرور ثبت شد.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'بررسی حضور انجام نشد.'); }
    finally { setBusy(false); }
  };

  const approved = rows.filter((row) => row.approvalStatus === 'approved');
  const workedMinutes = approved.reduce((sum, row) => sum + Number(row.workedMinutes ?? 0), 0);
  const overtimeMinutes = approved.reduce((sum, row) => sum + Number(row.overtimeMinutes ?? 0), 0);

  return <Box>
    <PageHeader title="حضور و غیاب" subtitle="حضور کاری، ورود و خروج؛ منبع حقوق کارکنان تمام‌وقت" crumbs={['تری‌لیز', 'منابع انسانی', 'حضور و غیاب']} actions={<Stack direction="row" spacing={1}><CsvToolbar rows={rows} entityLabel="حضور و غیاب" filename="attendance.csv" columns={[
      { key: 'employee', label: 'کارمند', value: (row) => employeeName(row.employeeId) }, { key: 'date', label: 'تاریخ', value: (row) => row.date },
      { key: 'clockIn', label: 'ورود', value: (row) => row.clockIn }, { key: 'clockOut', label: 'خروج', value: (row) => row.clockOut },
      { key: 'worked', label: 'ساعات کارکرد', value: (row) => (row.workedMinutes ?? 0) / 60 }, { key: 'overtime', label: 'اضافه‌کاری', value: (row) => (row.overtimeMinutes ?? 0) / 60 },
      { key: 'approval', label: 'وضعیت تأیید', value: (row) => approvalLabels[row.approvalStatus ?? 'pending'] },
    ]} /><Button variant="contained" onClick={openCreate}>ثبت حضور</Button></Stack>} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    <Alert severity="info" sx={{ mb: 2 }}>حضور و غیاب با زمان وظیفه متفاوت است. فقط رکوردهای حضور تأییدشده همراه با پیکربندی جبران خدمت تمام‌وقت وارد محاسبه حقوق می‌شوند؛ اصلاح ورود، خروج یا وضعیت، تأیید قبلی را باطل می‌کند.</Alert>
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}><Stat title="رکوردهای حضور" value={rows.length.toLocaleString('fa-IR')} /><Stat title="در انتظار تأیید" value={rows.filter((row) => (row.approvalStatus ?? 'pending') === 'pending').length.toLocaleString('fa-IR')} color="warning.main" /><Stat title="کارکرد تأییدشده" value={hours(workedMinutes)} color="success.main" /><Stat title="اضافه‌کاری تأییدشده" value={hours(overtimeMinutes)} color="primary.main" /></Box>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} onRowClick={openEdit} emptyTitle="رکورد حضور ثبت نشده است" emptyDescription="ورود و خروج یک کارمند را ثبت کنید." filters={[
      { key: 'approval', label: 'وضعیت تأیید', options: Object.entries(approvalLabels).map(([value, label]) => ({ value, label })), value: (row) => row.approvalStatus ?? 'pending' },
      { key: 'status', label: 'وضعیت حضور', options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })), value: (row) => row.status },
    ]} columns={[
      { key: 'employee', label: 'کارمند', value: (row) => employeeName(row.employeeId), render: (row) => <Box><Typography sx={{ fontWeight: 900 }}>{employeeName(row.employeeId)}</Typography><Typography variant="caption" color="text.secondary">{fullTimeEmployees.has(row.employeeId) ? 'تمام‌وقت / مبنای حقوق حضور' : 'روش پرداخت دیگر'}</Typography></Box> },
      { key: 'date', label: 'تاریخ', value: (row) => row.date, render: (row) => formatDate(row.date) },
      { key: 'clock', label: 'ورود / خروج', value: (row) => `${row.checkIn ?? ''} ${row.checkOut ?? ''}`, render: (row) => <Typography>{row.checkIn ?? '—'} تا {row.checkOut ?? '—'}</Typography> },
      { key: 'status', label: 'وضعیت حضور', value: (row) => row.status, render: (row) => <Chip size="small" variant="outlined" label={statusLabels[row.status]} /> },
      { key: 'worked', label: 'کارکرد', value: (row) => (row.workedMinutes ?? 0) / 60, aggregate: 'sum', render: (row) => <Box><Typography sx={{ fontWeight: 800 }}>{hours(row.workedMinutes)}</Typography><Typography variant="caption" color="text.secondary">انتظار {hours(row.expectedMinutes)}</Typography></Box> },
      { key: 'breakdown', label: 'تفکیک حقوقی', value: (row) => `${row.regularMinutes ?? 0}-${row.overtimeMinutes ?? 0}`, render: (row) => <Typography variant="body2">عادی {hours(row.regularMinutes)}<br />اضافه {hours(row.overtimeMinutes)}<br />غیبت {hours(row.absenceMinutes)}<br />مرخصی {hours(row.approvedLeaveMinutes)}</Typography> },
      { key: 'approval', label: 'تأیید حقوق', value: (row) => row.approvalStatus ?? 'pending', render: (row) => <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }} onClick={(event) => event.stopPropagation()}><Chip size="small" color={row.approvalStatus === 'approved' ? 'success' : row.approvalStatus === 'rejected' ? 'error' : 'warning'} label={approvalLabels[row.approvalStatus ?? 'pending']} /><Button size="small" onClick={() => { setReviewing(row); setReviewStatus('approved'); setReviewReason(''); setError(''); }}>بررسی</Button></Stack> },
      { key: 'notes', label: 'یادداشت', value: (row) => row.notes || row.rejectionReason || '—' },
    ]} /></Card>

    <Dialog open={formOpen} onClose={() => !busy && setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'اصلاح حضور و غیاب' : 'ثبت حضور و غیاب'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {editing && <Alert severity="warning">اصلاح ورود، خروج، وضعیت یا مرخصی، رکورد را در سرور به «در انتظار تأیید» برمی‌گرداند.</Alert>}
      <FormControl fullWidth disabled={Boolean(editing)}><InputLabel>کارمند</InputLabel><Select label="کارمند" value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value, leaveRequestId: '' }))}>{fullTimeEmployeeRows.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName} — تمام‌وقت / مبنای حضور</MenuItem>)}</Select></FormControl>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth disabled={Boolean(editing)} type="date" label="تاریخ" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /><FormControl fullWidth><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AttendanceStatus, leaveRequestId: event.target.value === 'leave' ? current.leaveRequestId : '' }))}>{Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl></Stack>
      {['present', 'late', 'remote'].includes(form.status) && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}><TextField fullWidth type="time" label="ساعت ورود" value={form.clockIn} onChange={(event) => setForm((current) => ({ ...current, clockIn: event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }} /><TextField fullWidth type="time" label="ساعت خروج" value={form.clockOut} onChange={(event) => setForm((current) => ({ ...current, clockOut: event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }} /></Stack>}
      {form.status === 'leave' && <FormControl fullWidth><InputLabel>درخواست مرخصی تأییدشده</InputLabel><Select label="درخواست مرخصی تأییدشده" value={form.leaveRequestId} onChange={(event) => setForm((current) => ({ ...current, leaveRequestId: event.target.value }))}>{approvedLeaves.map((leave) => <MenuItem key={leave.id} value={leave.id}>{formatDate(leave.startDate)} تا {formatDate(leave.endDate)} • {leave.reason}</MenuItem>)}</Select></FormControl>}
      <FormControl fullWidth><InputLabel>منبع ثبت</InputLabel><Select label="منبع ثبت" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as 'manual' | 'clock' }))}><MenuItem value="manual">ثبت دستی</MenuItem><MenuItem value="clock">سیستم ورود و خروج</MenuItem></Select></FormControl>
      <TextField label="یادداشت" multiline minRows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
      <Alert severity="info">ساعات مورد انتظار، کارکرد عادی، اضافه‌کاری، غیبت و مرخصی توسط سرور و پیکربندی جبران خدمت محاسبه می‌شوند.</Alert>
    </Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setFormOpen(false)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ثبت…' : 'ثبت در سرور'}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(reviewing)} onClose={() => !busy && setReviewing(null)} fullWidth maxWidth="xs"><DialogTitle>بررسی حضور و غیاب</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>نتیجه</InputLabel><Select label="نتیجه" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as 'approved' | 'rejected')}><MenuItem value="approved">تأیید</MenuItem><MenuItem value="rejected">رد</MenuItem></Select></FormControl><TextField label="دلیل / یادداشت بررسی" required={reviewStatus === 'rejected'} multiline minRows={3} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></Stack></DialogContent><DialogActions><Button color="inherit" disabled={busy} onClick={() => setReviewing(null)}>انصراف</Button><Button variant="contained" disabled={busy} onClick={() => void review()}>{busy ? 'در حال ثبت…' : 'ثبت نتیجه'}</Button></DialogActions></Dialog>
    <Snackbar open={Boolean(success)} autoHideDuration={4500} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="success" variant="filled" onClose={() => setSuccess('')}>{success}</Alert></Snackbar>
  </Box>;
}
