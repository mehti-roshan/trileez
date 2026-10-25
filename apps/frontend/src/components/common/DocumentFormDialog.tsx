import { AttachFile, DeleteOutlined, UploadFile } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { customers, employees, projects, users } from '../../services/repositories.ts';
import { listFiles } from '../../services/fileService.ts';
import type { BusinessDocument, BusinessDocumentStatus, BusinessDocumentType } from '../../types/index.ts';
import { customerDisplayName } from '../../utils/customer.ts';
import { documentStatusLabels, documentStatusOptions, documentTypeLabels, validateBusinessDocument } from '../../utils/document.ts';
import JalaliDatePicker from './JalaliDatePicker.tsx';

type DocumentInput = Omit<BusinessDocument, 'id' | 'createdAt' | 'updatedAt'>;
type Props = { document?: BusinessDocument; initialProjectId?: string; initialCustomerId?: string; initialEmployeeId?: string; onClose: () => void; onSave: (input: DocumentInput, files: File[]) => void | Promise<void> };

function initialValues(document?: BusinessDocument, initialProjectId?: string, initialCustomerId?: string, initialEmployeeId?: string) {
  const contextualCustomerId = initialCustomerId ?? projects.find((project) => project.id === initialProjectId)?.customerId ?? '';
  return {
    documentType: document?.documentType ?? (initialEmployeeId ? 'employment_contract' : initialProjectId ? 'project_contract' : 'proposal'),
    title: document?.title ?? '', documentNumber: document?.documentNumber ?? '', summary: document?.summary ?? '', status: document?.status ?? 'draft',
    customerId: document?.customerId ?? contextualCustomerId, projectId: document?.projectId ?? initialProjectId ?? '', employeeId: document?.employeeId ?? initialEmployeeId ?? '',
    requestedById: document?.requestedById ?? '', value: document?.value ? String(document.value) : '', validityDate: document?.validityDate ?? '',
    startDate: document?.startDate ?? '', endDate: document?.endDate ?? '', requestDate: document?.requestDate ?? '', requestedDate: document?.requestedDate ?? '', acceptedDate: document?.acceptedDate ?? '',
    impactDescription: document?.impactDescription ?? '', position: document?.position ?? '', compensation: document?.compensation ? String(document.compensation) : '', deliverable: document?.deliverable ?? '', notes: document?.notes ?? '',
    customerVisible: document?.customerVisible ?? false,
  };
}

export default function DocumentFormDialog({ document, initialProjectId, initialCustomerId, initialEmployeeId, onClose, onSave }: Props) {
  const [values, setValues] = useState(() => initialValues(document, initialProjectId, initialCustomerId, initialEmployeeId));
  const [attachments, setAttachments] = useState(document?.attachments ?? []);
  const [existingFileIds, setExistingFileIds] = useState(document?.fileRecordIds ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const type = values.documentType as BusinessDocumentType;
  const availableFiles = listFiles().filter((file) => !file.deletedAt);
  const availableProjects = projects.filter((project) => !values.customerId || project.customerId === values.customerId);
  const set = (name: string, value: string | boolean) => setValues((current) => ({ ...current, [name]: value }));
  const selectProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    setValues((current) => ({ ...current, projectId, customerId: project?.customerId ?? current.customerId }));
  };
  const changeType = (documentType: BusinessDocumentType) => setValues((current) => ({ ...current, documentType, status: documentStatusOptions[documentType][0] }));
  const addFiles = (selected: FileList | null) => {
    const next = Array.from(selected ?? []);
    setFiles((current) => [...current, ...next]);
    setAttachments((current) => [...current, ...next.map((file) => file.name).filter((name) => !current.includes(name))]);
  };
  const selectExistingFiles = (ids: string[]) => {
    const selectedNames = availableFiles.filter((file) => ids.includes(file.id)).map((file) => file.name);
    const fileManagerNames = new Set(availableFiles.map((file) => file.name));
    setExistingFileIds(ids);
    setAttachments((current) => Array.from(new Set([
      ...current.filter((name) => !fileManagerNames.has(name) || files.some((file) => file.name === name)),
      ...selectedNames,
    ])));
  };
  const submit = async () => {
    const input: DocumentInput = {
      documentType: type, title: values.title.trim(), documentNumber: values.documentNumber.trim(), summary: values.summary.trim(), status: values.status as BusinessDocumentStatus,
      attachments, fileRecordIds: existingFileIds, createdBy: document?.createdBy ?? 'u1', customerVisible: values.customerVisible,
    };
    if (type === 'proposal') Object.assign(input, { customerId: values.customerId || undefined, value: values.value ? Number(values.value) : undefined, validityDate: values.validityDate || undefined });
    if (type === 'project_contract') Object.assign(input, { customerId: values.customerId || undefined, projectId: values.projectId || undefined, value: values.value ? Number(values.value) : undefined, startDate: values.startDate || undefined, endDate: values.endDate || undefined });
    if (type === 'change_request') Object.assign(input, { customerId: values.customerId || undefined, projectId: values.projectId || undefined, requestedById: values.requestedById || undefined, requestDate: values.requestDate || undefined, value: values.value ? Number(values.value) : undefined, impactDescription: values.impactDescription.trim() || undefined });
    if (type === 'employment_contract') Object.assign(input, { employeeId: values.employeeId || undefined, position: values.position.trim() || undefined, startDate: values.startDate || undefined, endDate: values.endDate || undefined, compensation: values.compensation ? Number(values.compensation) : undefined });
    if (type === 'acceptance') Object.assign(input, { customerId: values.customerId || undefined, projectId: values.projectId || undefined, deliverable: values.deliverable.trim() || undefined, requestedDate: values.requestedDate || undefined, acceptedDate: values.acceptedDate || undefined });
    if (type === 'other') input.notes = values.notes.trim() || undefined;
    const missing = validateBusinessDocument(input);
    if (missing.length) { setError(`فیلدهای لازم را تکمیل کنید: ${missing.join('، ')}`); return; }
    if (input.projectId && projects.find((project) => project.id === input.projectId)?.customerId !== input.customerId) { setError('پروژه و مشتری انتخاب‌شده با یکدیگر مرتبط نیستند.'); return; }
    if (input.startDate && input.endDate && input.endDate < input.startDate) { setError('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.'); return; }
    setSaving(true);
    try {
      await onSave(input, files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بارگذاری یا ذخیره سند ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open onClose={onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl', maxHeight: 'calc(100vh - 24px)' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{document ? 'ویرایش سند' : 'ایجاد سند'}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <FormControl required><InputLabel>نوع سند</InputLabel><Select label="نوع سند" value={type} onChange={(event) => changeType(event.target.value as BusinessDocumentType)}>{Object.entries(documentTypeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        <FormControl required><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={values.status} onChange={(event) => set('status', event.target.value)}>{documentStatusOptions[type].map((status) => <MenuItem key={status} value={status}>{documentStatusLabels[status]}</MenuItem>)}</Select></FormControl>
        <TextField required label="عنوان سند" value={values.title} onChange={(event) => set('title', event.target.value)} />
        <TextField required label="شماره سند" value={values.documentNumber} onChange={(event) => set('documentNumber', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      </Box>

      {['proposal', 'project_contract', 'change_request', 'acceptance'].includes(type) && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: type === 'proposal' ? '1fr' : '1fr 1fr' } }}>
        <FormControl required><InputLabel>مشتری</InputLabel><Select label="مشتری" value={values.customerId} onChange={(event) => setValues((current) => ({ ...current, customerId: event.target.value, projectId: projects.some((project) => project.id === current.projectId && project.customerId === event.target.value) ? current.projectId : '' }))}>{customers.map((customer) => <MenuItem key={customer.id} value={customer.id}>{customerDisplayName(customer)}</MenuItem>)}</Select></FormControl>
        {type !== 'proposal' && <FormControl required><InputLabel>پروژه</InputLabel><Select label="پروژه" value={values.projectId} onChange={(event) => selectProject(event.target.value)}><MenuItem value="">انتخاب پروژه</MenuItem>{availableProjects.map((project) => <MenuItem key={project.id} value={project.id}>{project.name}</MenuItem>)}</Select></FormControl>}
      </Box>}

      {type === 'proposal' && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}><TextField required type="number" label="ارزش پیشنهاد" value={values.value} onChange={(event) => set('value', event.target.value)} /><JalaliDatePicker required label="تاریخ پایان اعتبار" value={values.validityDate} onChange={(value) => set('validityDate', value)} /></Box>}
      {type === 'project_contract' && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}><TextField required type="number" label="ارزش قرارداد" value={values.value} onChange={(event) => set('value', event.target.value)} /><JalaliDatePicker required label="تاریخ شروع" value={values.startDate} onChange={(value) => set('startDate', value)} /><JalaliDatePicker required label="تاریخ پایان" value={values.endDate} onChange={(value) => set('endDate', value)} /></Box>}
      {type === 'change_request' && <Stack spacing={1.5}><Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}><FormControl required><InputLabel>درخواست‌کننده</InputLabel><Select label="درخواست‌کننده" value={values.requestedById} onChange={(event) => set('requestedById', event.target.value)}>{users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}</Select></FormControl><JalaliDatePicker required label="تاریخ درخواست" value={values.requestDate} onChange={(value) => set('requestDate', value)} /><TextField type="number" label="اثر مالی / ارزش تغییر" value={values.value} onChange={(event) => set('value', event.target.value)} /></Box><TextField required multiline minRows={2} label="اثر تغییر بر محدوده، زمان یا هزینه" value={values.impactDescription} onChange={(event) => set('impactDescription', event.target.value)} /></Stack>}
      {type === 'employment_contract' && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}><FormControl required><InputLabel>کارمند</InputLabel><Select label="کارمند" value={values.employeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setValues((current) => ({ ...current, employeeId: event.target.value, position: current.position || employee?.jobTitle || '' })); }}>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.fullName}</MenuItem>)}</Select></FormControl><TextField required label="سمت" value={values.position} onChange={(event) => set('position', event.target.value)} /><JalaliDatePicker required label="تاریخ شروع" value={values.startDate} onChange={(value) => set('startDate', value)} /><JalaliDatePicker label="تاریخ پایان (اختیاری)" value={values.endDate} onChange={(value) => set('endDate', value)} /><TextField required type="number" label="مبلغ قرارداد / جبران خدمات" value={values.compensation} onChange={(event) => set('compensation', event.target.value)} /></Box>}
      {type === 'acceptance' && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}><TextField required label="تحویل‌دادنی / نقطه عطف" value={values.deliverable} onChange={(event) => set('deliverable', event.target.value)} /><JalaliDatePicker required label="تاریخ درخواست تأیید" value={values.requestedDate} onChange={(value) => set('requestedDate', value)} /><JalaliDatePicker required={values.status === 'accepted'} label="تاریخ پذیرش / امضا" value={values.acceptedDate} onChange={(value) => set('acceptedDate', value)} /></Box>}

      <TextField multiline minRows={3} label="شرح" value={values.summary} onChange={(event) => set('summary', event.target.value)} />
      {type === 'other' && <TextField multiline minRows={2} label="یادداشت تکمیلی" value={values.notes} onChange={(event) => set('notes', event.target.value)} />}
      <FormControlLabel control={<Switch checked={values.customerVisible} onChange={(event) => set('customerVisible', event.target.checked)} />} label="قابل مشاهده برای مشتری" />
      <Box sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}><Button component="label" variant="outlined" startIcon={<UploadFile />}>بارگذاری فایل<input hidden multiple type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={(event) => addFiles(event.target.files)} /></Button>{availableFiles.length > 0 && <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}><InputLabel>انتخاب از فایل منیجر</InputLabel><Select multiple label="انتخاب از فایل منیجر" value={existingFileIds} onChange={(event) => selectExistingFiles(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value)} renderValue={(selected) => `${selected.length.toLocaleString('fa-IR')} فایل انتخاب‌شده`}>{availableFiles.map((file) => <MenuItem key={file.id} value={file.id}>{file.name}</MenuItem>)}</Select></FormControl>}<Typography variant="caption" color="text.secondary">حداقل یک فایل بارگذاری یا از فایل منیجر انتخاب کنید.</Typography></Stack><Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>{attachments.map((name) => <Chip key={name} icon={<AttachFile />} label={name} onDelete={() => { setAttachments((current) => current.filter((item) => item !== name)); setFiles((current) => current.filter((file) => file.name !== name)); setExistingFileIds((current) => current.filter((id) => availableFiles.find((file) => file.id === id)?.name !== name)); }} deleteIcon={<DeleteOutlined />} />)}</Stack></Box>
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose} disabled={saving}>انصراف</Button><Button variant="contained" onClick={submit} disabled={saving}>{saving ? 'در حال ذخیره…' : document ? 'ذخیره تغییرات' : 'ثبت سند'}</Button></DialogActions>
  </Dialog>;
}
