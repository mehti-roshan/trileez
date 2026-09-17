import { Add, AttachFile, Download, Edit, Visibility } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CandidateFormDialog, { type CandidateInput } from '../components/common/CandidateFormDialog.tsx';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { useApp } from '../context/AppContext.tsx';
import { employees } from '../mock/data.ts';
import { listFiles, registerFile } from '../services/fileService.ts';
import { candidateRepository, jobOpeningRepository } from '../services/repositories.ts';
import type { Attachment, Candidate, CandidateStage, CandidateStatus } from '../types/index.ts';
import { candidateLossReasonLabels, candidateMeetingResultLabels, candidateSourceLabels, candidateStageColor, candidateStageLabels, candidateStatusColor, candidateStatusLabels, candidateWorkflowAfterStageChange, candidateWorkflowAfterStatusChange, normalizeCandidateWorkflow } from '../utils/recruitment.ts';
import { formatDate, formatDateTime } from '../utils/format.ts';

const employeeName = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? '—';
const readFile = (file: File) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? '')); reader.onerror = () => resolve(''); reader.readAsDataURL(file); });
const isPdfResume = (resume: Attachment) => resume.type.toLowerCase().includes('pdf') || resume.name.toLowerCase().endsWith('.pdf');
const workflowColor = (color: ReturnType<typeof candidateStageColor> | ReturnType<typeof candidateStatusColor>) => color === 'default' ? 'text.disabled' : `${color}.main`;
const workflowSelectSx = {
  bgcolor: 'background.paper',
  borderRadius: 1.5,
  '& .MuiSelect-select': { py: .75, pr: '12px !important', pl: '38px !important' },
  '& .MuiSelect-icon': { right: 'auto', left: 8 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.light' },
};
const resolveResume = (resume: Attachment, candidateId: string): Attachment => {
  const storedFile = listFiles().find((file) => file.id === resume.id || (file.context?.kind === 'file' && file.context.id === candidateId && (file.originalName === resume.name || file.name === resume.name)));
  if (!storedFile) return resume;
  return { ...resume, ...storedFile, type: storedFile.mimeType || storedFile.type || resume.type, url: storedFile.url || resume.url };
};

export default function RecruitmentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const [job, setJob] = useState(() => jobOpeningRepository.get(id));
  const [candidates, setCandidates] = useState(() => candidateRepository.list().filter((candidate) => candidate.jobId === id));
  const [selected, setSelected] = useState<Candidate>();
  const [formCandidate, setFormCandidate] = useState<Candidate | 'new'>();
  const [resumePreview, setResumePreview] = useState<Attachment>();
  useEffect(() => jobOpeningRepository.subscribe((items) => setJob(items.find((item) => item.id === id))), [id]);
  useEffect(() => candidateRepository.subscribe((items) => setCandidates(items.filter((candidate) => candidate.jobId === id))), [id]);

  if (!job) return <Box><PageHeader title="موقعیت استخدامی یافت نشد" subtitle="شناسه موقعیت معتبر نیست." crumbs={['تری‌لیز', 'منابع انسانی', 'استخدام']} /><Button onClick={() => navigate('/hr/recruitment')}>بازگشت به استخدام</Button></Box>;

  const saveCandidate = async (input: CandidateInput, resumeFile?: File) => {
    const now = new Date().toISOString();
    const existing = formCandidate === 'new' ? undefined : formCandidate;
    const candidateId = existing?.id ?? `candidate-${Date.now()}`;
    let resume: Attachment | undefined = input.resume;
    if (resumeFile) {
      const fileId = `candidate-resume-${candidateId}-${Date.now()}`;
      const url = await readFile(resumeFile);
      resume = { id: fileId, name: resumeFile.name, type: resumeFile.type || 'application/octet-stream', size: `${Math.max(1, Math.round(resumeFile.size / 1024)).toLocaleString('fa-IR')} کیلوبایت`, url, uploadedBy: user.id, uploadedAt: now, source: 'استخدام', sourceId: candidateId };
      registerFile({ ...resume, originalName: resumeFile.name, mimeType: resume.type, uploadedBy: user.id, visibility: 'workspace', access: ['view', 'edit', 'delete'], context: { kind: 'file', id: candidateId } });
    }
    const workflow = normalizeCandidateWorkflow(input.stage, input.status);
    const saved = existing
      ? candidateRepository.update(existing.id, { ...input, ...workflow, resume, updatedAt: now })!
      : candidateRepository.create({ ...input, ...workflow, id: candidateId, resume, appliedAt: now.slice(0, 10), updatedAt: now });
    const applicantCount = candidateRepository.list().filter((candidate) => candidate.jobId === job.id).length;
    jobOpeningRepository.update(job.id, { applicants: applicantCount });
    setFormCandidate(undefined);
    setSelected(saved);
  };

  const selectedCount = candidates.filter((candidate) => candidate.status === 'selected').length;
  const activeCount = candidates.filter((candidate) => ['open', 'pending'].includes(candidate.status)).length;
  const averageGrade = candidates.length ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.grade, 0) / candidates.length) : 0;
  const updateStage = (candidate: Candidate, stage: CandidateStage) => candidateRepository.update(candidate.id, { ...candidateWorkflowAfterStageChange(stage, candidate.status), updatedAt: new Date().toISOString() });
  const updateStatus = (candidate: Candidate, status: CandidateStatus) => candidateRepository.update(candidate.id, { ...candidateWorkflowAfterStatusChange(status, candidate.stage), updatedAt: new Date().toISOString() });
  const downloadResume = (resume: Attachment) => {
    if (!resume.url) return;
    const link = document.createElement('a');
    link.href = resume.url;
    link.download = resume.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  return <Box>
    <PageHeader title={job.title} subtitle={`${job.department} • ${job.openings.toLocaleString('fa-IR')} ظرفیت`} crumbs={['تری‌لیز', 'منابع انسانی', 'استخدام', job.title]} actions={<Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => navigate('/hr/recruitment')}>بازگشت</Button><Button variant="contained" startIcon={<Add />} onClick={() => setFormCandidate('new')}>افزودن متقاضی</Button></Stack>} />
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}>
      {[['کل متقاضیان', candidates.length], ['در حال پیگیری', activeCount], ['منتخب‌شده', selectedCount], ['میانگین گرید', `${averageGrade} / ۱۰۰`]].map(([label, value]) => <Card key={String(label)}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: .5, fontWeight: 800 }}>{typeof value === 'number' ? value.toLocaleString('fa-IR') : value}</Typography></CardContent></Card>)}
    </Box>
    <Card sx={{ p: 1 }}><DataTable rows={candidates} getRowId={(candidate) => candidate.id} onRowClick={setSelected} csvFilename={`candidates-${job.id}.csv`} emptyTitle="متقاضی‌ای برای این موقعیت ثبت نشده است" emptyDescription="برای شروع فرایند جذب، نخستین متقاضی را اضافه کنید." filters={[
      { key: 'stage', label: 'مرحله', options: Object.entries(candidateStageLabels).map(([value, label]) => ({ value, label })), value: (candidate) => candidate.stage },
      { key: 'status', label: 'وضعیت', options: Object.entries(candidateStatusLabels).map(([value, label]) => ({ value, label })), value: (candidate) => candidate.status },
      { key: 'source', label: 'منبع', options: Object.entries(candidateSourceLabels).map(([value, label]) => ({ value, label })), value: (candidate) => candidate.source },
    ]} columns={[
      { key: 'name', label: 'نام و نام خانوادگی', value: (candidate) => candidate.fullName, render: (candidate) => <Box><Typography sx={{ fontWeight: 700 }}>{candidate.fullName}</Typography><Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block', textAlign: 'right' }}>{candidate.email}</Typography></Box> },
      { key: 'phone', label: 'شماره تماس', value: (candidate) => candidate.phone },
      { key: 'owner', label: 'مسئول پیگیری', value: (candidate) => employeeName(candidate.ownerId), groupable: true },
      { key: 'stage', label: 'مرحله', value: (candidate) => candidateStageLabels[candidate.stage], render: (candidate) => <Select size="small" value={candidate.stage} renderValue={(value) => <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}><Box sx={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: '50%', bgcolor: workflowColor(candidateStageColor(value as CandidateStage)) }} /><Typography variant="body2" noWrap>{candidateStageLabels[value as CandidateStage]}</Typography></Stack>} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStage(candidate, event.target.value as CandidateStage)} sx={{ ...workflowSelectSx, minWidth: 190 }}>{Object.entries(candidateStageLabels).map(([value, label]) => <MenuItem key={value} value={value} sx={{ gap: 1 }}><Box sx={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: '50%', bgcolor: workflowColor(candidateStageColor(value as CandidateStage)) }} />{label}</MenuItem>)}</Select> },
      { key: 'status', label: 'وضعیت', value: (candidate) => candidateStatusLabels[candidate.status], render: (candidate) => <Select size="small" value={candidate.status} renderValue={(value) => <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}><Box sx={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: '50%', bgcolor: workflowColor(candidateStatusColor(value as CandidateStatus)) }} /><Typography variant="body2" noWrap>{candidateStatusLabels[value as CandidateStatus]}</Typography></Stack>} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStatus(candidate, event.target.value as CandidateStatus)} sx={{ ...workflowSelectSx, minWidth: 145 }}>{Object.entries(candidateStatusLabels).map(([value, label]) => <MenuItem key={value} value={value} sx={{ gap: 1 }}><Box sx={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: '50%', bgcolor: workflowColor(candidateStatusColor(value as CandidateStatus)) }} />{label}</MenuItem>)}</Select> },
      { key: 'source', label: 'منبع', value: (candidate) => candidate.source === 'other' ? candidate.otherSource || candidateSourceLabels.other : candidateSourceLabels[candidate.source] },
      { key: 'grade', label: 'گرید', value: (candidate) => candidate.grade, aggregate: 'average', render: (candidate) => <Box sx={{ minWidth: 100 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{candidate.grade.toLocaleString('fa-IR')} / ۱۰۰</Typography><LinearProgress variant="determinate" value={candidate.grade} sx={{ mt: .5, height: 5, borderRadius: 4 }} /></Box> },
      { key: 'meetings', label: 'جلسات', value: (candidate) => candidate.meetings.length, render: (candidate) => candidate.meetings.length.toLocaleString('fa-IR') },
      { key: 'resume', label: 'رزومه', value: (candidate) => candidate.resume?.name ?? '', render: (candidate) => candidate.resume ? <Stack direction="row" spacing={.5} sx={{ alignItems: 'center' }} onClick={(event) => event.stopPropagation()}><Chip size="small" variant="outlined" icon={<AttachFile />} label={candidate.resume.name} /><Button size="small" variant="text" startIcon={<Visibility />} onClick={() => setResumePreview(resolveResume(candidate.resume!, candidate.id))}>مشاهده</Button></Stack> : 'ثبت نشده' },
    ]} /></Card>

    <Dialog open={Boolean(selected)} onClose={() => setSelected(undefined)} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl' } } }}><DialogTitle sx={{ fontWeight: 800 }}>{selected?.fullName}</DialogTitle><DialogContent dividers>{selected && <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip color={candidateStageColor(selected.stage)} label={candidateStageLabels[selected.stage]} /><Chip color={candidateStatusColor(selected.status)} label={candidateStatusLabels[selected.status]} /><Chip label={`گرید ${selected.grade.toLocaleString('fa-IR')} / ۱۰۰`} /></Stack>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}><Info label="مسئول پیگیری" value={employeeName(selected.ownerId)} /><Info label="شماره تماس" value={selected.phone} /><Info label="ایمیل" value={selected.email} /><Info label="منبع" value={selected.source === 'other' ? selected.otherSource || 'سایر' : candidateSourceLabels[selected.source]} />{selected.lossReason && <Info label="دلیل از دست رفتن" value={candidateLossReasonLabels[selected.lossReason]} />}<Info label="تاریخ ثبت" value={formatDate(selected.appliedAt)} /></Box>
      <Divider /><Info label="توضیحات" value={selected.description || 'توضیحی ثبت نشده است.'} />
      <Box><Typography variant="caption" color="text.secondary">رزومه</Typography>{selected.resume ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: .5, alignItems: { xs: 'stretch', sm: 'center' } }}><Chip variant="outlined" icon={<AttachFile />} label={selected.resume.name} sx={{ maxWidth: '100%' }} /><Button size="small" variant="outlined" startIcon={<Visibility />} onClick={() => { setResumePreview(resolveResume(selected.resume!, selected.id)); setSelected(undefined); }}>مشاهده رزومه</Button><Button size="small" startIcon={<Download />} onClick={() => downloadResume(resolveResume(selected.resume!, selected.id))}>دریافت فایل</Button></Stack> : <Typography variant="body2" sx={{ mt: .25, fontWeight: 600 }}>ثبت نشده</Typography>}</Box>
      <Divider /><Typography sx={{ fontWeight: 800 }}>جلسات</Typography>{selected.meetings.length ? selected.meetings.map((meeting) => <Stack key={meeting.id} direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: .5, p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}><Typography>{formatDate(meeting.date)}</Typography><Chip size="small" label={candidateMeetingResultLabels[meeting.result]} /></Stack>) : <Alert severity="info">جلسه‌ای ثبت نشده است.</Alert>}
      <Typography variant="caption" color="text.secondary">آخرین تغییر: {formatDateTime(selected.updatedAt)}</Typography>
    </Stack>}</DialogContent><DialogActions><Button startIcon={<Edit />} onClick={() => { if (selected) setFormCandidate(selected); setSelected(undefined); }}>ویرایش</Button><Button onClick={() => setSelected(undefined)}>بستن</Button></DialogActions></Dialog>
    <Dialog open={Boolean(resumePreview)} onClose={() => setResumePreview(undefined)} fullWidth maxWidth="lg" slotProps={{ paper: { sx: { direction: 'rtl', height: { xs: '90vh', md: '86vh' } } } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800 }}><AttachFile color="primary" />پیش‌نمایش رزومه{resumePreview ? ` — ${resumePreview.name}` : ''}</DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 0 }}>
        {resumePreview?.url && isPdfResume(resumePreview) ? <Box component="iframe" title={`پیش‌نمایش ${resumePreview.name}`} src={resumePreview.url} sx={{ display: 'block', width: '100%', height: '100%', minHeight: { xs: '68vh', md: '70vh' }, border: 0, bgcolor: 'grey.100' }} /> : <Box sx={{ p: 3 }}><Alert severity={resumePreview?.url ? 'info' : 'warning'}>{resumePreview?.url ? 'پیش‌نمایش مستقیم برای این نوع فایل در دسترس نیست؛ فایل را دریافت و در برنامه مناسب باز کنید.' : 'محتوای فایل برای این رزومه ذخیره نشده و امکان پیش‌نمایش آن وجود ندارد.'}</Alert></Box>}
      </DialogContent>
      <DialogActions>{resumePreview?.url && <Button startIcon={<Download />} onClick={() => downloadResume(resumePreview)}>دریافت فایل</Button>}<Button variant="contained" onClick={() => setResumePreview(undefined)}>بستن</Button></DialogActions>
    </Dialog>
    {formCandidate && <CandidateFormDialog key={formCandidate === 'new' ? 'new-candidate' : formCandidate.id} jobId={job.id} candidate={formCandidate === 'new' ? undefined : formCandidate} onClose={() => setFormCandidate(undefined)} onSave={saveCandidate} />}
  </Box>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: .25, fontWeight: 600 }}>{value}</Typography></Box>;
}
