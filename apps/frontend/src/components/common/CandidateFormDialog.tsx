import { Add, AttachFile, DeleteOutlined, UploadFile } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { employees } from '../../services/repositories.ts';
import type { Candidate, CandidateMeeting, CandidateSource, CandidateStage, CandidateStatus } from '../../types/index.ts';
import { candidateLossReasonLabels, candidateMeetingResultLabels, candidateNeedsLossReason, candidateSourceLabels, candidateStageLabels, candidateStatusLabels, validateCandidate } from '../../utils/recruitment.ts';
import JalaliDatePicker from './JalaliDatePicker.tsx';

export type CandidateInput = Omit<Candidate, 'id' | 'appliedAt' | 'updatedAt'>;
type Props = { jobId: string; candidate?: Candidate; onClose: () => void; onSave: (input: CandidateInput, resumeFile?: File) => Promise<void> | void };

const defaultValues = (jobId: string, candidate?: Candidate): CandidateInput => ({
  jobId,
  ownerId: candidate?.ownerId ?? employees[0]?.id ?? '',
  fullName: candidate?.fullName ?? '',
  phone: candidate?.phone ?? '',
  email: candidate?.email ?? '',
  resume: candidate?.resume,
  grade: candidate?.grade ?? 50,
  description: candidate?.description ?? '',
  stage: candidate?.stage ?? 'resume_sent',
  status: candidate?.status ?? 'open',
  source: candidate?.source ?? 'jobinja',
  otherSource: candidate?.otherSource,
  lossReason: candidate?.lossReason,
  meetings: candidate?.meetings ?? [],
});

export default function CandidateFormDialog({ jobId, candidate, onClose, onSave }: Props) {
  const [values, setValues] = useState<CandidateInput>(() => defaultValues(jobId, candidate));
  const [resumeFile, setResumeFile] = useState<File>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CandidateInput>(key: K, value: CandidateInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const addMeeting = () => set('meetings', [...values.meetings, { id: `meeting-${Date.now()}`, date: new Date().toISOString().slice(0, 10), result: 'pending_decision' }]);
  const updateMeeting = (id: string, patch: Partial<CandidateMeeting>) => set('meetings', values.meetings.map((meeting) => meeting.id === id ? { ...meeting, ...patch } : meeting));
  const submit = async () => {
    const normalized: CandidateInput = {
      ...values,
      fullName: values.fullName.trim(), phone: values.phone.trim(), email: values.email.trim(), description: values.description.trim(),
      otherSource: values.source === 'other' ? values.otherSource?.trim() || undefined : undefined,
      lossReason: candidateNeedsLossReason(values.status) ? values.lossReason : undefined,
    };
    const errors = validateCandidate(normalized);
    if (errors.length) { setError(`فیلدهای زیر را بررسی کنید: ${errors.join('، ')}`); return; }
    setSaving(true);
    try { await onSave(normalized, resumeFile); } finally { setSaving(false); }
  };

  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl', maxHeight: 'calc(100vh - 24px)' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{candidate ? 'ویرایش متقاضی' : 'افزودن متقاضی'}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography sx={{ fontWeight: 800 }}>اطلاعات پایه</Typography>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <FormControl required><InputLabel>مسئول پیگیری</InputLabel><Select label="مسئول پیگیری" value={values.ownerId} onChange={(event) => set('ownerId', event.target.value)}>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName} — {employee.jobTitle}</MenuItem>)}</Select></FormControl>
        <TextField required label="نام و نام خانوادگی" value={values.fullName} onChange={(event) => set('fullName', event.target.value)} />
        <TextField required label="شماره تماس متقاضی" value={values.phone} onChange={(event) => set('phone', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
        <TextField required type="email" label="ایمیل متقاضی" value={values.email} onChange={(event) => set('email', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
        <TextField required type="number" label="گرید / امتیاز از ۱۰۰" value={values.grade} onChange={(event) => set('grade', Number(event.target.value))} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
        <FormControl required><InputLabel>مرحله</InputLabel><Select label="مرحله" value={values.stage} onChange={(event) => set('stage', event.target.value as CandidateStage)}>{Object.entries(candidateStageLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        <FormControl required><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={values.status} onChange={(event) => set('status', event.target.value as CandidateStatus)}>{Object.entries(candidateStatusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        <FormControl required><InputLabel>منبع</InputLabel><Select label="منبع" value={values.source} onChange={(event) => set('source', event.target.value as CandidateSource)}>{Object.entries(candidateSourceLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        {values.source === 'other' && <TextField label="منبع دیگر (اختیاری)" value={values.otherSource ?? ''} onChange={(event) => set('otherSource', event.target.value)} />}
        {candidateNeedsLossReason(values.status) && <FormControl><InputLabel>دلیل از دست رفتن (اختیاری)</InputLabel><Select label="دلیل از دست رفتن (اختیاری)" value={values.lossReason ?? ''} onChange={(event) => set('lossReason', event.target.value ? event.target.value as CandidateInput['lossReason'] : undefined)}><MenuItem value="">ثبت نشده</MenuItem>{Object.entries(candidateLossReasonLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>}
      </Box>
      <TextField multiline minRows={3} label="توضیحات" value={values.description} onChange={(event) => set('description', event.target.value)} />

      <Box sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}><Button component="label" variant="outlined" startIcon={<UploadFile />}>انتخاب رزومه<input hidden type="file" accept=".pdf,.doc,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) setResumeFile(file); }} /></Button><Typography variant="caption" color="text.secondary">PDF یا Word</Typography>{(resumeFile || values.resume) && <Chip icon={<AttachFile />} label={resumeFile?.name ?? values.resume?.name} onDelete={() => { setResumeFile(undefined); set('resume', undefined); }} />}</Stack></Box>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontWeight: 800 }}>جلسات</Typography><Button size="small" startIcon={<Add />} onClick={addMeeting}>افزودن جلسه</Button></Stack>
      {values.meetings.length === 0 && <Alert severity="info">هنوز جلسه‌ای برای این متقاضی ثبت نشده است.</Alert>}
      {values.meetings.map((meeting, index) => <Box key={meeting.id} sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr auto' }, alignItems: 'start', p: 1.25, bgcolor: 'action.hover', borderRadius: 2 }}><JalaliDatePicker required label={`تاریخ جلسه ${index + 1}`} value={meeting.date} onChange={(date) => updateMeeting(meeting.id, { date })} /><FormControl required><InputLabel>نتیجه جلسه</InputLabel><Select label="نتیجه جلسه" value={meeting.result} onChange={(event) => updateMeeting(meeting.id, { result: event.target.value as CandidateMeeting['result'] })}>{Object.entries(candidateMeetingResultLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><IconButton color="error" aria-label="حذف جلسه" onClick={() => set('meetings', values.meetings.filter((item) => item.id !== meeting.id))}><DeleteOutlined /></IconButton></Box>)}
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button disabled={saving} onClick={onClose}>انصراف</Button><Button disabled={saving} variant="contained" onClick={submit}>{saving ? 'در حال ذخیره...' : candidate ? 'ذخیره تغییرات' : 'ثبت متقاضی'}</Button></DialogActions>
  </Dialog>;
}
