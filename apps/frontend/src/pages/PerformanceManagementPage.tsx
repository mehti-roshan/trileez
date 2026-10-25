import { Add, CheckCircleOutlined, HistoryOutlined, TrendingDown, TrendingUp } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import JalaliDatePicker from '../components/common/JalaliDatePicker.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { employees, projects, tasks, users } from '../services/repositories.ts';
import { performanceEventRepository, performancePeriodRepository } from '../services/repositories.ts';
import { createPerformanceAdjustment, finalizePerformanceMonth, reopenPerformanceMonth } from '../services/performanceService.ts';
import type { PerformancePointEvent } from '../types/index.ts';
import { formatDate } from '../utils/format.ts';
import { eventsForMonth, finalizedPeriods, monthKey, monthRange, performanceMonthTitle, scoreSummary } from '../utils/performance.ts';
import { useApp } from '../context/AppContext.tsx';

const personName = (id?: string) => employees.find((employee) => employee.id === id)?.fullName ?? users.find((user) => user.id === id)?.name ?? '—';
const projectName = (id?: string) => projects.find((project) => project.id === id)?.name ?? '—';
const eventReason = (event: PerformancePointEvent) => event.reason?.trim() || event.description || 'دلیل ثبت‌نشده';
const scoreTone = (score: number): 'success' | 'primary' | 'warning' | 'error' => score >= 85 ? 'success' : score >= 65 ? 'primary' : score >= 50 ? 'warning' : 'error';
const currentMonth = () => monthRange(new Date()).startedAt;
type MonthlyScoreRow = {
  id: string;
  title: string;
  score: number;
  baseline: number;
  adjustment: number;
  grade: string;
  eventCount: number;
  evaluator?: string;
  notes?: string;
  current?: boolean;
};

function ScoreCard({ label, score, helper }: { label: string; score: number; helper: string }) {
  return <Card><CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}><Typography variant="caption" color="text.secondary">{label}</Typography><Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: .5 }}><Typography variant="h4" sx={{ fontWeight: 900, color: `${scoreTone(score)}.main` }}>{score.toLocaleString('fa-IR')}</Typography><Typography color="text.secondary">از ۱۰۰</Typography></Stack><LinearProgress color={scoreTone(score)} variant="determinate" value={score} sx={{ height: 7, borderRadius: 6, my: 1 }} /><Typography variant="caption" color="text.secondary">{helper}</Typography></CardContent></Card>;
}

function AdjustmentDialog({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId?: string }) {
  const { user } = useApp();
  const [values, setValues] = useState({ employeeId: employeeId ?? '', reason: '', category: '', points: '', projectId: '', date: new Date().toISOString().slice(0, 10), description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setValues({ employeeId: employeeId ?? '', reason: '', category: '', points: '', projectId: '', date: new Date().toISOString().slice(0, 10), description: '' }); }, [employeeId, open]);
  const save = async () => {
    if (!values.reason.trim()) { setError('دلیل تغییر امتیاز را وارد کنید.'); return; }
    setSaving(true);
    try {
      await createPerformanceAdjustment({ employeeId: values.employeeId, reason: values.reason, category: values.category || 'عمومی', points: Number(values.points), projectId: values.projectId || undefined, date: values.date, description: values.description, createdBy: user.id }, { events: performanceEventRepository, periods: performancePeriodRepository });
      setError(''); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ثبت تغییر امتیاز ناموفق بود.'); } finally { setSaving(false); }
  };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>ثبت تغییر امتیاز عملکرد</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <FormControl required fullWidth><InputLabel>کارمند</InputLabel><Select label="کارمند" value={values.employeeId} onChange={(event) => setValues({ ...values, employeeId: event.target.value })} disabled={Boolean(employeeId)}>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.personnelCode} — {employee.fullName}</MenuItem>)}</Select></FormControl>
      <TextField required label="دلیل تغییر امتیاز" value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value })} placeholder="مثلاً: تحویل زودتر از موعد با رضایت مشتری" helperText="این متن عیناً در تاریخچه عملکرد و گزارش‌ها ثبت می‌شود." />
      <TextField label="دسته‌بندی" value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })} placeholder="مثلاً: کیفیت، تعهد، پروژه یا عملکرد ممتاز" />
      <TextField required type="number" label="مقدار تغییر امتیاز" value={values.points} onChange={(event) => setValues({ ...values, points: event.target.value })} helperText="عدد مثبت برای افزایش و عدد منفی برای کسر امتیاز؛ از ۱- تا ۱۰۰+." slotProps={{ htmlInput: { min: -100, max: 100 } }} />
      <FormControl fullWidth><InputLabel>پروژه مرتبط (اختیاری)</InputLabel><Select label="پروژه مرتبط (اختیاری)" value={values.projectId} onChange={(event) => setValues({ ...values, projectId: event.target.value })}><MenuItem value="">بدون پروژه</MenuItem>{projects.map((project) => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</Select></FormControl>
      <JalaliDatePicker required label="تاریخ رویداد" value={values.date} onChange={(date) => setValues({ ...values, date })} />
      <TextField multiline minRows={3} label="شرح و یادداشت تکمیلی" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} placeholder="شرح روشن و قابل پیگیری از دلیل تغییر امتیاز" />
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>انصراف</Button><Button variant="contained" onClick={save} disabled={saving || !values.employeeId || !values.reason.trim() || !values.points || !values.date}>{saving ? 'در حال ثبت…' : 'ثبت در سابقه'}</Button></DialogActions>
  </Dialog>;
}

function FinalizeDialog({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const { user } = useApp(); const [period, setPeriod] = useState(currentMonth); const [notes, setNotes] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await finalizePerformanceMonth({ employeeId, period, evaluatedBy: user.id, notes }, { events: performanceEventRepository, periods: performancePeriodRepository }); setError(''); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'نهایی‌سازی ارزیابی ناموفق بود.'); } finally { setSaving(false); } };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}><DialogTitle sx={{ fontWeight: 800 }}>نهایی‌سازی ارزیابی ماهانه</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{error && <Alert severity="error">{error}</Alert>}<Alert severity="info">امتیاز ماه فقط در سرور از امتیاز پایه و رویدادهای همان ماه محاسبه و به‌صورت سابقه ثابت ذخیره می‌شود.</Alert><JalaliDatePicker label="ماه ارزیابی" value={period} onChange={setPeriod} /><TextField multiline minRows={3} label="جمع‌بندی مدیر (اختیاری)" value={notes} onChange={(event) => setNotes(event.target.value)} /></Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>انصراف</Button><Button variant="contained" startIcon={<CheckCircleOutlined />} onClick={save} disabled={saving}>{saving ? 'در حال نهایی‌سازی…' : 'نهایی‌سازی ماه'}</Button></DialogActions></Dialog>;
}

function ReopenDialog({ open, onClose, periodId }: { open: boolean; onClose: () => void; periodId?: string }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setReason(''); setError(''); } }, [open]);
  const save = async () => { if (!periodId) return; setSaving(true); try { await reopenPerformanceMonth(periodId, reason, { events: performanceEventRepository, periods: performancePeriodRepository }); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'بازگشایی دوره ناموفق بود.'); } finally { setSaving(false); } };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}><DialogTitle sx={{ fontWeight: 800 }}>بازگشایی دوره نهایی‌شده</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{error && <Alert severity="error">{error}</Alert>}<Alert severity="warning">بازگشایی فقط برای اصلاح کنترل‌شده است و همراه با مدیر انجام‌دهنده و دلیل در گزارش حسابرسی ثبت می‌شود.</Alert><TextField required multiline minRows={3} label="دلیل بازگشایی" value={reason} onChange={(event) => setReason(event.target.value)} /></Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>انصراف</Button><Button variant="contained" color="warning" onClick={save} disabled={saving || !reason.trim()}>{saving ? 'در حال بازگشایی…' : 'بازگشایی دوره'}</Button></DialogActions></Dialog>;
}

export function PerformancePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState(() => performanceEventRepository.list());
  const [periods, setPeriods] = useState(() => performancePeriodRepository.list());
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  useEffect(() => performanceEventRepository.subscribe(setEvents), []);
  useEffect(() => performancePeriodRepository.subscribe(setPeriods), []);
  const rows = useMemo(() => employees.map((employee) => ({ employee, summary: scoreSummary(employee.id, events, periods), history: finalizedPeriods(employee.id, periods) })), [events, periods]);
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.summary.score, 0) / rows.length) : 0;
  const positive = events.filter((event) => monthKey(event.date) === monthKey(new Date()) && event.points > 0).length;
  const negative = events.filter((event) => monthKey(event.date) === monthKey(new Date()) && event.points < 0).length;
  return <Box>
    <PageHeader title="ارزیابی عملکرد" subtitle="امتیاز جاری، نتیجه ماهانه و سابقه کامل تغییرات در مقیاس ۰ تا ۱۰۰" crumbs={['تری‌لیز', 'منابع انسانی', 'ارزیابی عملکرد']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setAdjustmentOpen(true)}>ثبت تغییر امتیاز</Button>} />
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, mb: 2 }}><ScoreCard label="میانگین امتیاز جاری" score={average} helper={performanceMonthTitle(new Date())} /><Card><CardContent><Typography variant="caption" color="text.secondary">رویدادهای مثبت این ماه</Typography><Typography variant="h4" color="success.main" sx={{ fontWeight: 900, mt: .75 }}>{positive.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">تشویق، عملکرد ممتاز و اثرگذاری مثبت</Typography></CardContent></Card><Card><CardContent><Typography variant="caption" color="text.secondary">رویدادهای منفی این ماه</Typography><Typography variant="h4" color="error.main" sx={{ fontWeight: 900, mt: .75 }}>{negative.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">همه موارد دارای دلیل و ثبت‌کننده هستند</Typography></CardContent></Card><Card><CardContent><Typography variant="caption" color="text.secondary">ارزیابی‌های تاریخی</Typography><Typography variant="h4" sx={{ fontWeight: 900, mt: .75 }}>{periods.length.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">سوابق ماهانه نهایی‌شده و غیرقابل بازنویسی</Typography></CardContent></Card></Box>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.employee.id} onRowClick={(row) => navigate(`/hr/performance/${row.employee.id}`)} searchPlaceholder="جستجوی کارمند، واحد یا سمت..." filters={[{ key: 'department', label: 'واحد', options: [...new Set(employees.map((employee) => employee.department))].map((department) => ({ value: department, label: department })), value: (row) => row.employee.department }]} columns={[{ key: 'employee', label: 'کارمند', value: (row) => `${row.employee.fullName} ${row.employee.personnelCode}`, render: (row) => <Box><Typography sx={{ fontWeight: 800 }}>{row.employee.fullName}</Typography><Typography variant="caption" color="text.secondary">{row.employee.personnelCode} • {row.employee.jobTitle}</Typography></Box> }, { key: 'current', label: 'امتیاز جاری', value: (row) => row.summary.score, aggregate: 'average', render: (row) => <Stack spacing={.5} sx={{ minWidth: 130 }}><Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }}><Typography sx={{ fontWeight: 900 }}>{row.summary.score.toLocaleString('fa-IR')} / ۱۰۰</Typography><Chip size="small" color={scoreTone(row.summary.score)} label={row.summary.grade} /></Stack><LinearProgress color={scoreTone(row.summary.score)} variant="determinate" value={row.summary.score} /></Stack> }, { key: 'baseline', label: 'شروع ماه', value: (row) => row.summary.baseline, render: (row) => `${row.summary.baseline.toLocaleString('fa-IR')} / ۱۰۰` }, { key: 'change', label: 'تغییر این ماه', value: (row) => row.summary.delta, render: (row) => <Chip size="small" icon={row.summary.delta >= 0 ? <TrendingUp /> : <TrendingDown />} color={row.summary.delta > 0 ? 'success' : row.summary.delta < 0 ? 'error' : 'default'} label={`${row.summary.delta > 0 ? '+' : ''}${row.summary.delta.toLocaleString('fa-IR')}`} /> }, { key: 'events', label: 'رویدادهای این ماه', value: (row) => row.summary.eventCount, render: (row) => `${row.summary.positive.toLocaleString('fa-IR')} مثبت • ${row.summary.negative.toLocaleString('fa-IR')} منفی` }, { key: 'previous', label: 'ماه قبل', value: (row) => row.summary.previousScore ?? '', render: (row) => row.summary.previousScore === undefined ? 'بدون سابقه' : `${row.summary.previousScore.toLocaleString('fa-IR')} / ۱۰۰` }, { key: 'history', label: 'تاریخچه', value: (row) => row.history.length, render: (row) => `${row.history.length.toLocaleString('fa-IR')} ماه ثبت‌شده` }]} /></Card>
    <AdjustmentDialog open={adjustmentOpen} onClose={() => setAdjustmentOpen(false)} />
  </Box>;
}

export function PerformanceDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { user } = useApp();
  const [events, setEvents] = useState(() => performanceEventRepository.list()); const [periods, setPeriods] = useState(() => performancePeriodRepository.list());
  const [adjustmentOpen, setAdjustmentOpen] = useState(false); const [finalizeOpen, setFinalizeOpen] = useState(false); const [reopenOpen, setReopenOpen] = useState(false);
  useEffect(() => performanceEventRepository.subscribe(setEvents), []); useEffect(() => performancePeriodRepository.subscribe(setPeriods), []);
  const periodById = periods.find((period) => period.id === id); const employee = employees.find((item) => item.id === id || item.id === periodById?.employeeId);
  if (!employee) return <Box><PageHeader title="ارزیابی یافت نشد" crumbs={['تری‌لیز', 'منابع انسانی', 'ارزیابی عملکرد']} /><Alert severity="error">کارمند یا سابقه ارزیابی موردنظر پیدا نشد.</Alert></Box>;
  const summary = scoreSummary(employee.id, events, periods); const history = finalizedPeriods(employee.id, periods); const currentMonthKey = monthKey(new Date()); const currentPeriod = history.find((period) => monthKey(period.startedAt) === currentMonthKey); const previousHistory = history.filter((period) => monthKey(period.startedAt) !== currentMonthKey); const employeeEvents = events.filter((event) => event.employeeId === employee.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); const reopenTarget = periodById?.status === 'finalized' ? periodById : currentPeriod;
  return <Box>
    <PageHeader title={`عملکرد ${employee.fullName}`} subtitle={`${employee.personnelCode} • ${employee.jobTitle} • ${employee.department}`} crumbs={['تری‌لیز', 'منابع انسانی', 'ارزیابی عملکرد', employee.fullName]} actions={<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}><Button variant="outlined" onClick={() => navigate('/hr/performance')}>بازگشت</Button>{user.role === 'admin' && reopenTarget && <Button variant="outlined" color="warning" onClick={() => setReopenOpen(true)}>بازگشایی دوره</Button>}<Button variant="outlined" startIcon={<CheckCircleOutlined />} onClick={() => setFinalizeOpen(true)}>نهایی‌سازی ماه</Button><Button variant="contained" startIcon={<Add />} onClick={() => setAdjustmentOpen(true)}>ثبت تغییر امتیاز</Button></Stack>} />
    <Alert severity="info" sx={{ mb: 2 }}>امتیاز فعلی از امتیاز پایه و رویدادهای ثبت‌شده محاسبه می‌شود. نهایی‌سازی فقط نتیجه همان ماه را به‌عنوان سابقه ثابت ذخیره می‌کند؛ ماه‌های قبل و همه تغییرات قابل پیگیری باقی می‌مانند.</Alert>
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, mb: 2 }}><ScoreCard label="امتیاز فعلی" score={summary.score} helper={`درجه ${summary.grade}`} /><ScoreCard label="نتیجه این ماه" score={summary.score} helper={`پایه ${summary.baseline.toLocaleString('fa-IR')} • تغییر ${summary.delta > 0 ? '+' : ''}${summary.delta.toLocaleString('fa-IR')}`} /><Card><CardContent><Typography variant="caption" color="text.secondary">ماه‌های قبل</Typography><Typography variant="h4" sx={{ fontWeight: 900, mt: .75 }}>{previousHistory.length.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">سابقه ماهانه نهایی‌شده</Typography></CardContent></Card><Card><CardContent><Typography variant="caption" color="text.secondary">تغییرات امتیاز</Typography><Typography variant="h4" color={summary.delta >= 0 ? 'success.main' : 'error.main'} sx={{ fontWeight: 900, mt: .75 }}>{summary.delta > 0 ? '+' : ''}{summary.delta.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">{summary.eventCount.toLocaleString('fa-IR')} رویداد این ماه</Typography></CardContent></Card><Card><CardContent><Typography variant="caption" color="text.secondary">آخرین نتیجه ثبت‌شده</Typography><Typography variant="h4" sx={{ fontWeight: 900, mt: .75 }}>{summary.previousScore?.toLocaleString('fa-IR') ?? '—'}</Typography><Typography variant="caption" color="text.secondary">{previousHistory[0]?.title ?? 'هنوز سابقه‌ای ثبت نشده است'}</Typography></CardContent></Card></Box>
    {summary.eventCount === 0 && <Alert severity="warning" sx={{ mb: 2 }}>برای این ماه هنوز تغییر امتیازی ثبت نشده است. امتیاز فعلی فعلاً از آخرین نتیجه نهایی‌شده می‌آید.</Alert>}
    <Stack spacing={2}>
      <Card><CardContent><Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}><HistoryOutlined color="primary" /><Typography sx={{ fontWeight: 800 }}>نتیجه این ماه و ماه‌های قبل</Typography></Stack><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>نتیجه ماه جاری تا زمان نهایی‌سازی زنده است؛ سوابق قبلی snapshotهای نهایی‌شده و غیرقابل بازنویسی هستند.</Typography>{(() => {
        const monthlyRows: MonthlyScoreRow[] = [
          { id: `current-${employee.id}`, title: `${performanceMonthTitle(new Date())} (${currentPeriod ? 'نهایی‌شده' : 'جاری'})`, score: summary.score, baseline: summary.baseline, adjustment: summary.delta, grade: summary.grade, eventCount: summary.eventCount || currentPeriod?.eventIds?.length || eventsForMonth(employee.id, events, new Date()).length, evaluator: currentPeriod ? personName(currentPeriod.evaluatedBy) : undefined, notes: currentPeriod?.notes, current: true },
          ...previousHistory.map((period) => ({ id: period.id, title: period.title, score: period.score, baseline: period.baselineScore ?? period.score, adjustment: period.adjustmentTotal ?? 0, grade: period.grade, eventCount: period.eventIds?.length || eventsForMonth(employee.id, events, period.startedAt).length, evaluator: personName(period.evaluatedBy), notes: period.notes })),
        ];
        return <DataTable rows={monthlyRows} getRowId={(period) => period.id} columns={[{ key: 'period', label: 'دوره', value: (period) => period.title, render: (period) => <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }}><Typography sx={{ fontWeight: period.current ? 800 : 500 }}>{period.title}</Typography>{period.current && <Chip size="small" color={currentPeriod ? 'success' : 'primary'} label={currentPeriod ? 'نهایی‌شده' : 'زنده'} />}</Stack> }, { key: 'baseline', label: 'امتیاز پایه', value: (period) => period.baseline, render: (period) => `${period.baseline.toLocaleString('fa-IR')} / ۱۰۰` }, { key: 'adjustment', label: 'تغییرات', value: (period) => period.adjustment, render: (period) => <Chip size="small" color={period.adjustment > 0 ? 'success' : period.adjustment < 0 ? 'error' : 'default'} label={`${period.adjustment > 0 ? '+' : ''}${period.adjustment.toLocaleString('fa-IR')}`} /> }, { key: 'score', label: 'نتیجه ماه', value: (period) => period.score, render: (period) => <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }}><Typography sx={{ fontWeight: 800 }}>{period.score.toLocaleString('fa-IR')} / ۱۰۰</Typography><Chip size="small" color={scoreTone(period.score)} label={period.grade} /></Stack> }, { key: 'events', label: 'تغییرات ثبت‌شده', value: (period) => period.eventCount, render: (period) => period.current ? `${summary.positive.toLocaleString('fa-IR')} مثبت • ${summary.negative.toLocaleString('fa-IR')} منفی` : period.eventCount.toLocaleString('fa-IR') }, { key: 'evaluator', label: 'ارزیاب / جمع‌بندی', value: (period) => `${period.evaluator ?? ''} ${period.notes ?? ''}`, render: (period) => <Box><Typography variant="body2">{period.evaluator ?? 'در حال جمع‌آوری'}</Typography>{period.notes && <Typography variant="caption" color="text.secondary">{period.notes}</Typography>}</Box> }]} />;
      })()}</CardContent></Card>
      <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>تغییرات امتیاز و دلایل</Typography><Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>دلیل هر تغییر با متن آزاد توسط ثبت‌کننده وارد می‌شود و همراه با امتیاز، تاریخ، توضیح، پروژه و ثبت‌کننده در سابقه نگهداری می‌شود.</Typography><DataTable rows={employeeEvents} getRowId={(event) => event.id} searchPlaceholder="جستجوی دلیل، توضیحات یا پروژه..." filters={[{ key: 'direction', label: 'نوع تغییر', options: [{ value: 'positive', label: 'افزایشی' }, { value: 'negative', label: 'کاهشی' }], value: (event) => event.points >= 0 ? 'positive' : 'negative' }]} columns={[{ key: 'date', label: 'تاریخ رویداد', value: (event) => event.date, render: (event) => formatDate(event.date) }, { key: 'createdAt', label: 'ثبت در سامانه', value: (event) => event.createdAt ?? event.date, render: (event) => formatDate(event.createdAt ?? event.date) }, { key: 'points', label: 'تغییر', value: (event) => event.points, render: (event) => <Chip size="small" color={event.points > 0 ? 'success' : 'error'} label={`${event.points > 0 ? '+' : ''}${event.points.toLocaleString('fa-IR')}`} /> }, { key: 'reason', label: 'دلیل', value: eventReason, render: (event) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{eventReason(event)}</Typography> }, { key: 'category', label: 'دسته‌بندی', value: (event) => event.category ?? 'عمومی' }, { key: 'description', label: 'شرح / یادداشت', value: (event) => event.description }, { key: 'project', label: 'پروژه', value: (event) => projectName(event.projectId) }, { key: 'task', label: 'وظیفه', value: (event) => tasks.find((task) => task.id === event.taskId)?.title ?? '—' }, { key: 'createdBy', label: 'ثبت‌کننده', value: (event) => personName(event.createdBy) }]} /></Card>
    </Stack>
    <AdjustmentDialog open={adjustmentOpen} onClose={() => setAdjustmentOpen(false)} employeeId={employee.id} /><FinalizeDialog open={finalizeOpen} onClose={() => setFinalizeOpen(false)} employeeId={employee.id} /><ReopenDialog open={reopenOpen} onClose={() => setReopenOpen(false)} periodId={reopenTarget?.id} />
  </Box>;
}
