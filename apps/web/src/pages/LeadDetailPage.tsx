// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ArrowBack, Add, Call, Email, Event, History, NoteAlt, UploadFile, Send, CheckCircle } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import JalaliDatePicker from '../components/common/JalaliDatePicker.tsx';
import { customerRepository, leadActivityRepository, leadContractVersionRepository, leadProposalVersionRepository, leadRepository, projectRepository } from '../services/repositories.ts';
import { customers, projects, users } from '../services/repositories.ts';
import { formatCurrency, formatDateTime } from '../utils/format.ts';
import type { LeadActivityType, LeadCommercialStatus, LeadContractVersion, LeadProposalVersion } from '../types/index.ts';
import type { LeadStage, LeadStatus } from '../types/index.ts';
import { useApp } from '../context/AppContext.tsx';
import { provisionProjectExecution } from '../services/projectProvisioning.ts';
import { uploadStoredFile } from '../services/fileService.ts';

const activityTypes: { value: LeadActivityType; label: string; icon: ReactNode }[] = [
  { value: 'call', label: 'تماس', icon: <Call fontSize="small" /> },
  { value: 'meeting', label: 'جلسه', icon: <Event fontSize="small" /> },
  { value: 'email', label: 'ایمیل', icon: <Email fontSize="small" /> },
  { value: 'note', label: 'یادداشت', icon: <NoteAlt fontSize="small" /> },
  { value: 'follow_up', label: 'پیگیری', icon: <History fontSize="small" /> },
];
const stageOptions = [{ value: 'new', label: 'جدید' }, { value: 'contact_attempt', label: 'تلاش برای تماس' }, { value: 'contacted', label: 'تماس برقرار شد' }, { value: 'initial_review', label: 'بررسی اولیه' }, { value: 'qualified', label: 'واجد شرایط' }];
const statusOptions = [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'converted', label: 'تبدیل‌شده' }, { value: 'rejected', label: 'ردشده' }];
const commercialStatusLabel: Record<LeadCommercialStatus, string> = { draft: 'پیش‌نویس', sent: 'ارسال‌شده', feedback: 'در حال بازخورد', finalized: 'نهایی‌شده' };
const channels = ['ایمیل', 'واتساپ', 'تلگرام', 'تماس تلفنی', 'جلسه'];

export default function LeadDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const [lead, setLead] = useState(() => leadRepository.get(id));
  const [activities, setActivities] = useState(() => leadActivityRepository.list().filter((item) => item.leadId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ type: LeadActivityType; title: string; description: string; occurredAt: string }>({ type: 'call', title: '', description: '', occurredAt: new Date().toISOString() });
  const [error, setError] = useState('');
  const [proposalVersions, setProposalVersions] = useState(() => leadProposalVersionRepository.list().filter((item) => item.leadId === id).sort((a, b) => b.version - a.version));
  const [contractVersions, setContractVersions] = useState(() => leadContractVersionRepository.list().filter((item) => item.leadId === id).sort((a, b) => b.version - a.version));
  const [commercialType, setCommercialType] = useState<'proposal' | 'contract'>('proposal');
  const [commercialOpen, setCommercialOpen] = useState(false);
  const [commercialForm, setCommercialForm] = useState({ title: '', amount: '', feedback: '', sentVia: 'ایمیل', fileName: '', fileType: '' });
  const [commercialFile, setCommercialFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => leadRepository.subscribe((items) => setLead(items.find((item) => item.id === id))), [id]);
  useEffect(() => leadActivityRepository.subscribe((items) => setActivities(items.filter((item) => item.leadId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)))), [id]);
  useEffect(() => leadProposalVersionRepository.subscribe((items) => setProposalVersions(items.filter((item) => item.leadId === id).sort((a, b) => b.version - a.version))), [id]);
  useEffect(() => leadContractVersionRepository.subscribe((items) => setContractVersions(items.filter((item) => item.leadId === id).sort((a, b) => b.version - a.version))), [id]);
  if (!lead) return <Box><PageHeader title="مشتری احتمالی یافت نشد" subtitle="شناسه معتبر نیست" crumbs={['تری‌لیز', 'مشتریان احتمالی']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/leads')}>بازگشت به مشتریان احتمالی</Button></Box>;
  const saveActivity = async () => {
    if (!form.title.trim()) { setError('عنوان فعالیت الزامی است.'); return; }
    setSaving(true);
    try {
      await leadActivityRepository.create({ leadId: id, type: form.type, title: form.title.trim(), description: form.description.trim(), occurredAt: form.occurredAt, actorId: user.id });
      setOpen(false); setError(''); setForm({ type: 'call', title: '', description: '', occurredAt: new Date().toISOString() });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت فعالیت انجام نشد.'); }
    finally { setSaving(false); }
  };
  const changeLeadField = async (field: 'status' | 'stage', next: string) => {
    const current = field === 'status' ? lead.status : (lead.stage ?? 'new');
    if (current === next) return;
    const labels: Record<string, string> = Object.fromEntries([...statusOptions, ...stageOptions].map((option) => [option.value, option.label]));
    await leadRepository.update(id, field === 'status' ? { status: next as LeadStatus } : { stage: next as LeadStage });
    await leadActivityRepository.create({ leadId: id, type: field === 'status' ? 'status_changed' : 'stage_changed', title: `تغییر ${field === 'status' ? 'وضعیت' : 'مرحله'} مشتری احتمالی`, description: `${field === 'status' ? 'وضعیت' : 'مرحله'} از «${labels[current] ?? current}» به «${labels[next] ?? next}» تغییر کرد.`, occurredAt: new Date().toISOString(), actorId: user.id, metadata: { from: current, to: next } });
  };
  const openCommercial = (type: 'proposal' | 'contract') => { setCommercialType(type); setCommercialFile(null); setCommercialForm({ title: type === 'proposal' ? 'پیشنهاد قیمت' : 'قرارداد همکاری', amount: '', feedback: '', sentVia: 'ایمیل', fileName: '', fileType: '' }); setCommercialOpen(true); };
  const saveCommercialVersion = async () => {
    if (!commercialForm.title.trim()) return;
    setSaving(true); setError('');
    try {
    const source = commercialType === 'proposal' ? proposalVersions : contractVersions;
    const storedFile = commercialFile ? await uploadStoredFile(commercialFile, { visibility: 'workspace', customerVisible: false, description: `پیوست ${commercialType === 'proposal' ? 'پیشنهاد' : 'قرارداد'} مشتری احتمالی ${lead.name || lead.company}` }) : undefined;
    const input = { leadId: id, version: (source[0]?.version ?? 0) + 1, title: commercialForm.title.trim(), status: commercialForm.feedback.trim() ? 'feedback' as const : 'draft' as const, amount: Number(commercialForm.amount) || undefined, fileName: storedFile?.name, fileType: storedFile?.mimeType, fileRecordId: storedFile?.id, feedback: commercialForm.feedback.trim() || undefined, createdAt: new Date().toISOString(), createdBy: user.id };
    if (commercialType === 'proposal') await leadProposalVersionRepository.create(input as Omit<LeadProposalVersion, 'id'>); else await leadContractVersionRepository.create(input as Omit<LeadContractVersion, 'id'>);
    await leadActivityRepository.create({ leadId: id, type: 'note', title: `نسخه ${input.version} ${commercialType === 'proposal' ? 'پیشنهاد' : 'قرارداد'} ایجاد شد`, description: `${input.title}${input.feedback ? ` — بازخورد: ${input.feedback}` : ''}${input.fileName ? ` — فایل: ${input.fileName}` : ''}`, occurredAt: input.createdAt, actorId: user.id });
    setCommercialOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت نسخه تجاری انجام نشد.'); }
    finally { setSaving(false); }
  };
  const updateCommercial = async (type: 'proposal' | 'contract', item: LeadProposalVersion | LeadContractVersion, patch: Partial<LeadProposalVersion & LeadContractVersion>) => {
    const repo = type === 'proposal' ? leadProposalVersionRepository : leadContractVersionRepository;
    await repo.update(item.id, patch as never);
    if (patch.status === 'sent' || patch.status === 'finalized') await leadActivityRepository.create({ leadId: id, type: 'note', title: `${type === 'proposal' ? 'پیشنهاد' : 'قرارداد'} نسخه ${item.version} ${patch.status === 'sent' ? 'ارسال شد' : 'نهایی شد'}`, description: patch.status === 'sent' ? `کانال ارتباطی: ${item.sentVia ?? 'ثبت نشده'}` : 'این نسخه به‌عنوان نسخه مورد توافق نهایی شد.', occurredAt: new Date().toISOString(), actorId: user.id });
  };
  const createCustomerProject = async () => {
    const isCompany = Boolean(lead.company.trim());
    const displayName = (isCompany ? lead.company : lead.name).trim() || 'مشتری جدید';
    const customer = await customerRepository.create({ entityType: isCompany ? 'company' : 'person', name: displayName, company: displayName, email: lead.email, phone: lead.phone, groups: lead.tags ?? [], currency: 'IRR', country: lead.country || 'ایران', province: lead.province, city: lead.city, postalCode: lead.postalCode, address: lead.address, website: lead.website, status: 'active', value: lead.estimatedValue, assignedTo: lead.assignedTo, lastContact: new Date().toISOString() });
    const createdProject = await projectRepository.create({ name: `پروژه ${lead.company || lead.name}`, customerId: customer.id, managerId: lead.assignedTo, members: [lead.assignedTo], progress: 0, tasksCount: 0, completedTasksCount: 0, description: 'پروژه ایجادشده از قرارداد نهایی مشتری احتمالی' });
    await provisionProjectExecution(createdProject);
  };
  return <Box>
    <PageHeader title={lead.name || lead.company || 'مشتری احتمالی'} subtitle={`${lead.company || 'بدون شرکت'} • ${lead.email || 'ایمیل ثبت نشده'}`} crumbs={['تری‌لیز', 'مشتریان احتمالی', lead.name || lead.company]} actions={<Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/leads')}>بازگشت</Button>} />
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1.5fr' }, alignItems: 'start' }}>
      <Stack spacing={2}>
        <Card><CardContent><Typography variant="h6" sx={{ fontWeight: 800 }}>{lead.name || 'بدون نام'}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{lead.company || 'شرکت ثبت نشده'}</Typography><Divider sx={{ my: 1.5 }} /><Stack spacing={1}><Typography variant="body2">ایمیل: {lead.email || '—'}</Typography><Typography variant="body2">تلفن: {lead.phone || '—'}</Typography><Typography variant="body2">موقعیت: {[lead.city, lead.province, lead.country].filter(Boolean).join('، ') || '—'}</Typography><Typography variant="body2">وب‌سایت: {lead.website || '—'}</Typography><Typography variant="body2">ارزش احتمالی: <strong>{formatCurrency(lead.estimatedValue)}</strong></Typography></Stack></CardContent></Card>
        <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>وضعیت مشتری احتمالی</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}><FormControl fullWidth size="small"><InputLabel>مرحله</InputLabel><Select label="مرحله" value={lead.stage ?? 'new'} onChange={(event) => changeLeadField('stage', event.target.value)}>{stageOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl><FormControl fullWidth size="small"><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={lead.status} onChange={(event) => changeLeadField('status', event.target.value)}>{statusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl></Stack><Typography variant="body2" color="text.secondary">مسئول: {users.find((item) => item.id === lead.assignedTo)?.name ?? '—'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>منبع: {lead.source || '—'}</Typography><Typography variant="body2" sx={{ mt: 1.5 }}>{lead.notes || 'یادداشتی برای این مشتری احتمالی ثبت نشده است.'}</Typography></CardContent></Card>
      </Stack>
      <Stack spacing={2}>
        <Card><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>پیشنهادها</Typography><Button size="small" variant="contained" startIcon={<Add />} onClick={() => openCommercial('proposal')}>نسخه جدید</Button></Stack>{proposalVersions.length ? proposalVersions.map((item) => <Stack key={item.id} direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography fontWeight={700}>V{item.version} — {item.title}</Typography><Typography variant="caption" color="text.secondary">{commercialStatusLabel[item.status]}{item.fileName ? ` • ${item.fileName}` : ''}{item.amount ? ` • ${formatCurrency(item.amount)}` : ''}</Typography></Box><Stack direction="row" spacing={.5}><Button size="small" startIcon={<Send />} disabled={item.status === 'finalized'} onClick={() => updateCommercial('proposal', item, { status: 'sent', sentAt: new Date().toISOString() })}>ارسال</Button><Button size="small" color="success" startIcon={<CheckCircle />} disabled={item.status === 'finalized'} onClick={() => updateCommercial('proposal', item, { status: 'finalized', finalizedAt: new Date().toISOString() })}>نهایی‌سازی</Button></Stack></Stack>) : <Typography color="text.secondary">هنوز پیشنهادی ثبت نشده است.</Typography>}</CardContent></Card>
        <Card><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>قراردادها</Typography><Button size="small" variant="contained" startIcon={<Add />} onClick={() => openCommercial('contract')}>نسخه جدید</Button></Stack>{contractVersions.length ? contractVersions.map((item) => <Stack key={item.id} direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography fontWeight={700}>V{item.version} — {item.title}</Typography><Typography variant="caption" color="text.secondary">{commercialStatusLabel[item.status]}{item.fileName ? ` • ${item.fileName}` : ''}{item.amount ? ` • ${formatCurrency(item.amount)}` : ''}</Typography></Box><Stack direction="row" spacing={.5}><Button size="small" startIcon={<Send />} disabled={item.status === 'finalized'} onClick={() => updateCommercial('contract', item, { status: 'sent', sentAt: new Date().toISOString() })}>ارسال</Button><Button size="small" color="success" startIcon={<CheckCircle />} disabled={item.status === 'finalized'} onClick={() => updateCommercial('contract', item, { status: 'finalized', finalizedAt: new Date().toISOString() })}>نهایی‌سازی</Button></Stack></Stack>) : <Typography color="text.secondary">هنوز قراردادی ثبت نشده است.</Typography>}{contractVersions.some((item) => item.status === 'finalized') && <Button sx={{ mt: 1.5 }} variant="outlined" onClick={createCustomerProject}>ایجاد مشتری و پروژه از قرارداد نهایی</Button>}</CardContent></Card>
        <Card><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}><Box><Typography variant="h6" sx={{ fontWeight: 800 }}>تایم‌لاین فعالیت</Typography><Typography variant="body2" color="text.secondary">تمام تماس‌ها، جلسات، پیگیری‌ها و تغییرات این مشتری احتمالی</Typography></Box><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>افزودن فعالیت</Button></Stack>{activities.length ? <Stack spacing={0}>{activities.map((activity, index) => { const meta = activityTypes.find((item) => item.value === activity.type); return <Stack key={activity.id} direction="row" spacing={1.5} sx={{ position: 'relative', pb: index === activities.length - 1 ? 0 : 2.5 }}><Box sx={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'primary.50', color: 'primary.main', zIndex: 2 }}>{meta?.icon ?? <History fontSize="small" />}</Box>{index !== activities.length - 1 && <Box aria-hidden="true" sx={{ position: 'absolute', top: 34, bottom: 0, right: 16, width: '2px', bgcolor: 'divider', pointerEvents: 'none', zIndex: 0 }} />}<Box sx={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1, bgcolor: 'background.paper' }}><Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'baseline' }}><Typography sx={{ fontWeight: 800 }}>{activity.title}</Typography><Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(activity.occurredAt)}</Typography></Stack><Typography variant="body2" sx={{ mt: .5, whiteSpace: 'pre-wrap' }}>{activity.description || 'بدون شرح'}</Typography><Typography variant="caption" color="text.secondary" sx={{ mt: .5, display: 'block' }}>ثبت‌کننده: {users.find((item) => item.id === activity.actorId)?.name ?? '—'} • {meta?.label ?? 'فعالیت'}</Typography></Box></Stack>; })}</Stack> : <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>هنوز فعالیتی برای این مشتری احتمالی ثبت نشده است.</Typography>}</CardContent></Card>
      </Stack>
    </Box>
    <Dialog open={commercialOpen} onClose={saving ? undefined : () => setCommercialOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>ایجاد نسخه جدید {commercialType === 'proposal' ? 'پیشنهاد' : 'قرارداد'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField required autoFocus label="عنوان" value={commercialForm.title} onChange={(event) => setCommercialForm({ ...commercialForm, title: event.target.value })} />
        <TextField label="مبلغ" type="number" value={commercialForm.amount} onChange={(event) => setCommercialForm({ ...commercialForm, amount: event.target.value })} />
        <TextField multiline minRows={3} label="بازخورد یا اصلاحات مشتری" value={commercialForm.feedback} onChange={(event) => setCommercialForm({ ...commercialForm, feedback: event.target.value })} />
        <FormControl fullWidth><InputLabel>روش ارسال</InputLabel><Select label="روش ارسال" value={commercialForm.sentVia} onChange={(event) => setCommercialForm({ ...commercialForm, sentVia: event.target.value })}>{channels.map((channel) => <MenuItem key={channel} value={channel}>{channel}</MenuItem>)}</Select></FormControl>
        <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={saving}>پیوست فایل (PDF یا سایر)<input hidden type="file" accept="application/pdf,.pdf,.doc,.docx,.png,.jpg" onChange={(event) => { const file = event.target.files?.[0]; setCommercialFile(file ?? null); setCommercialForm((current) => ({ ...current, fileName: file?.name ?? '', fileType: file?.type ?? '' })); event.target.value = ''; }} /></Button>
        {commercialForm.fileName && <Typography variant="caption" color="text.secondary">فایل انتخاب‌شده: {commercialForm.fileName}</Typography>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setCommercialOpen(false)} disabled={saving}>انصراف</Button><Button variant="contained" onClick={() => void saveCommercialVersion()} disabled={!commercialForm.title.trim() || saving}>{saving ? 'در حال ثبت…' : 'ثبت نسخه'}</Button></DialogActions>
    </Dialog>
    <Dialog open={open} onClose={saving ? undefined : () => setOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}><DialogTitle sx={{ fontWeight: 800 }}>افزودن فعالیت به تایم‌لاین</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{error && <Alert severity="error">{error}</Alert>}<FormControl fullWidth><InputLabel>نوع فعالیت</InputLabel><Select label="نوع فعالیت" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as LeadActivityType })}>{activityTypes.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl><TextField required autoFocus fullWidth label="عنوان فعالیت" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><TextField fullWidth multiline minRows={4} label="شرح و جزئیات" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><JalaliDatePicker label="تاریخ فعالیت" value={form.occurredAt} onChange={(value) => setForm({ ...form, occurredAt: value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>انصراف</Button><Button variant="contained" onClick={() => void saveActivity()} disabled={saving}>{saving ? 'در حال ثبت…' : 'ثبت فعالیت'}</Button></DialogActions></Dialog>
  </Box>;
}
