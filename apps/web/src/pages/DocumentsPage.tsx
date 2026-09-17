import { Add, AttachFile, Edit, FolderOpen } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import DataTable from '../components/common/DataTable.tsx';
import DocumentFormDialog from '../components/common/DocumentFormDialog.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import { customers, employees, projects, users } from '../mock/data.ts';
import { registerFile } from '../services/fileService.ts';
import { documentRepository } from '../services/repositories.ts';
import type { BusinessDocument, BusinessDocumentType, DocumentSection } from '../types/index.ts';
import { customerDisplayName } from '../utils/customer.ts';
import { documentMatchesSection, documentSectionLabels, documentStatusColor, documentStatusLabels, documentTypeLabels } from '../utils/document.ts';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format.ts';

const sections: Array<DocumentSection | 'all'> = ['all', 'customers', 'projects', 'finance', 'hr', 'general'];
const views = ['all', 'internal', 'followup', 'archive'] as const;
type DocumentView = typeof views[number];

function relationLabel(document: BusinessDocument) {
  const project = projects.find((item) => item.id === document.projectId);
  const customer = customers.find((item) => item.id === document.customerId);
  const employee = employees.find((item) => item.id === document.employeeId);
  return [customer && customerDisplayName(customer), project?.name, employee?.fullName].filter(Boolean).join(' • ') || 'سند عمومی';
}

function dueDate(document: BusinessDocument) {
  return document.validityDate ?? document.endDate ?? document.requestedDate ?? document.requestDate;
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedSection = params.get('section');
  const section: DocumentSection | 'all' = sections.includes(requestedSection as DocumentSection) ? requestedSection as DocumentSection : 'all';
  const requestedView = params.get('view');
  const view: DocumentView = views.includes(requestedView as DocumentView) ? requestedView as DocumentView : 'all';
  const typeParam = params.get('type');
  const requestedType = typeParam && typeParam in documentTypeLabels ? typeParam as BusinessDocumentType : null;
  const scopedProjectId = params.get('project');
  const scopedCustomerId = params.get('customer');
  const scopedEmployeeId = params.get('employee');
  const [records, setRecords] = useState(() => documentRepository.list());
  const [selected, setSelected] = useState<BusinessDocument>();
  const [formDocument, setFormDocument] = useState<BusinessDocument | 'new'>();
  useEffect(() => documentRepository.subscribe(setRecords), []);

  const rows = records.filter((document) => {
    if (!documentMatchesSection(document, section)) return false;
    if (requestedType && document.documentType !== requestedType) return false;
    if (scopedProjectId && document.projectId !== scopedProjectId) return false;
    if (scopedCustomerId && document.customerId !== scopedCustomerId) return false;
    if (scopedEmployeeId && document.employeeId !== scopedEmployeeId) return false;
    if (view === 'internal' && document.customerVisible) return false;
    if (view === 'archive' && document.status !== 'archived') return false;
    if (view === 'followup' && !['sent', 'submitted', 'under_review', 'draft'].includes(document.status)) return false;
    if (view !== 'archive' && document.status === 'archived') return false;
    return true;
  });

  const save = (input: Omit<BusinessDocument, 'id' | 'createdAt' | 'updatedAt'>, files: File[]) => {
    const now = new Date().toISOString();
    const existing = formDocument !== 'new' ? formDocument : undefined;
    const documentId = existing?.id ?? `documents-v2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fileIds = files.map((_, index) => `document-file-${documentId}-${Date.now()}-${index}`);
    const persistedInput = { ...input, fileRecordIds: [...(input.fileRecordIds ?? []), ...fileIds] };
    const document = existing
      ? documentRepository.update(existing.id, { ...persistedInput, updatedAt: now })!
      : documentRepository.create({ ...persistedInput, id: documentId, createdAt: now, updatedAt: now });
    files.forEach((file, index) => registerFile({
      id: fileIds[index], name: file.name, originalName: file.name, type: file.type || 'application/octet-stream', mimeType: file.type || 'application/octet-stream', size: file.size.toLocaleString('fa-IR') + ' بایت',
      uploadedBy: input.createdBy, uploadedAt: now, source: documentTypeLabels[input.documentType], sourceId: document.id, projectId: input.projectId, customerId: input.customerId, employeeId: input.employeeId,
      visibility: 'workspace', access: ['view', 'edit', 'delete', 'share'], customerVisible: input.customerVisible,
      context: input.projectId ? { kind: 'project', id: input.projectId } : input.customerId ? { kind: 'customer', id: input.customerId } : input.employeeId ? { kind: 'employee', id: input.employeeId } : { kind: 'file', id: document.id },
    }));
    setSelected(document);
    setFormDocument(undefined);
  };

  const changeSection = (next: string) => {
    const query = new URLSearchParams(params);
    if (next === 'all') query.delete('section'); else query.set('section', next);
    navigate(`/documents?${query.toString()}`);
  };
  const changeView = (next: DocumentView) => {
    const query = new URLSearchParams(params);
    if (next === 'all') query.delete('view'); else query.set('view', next);
    navigate(`/documents?${query.toString()}`);
  };

  const counts = Object.keys(documentTypeLabels).map((type) => ({ type: type as BusinessDocumentType, count: records.filter((document) => document.documentType === type).length }));
  return <Box>
    <PageHeader title="اسناد" subtitle="مدیریت فایل‌های قراردادی و تأییدیه‌ها بر اساس ارتباط واقعی با مشتری، پروژه و کارمند" crumbs={['تری‌لیز', 'اسناد']} actions={<Button variant="contained" startIcon={<Add />} onClick={() => setFormDocument('new')}>ایجاد سند</Button>} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 1.25, mb: 2 }}>{counts.map((item) => <Card key={item.type} variant="outlined" onClick={() => navigate(`/documents?type=${item.type}`)} sx={{ cursor: 'pointer' }}><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><Typography variant="caption" color="text.secondary">{documentTypeLabels[item.type]}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{item.count.toLocaleString('fa-IR')}</Typography></CardContent></Card>)}</Box>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5, alignItems: { md: 'center' } }}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>{([['all', 'همه'], ['internal', 'داخلی'], ['followup', 'نیازمند پیگیری'], ['archive', 'بایگانی']] as const).map(([key, label]) => <Button key={key} size="small" variant={view === key ? 'contained' : 'outlined'} onClick={() => changeView(key)}>{label}</Button>)}</Stack>
      <Box sx={{ flex: 1 }} />
      <FormControl size="small" sx={{ minWidth: 220 }}><InputLabel>حوزه مرتبط</InputLabel><Select label="حوزه مرتبط" value={section} onChange={(event) => changeSection(event.target.value)}><MenuItem value="all">همه حوزه‌ها</MenuItem>{Object.entries(documentSectionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
    </Stack>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(document) => document.id} onRowClick={setSelected} searchPlaceholder="جستجوی عنوان، شماره، نوع، مشتری، پروژه یا کارمند..." csvFilename="documents.csv" filters={[
      { key: 'type', label: 'نوع سند', options: Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label })), value: (document) => document.documentType },
      { key: 'status', label: 'وضعیت', options: Object.entries(documentStatusLabels).map(([value, label]) => ({ value, label })), value: (document) => document.status },
      { key: 'visibility', label: 'نمایش مشتری', options: [{ value: 'visible', label: 'قابل مشاهده' }, { value: 'internal', label: 'داخلی' }], value: (document) => document.customerVisible ? 'visible' : 'internal' },
    ]} columns={[
      { key: 'title', label: 'سند', value: (document) => `${document.title} ${document.documentNumber} ${document.summary}`, render: (document) => <Box><Typography sx={{ fontWeight: 700 }}>{document.title}</Typography><Typography variant="caption" color="text.secondary">{document.documentNumber} • {document.summary || 'بدون شرح'}</Typography></Box> },
      { key: 'type', label: 'نوع', value: (document) => documentTypeLabels[document.documentType], render: (document) => <Chip size="small" label={documentTypeLabels[document.documentType]} /> },
      { key: 'relation', label: 'ارتباط', value: relationLabel, groupable: true },
      { key: 'value', label: 'ارزش', value: (document) => document.value ?? document.compensation ?? 0, aggregate: 'sum', render: (document) => document.value || document.compensation ? formatCurrency(document.value ?? document.compensation ?? 0) : '—' },
      { key: 'date', label: 'تاریخ کلیدی', value: (document) => dueDate(document) ?? '', render: (document) => dueDate(document) ? formatDate(dueDate(document)!) : '—' },
      { key: 'status', label: 'وضعیت', value: (document) => documentStatusLabels[document.status], render: (document) => <Chip size="small" color={documentStatusColor(document.status)} label={documentStatusLabels[document.status]} /> },
      { key: 'visibility', label: 'نمایش مشتری', value: (document) => document.customerVisible ? 'قابل مشاهده' : 'داخلی', render: (document) => <CustomerVisibilityBadge visible={document.customerVisible} /> },
      { key: 'attachments', label: 'فایل', value: (document) => document.attachments.length, render: (document) => `${document.attachments.length.toLocaleString('fa-IR')} فایل` },
    ]} /></Card>

    <Dialog open={Boolean(selected)} onClose={() => setSelected(undefined)} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl' } } }}><DialogTitle sx={{ fontWeight: 800 }}>{selected?.title}</DialogTitle><DialogContent dividers>{selected && <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip label={documentTypeLabels[selected.documentType]} /><Chip color={documentStatusColor(selected.status)} label={documentStatusLabels[selected.status]} /><CustomerVisibilityBadge visible={selected.customerVisible} /></Stack>
      <Info label="شماره سند" value={selected.documentNumber} /><Info label="ارتباط" value={relationLabel(selected)} />
      {selected.value !== undefined && <Info label={selected.documentType === 'project_contract' ? 'ارزش قرارداد' : selected.documentType === 'proposal' ? 'ارزش پیشنهاد' : 'اثر مالی'} value={formatCurrency(selected.value)} />}
      {selected.validityDate && <Info label="پایان اعتبار" value={formatDate(selected.validityDate)} />}{selected.startDate && <Info label="تاریخ شروع" value={formatDate(selected.startDate)} />}{selected.endDate && <Info label="تاریخ پایان" value={formatDate(selected.endDate)} />}
      {selected.requestedById && <Info label="درخواست‌کننده" value={users.find((user) => user.id === selected.requestedById)?.name ?? '—'} />}{selected.requestDate && <Info label="تاریخ درخواست" value={formatDate(selected.requestDate)} />}{selected.impactDescription && <Info label="اثر تغییر" value={selected.impactDescription} />}
      {selected.position && <Info label="سمت" value={selected.position} />}{selected.compensation !== undefined && <Info label="جبران خدمات" value={formatCurrency(selected.compensation)} />}
      {selected.deliverable && <Info label="تحویل‌دادنی / نقطه عطف" value={selected.deliverable} />}{selected.requestedDate && <Info label="تاریخ درخواست تأیید" value={formatDate(selected.requestedDate)} />}{selected.acceptedDate && <Info label="تاریخ پذیرش" value={formatDate(selected.acceptedDate)} />}
      <Divider /><Info label="شرح" value={selected.summary || '—'} />{selected.notes && <Info label="یادداشت" value={selected.notes} />}
      <Typography sx={{ fontWeight: 800 }}>فایل‌های سند</Typography><Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>{selected.attachments.map((file) => <Chip key={file} icon={<AttachFile />} label={file} variant="outlined" />)}{!selected.attachments.length && <Typography color="text.secondary">فایلی ثبت نشده است.</Typography>}</Stack>
      <Divider /><Typography variant="caption" color="text.secondary">ایجاد: {formatDateTime(selected.createdAt)} • آخرین تغییر: {formatDateTime(selected.updatedAt)}</Typography>
    </Stack>}</DialogContent><DialogActions><Button startIcon={<Edit />} onClick={() => { setFormDocument(selected); setSelected(undefined); }}>ویرایش</Button><Button startIcon={<FolderOpen />} onClick={() => navigate('/media')}>فایل منیجر</Button><Button onClick={() => setSelected(undefined)}>بستن</Button></DialogActions></Dialog>
    {formDocument && <DocumentFormDialog key={formDocument === 'new' ? 'new-document' : formDocument.id} document={formDocument === 'new' ? undefined : formDocument} initialProjectId={params.get('project') ?? undefined} initialCustomerId={params.get('customer') ?? undefined} initialEmployeeId={params.get('employee') ?? undefined} onClose={() => setFormDocument(undefined)} onSave={save} />}
  </Box>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: 0.25, fontWeight: 600 }}>{value}</Typography></Box>;
}
