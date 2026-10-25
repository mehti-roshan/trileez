import { Add } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import JalaliDatePicker from '../components/common/JalaliDatePicker.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { candidateRepository, jobOpeningRepository } from '../services/repositories.ts';
import type { JobOpening } from '../types/index.ts';
import { formatDate } from '../utils/format.ts';
import { validateJobOpening } from '../utils/recruitment.ts';

const jobStatusLabels = { open: 'باز', paused: 'متوقف', filled: 'تکمیل شده', closed: 'بسته' } as const;
const jobStatusColor = (status: keyof typeof jobStatusLabels): 'default' | 'success' | 'warning' => status === 'open' ? 'success' : status === 'paused' ? 'warning' : 'default';

export default function RecruitmentPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(() => jobOpeningRepository.list());
  const [candidates, setCandidates] = useState(() => candidateRepository.list());
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => jobOpeningRepository.subscribe(setJobs), []);
  useEffect(() => candidateRepository.subscribe(setCandidates), []);
  const activeCandidates = candidates.filter((candidate) => ['open', 'pending'].includes(candidate.status)).length;
  const selectedCandidates = candidates.filter((candidate) => candidate.status === 'selected').length;
  const meetings = candidates.reduce((sum, candidate) => sum + candidate.meetings.length, 0);
  return <Box>
    <PageHeader title="استخدام" subtitle="موقعیت‌های استخدامی و فرایند پیگیری متقاضیان" crumbs={['تری‌لیز', 'منابع انسانی', 'استخدام']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>ایجاد موقعیت استخدامی</Button>} />
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}>
      {[['موقعیت‌های باز', jobs.filter((job) => job.status === 'open').length], ['متقاضیان در حال پیگیری', activeCandidates], ['منتخب‌شده‌ها', selectedCandidates], ['جلسات ثبت‌شده', meetings]].map(([label, value]) => <Card key={String(label)}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: .5, fontWeight: 800 }}>{Number(value).toLocaleString('fa-IR')}</Typography></CardContent></Card>)}
    </Box>
    <Card sx={{ p: 1 }}><DataTable rows={jobs} getRowId={(job) => job.id} onRowClick={(job) => navigate(`/hr/recruitment/${job.id}`)} csvFilename="job-openings.csv" emptyTitle="موقعیت استخدامی ثبت نشده است" emptyDescription="موقعیت‌های استخدامی سازمان در این بخش نمایش داده می‌شوند." filters={[{ key: 'status', label: 'وضعیت', options: Object.entries(jobStatusLabels).map(([value, label]) => ({ value, label })), value: (job) => job.status }]} columns={[
      { key: 'title', label: 'عنوان موقعیت', value: (job) => job.title, render: (job) => <Box><Typography sx={{ fontWeight: 800 }}>{job.title}</Typography><Typography variant="caption" color="text.secondary">برای مشاهده متقاضیان کلیک کنید</Typography></Box> },
      { key: 'department', label: 'واحد', value: (job) => job.department, groupable: true },
      { key: 'type', label: 'نوع همکاری', value: (job) => ({ full_time: 'تمام‌وقت', part_time: 'پاره‌وقت', project: 'پروژه‌ای', intern: 'کارآموز' })[job.employmentType] },
      { key: 'capacity', label: 'ظرفیت', value: (job) => job.openings, aggregate: 'sum' },
      { key: 'applicants', label: 'متقاضیان', value: (job) => candidates.filter((candidate) => candidate.jobId === job.id).length, render: (job) => <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }}><Typography>{candidates.filter((candidate) => candidate.jobId === job.id).length.toLocaleString('fa-IR')}</Typography><Typography variant="caption" color="text.secondary">نفر</Typography></Stack> },
      { key: 'selected', label: 'منتخب', value: (job) => candidates.filter((candidate) => candidate.jobId === job.id && candidate.status === 'selected').length, render: (job) => `${candidates.filter((candidate) => candidate.jobId === job.id && candidate.status === 'selected').length.toLocaleString('fa-IR')} نفر` },
      { key: 'status', label: 'وضعیت', value: (job) => jobStatusLabels[job.status], render: (job) => <Chip size="small" color={jobStatusColor(job.status)} label={jobStatusLabels[job.status]} /> },
      { key: 'posted', label: 'تاریخ انتشار', value: (job) => job.postedAt, render: (job) => formatDate(job.postedAt) },
    ]} /></Card>
    {createOpen && <RecruitmentForm onClose={() => setCreateOpen(false)} onCreated={(job) => { setCreateOpen(false); navigate(`/hr/recruitment/${job.id}`); }} />}
  </Box>;
}

type JobInput = Omit<JobOpening, 'id' | 'applicants'>;
function RecruitmentForm({ onClose, onCreated }: { onClose: () => void; onCreated: (job: JobOpening) => void }) {
  const [values, setValues] = useState<JobInput>({ title: '', department: '', employmentType: 'full_time', openings: 1, status: 'open', postedAt: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');
  const set = <K extends keyof JobInput>(key: K, value: JobInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const input = { ...values, title: values.title.trim(), department: values.department.trim() };
    const errors = validateJobOpening(input);
    if (errors.length) { setError(`فیلدهای زیر را بررسی کنید: ${errors.join('، ')}`); return; }
    onCreated(await jobOpeningRepository.create({ ...input, applicants: 0 }));
  };
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>ایجاد موقعیت استخدامی</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField required autoFocus label="عنوان موقعیت" value={values.title} onChange={(event) => set('title', event.target.value)} />
      <TextField required label="واحد سازمانی" value={values.department} onChange={(event) => set('department', event.target.value)} />
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <FormControl required><InputLabel>نوع همکاری</InputLabel><Select label="نوع همکاری" value={values.employmentType} onChange={(event) => set('employmentType', event.target.value as JobInput['employmentType'])}><MenuItem value="full_time">تمام‌وقت</MenuItem><MenuItem value="part_time">پاره‌وقت</MenuItem><MenuItem value="project">پروژه‌ای</MenuItem><MenuItem value="intern">کارآموز</MenuItem></Select></FormControl>
        <TextField required type="number" label="ظرفیت" value={values.openings} onChange={(event) => set('openings', Number(event.target.value))} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
        <FormControl required><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={values.status} onChange={(event) => set('status', event.target.value as JobInput['status'])}>{Object.entries(jobStatusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        <JalaliDatePicker required label="تاریخ انتشار" value={values.postedAt} onChange={(value) => set('postedAt', value)} />
      </Box>
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose}>انصراف</Button><Button variant="contained" onClick={submit}>ایجاد موقعیت</Button></DialogActions>
  </Dialog>;
}
