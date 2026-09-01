/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-expressions */
// Frontend-only cross-module prototype pages.
// @ts-nocheck
import { Add, AttachFile, Close, InsertDriveFileOutlined, Send, PersonAdd, GroupAdd, DoneAll } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, IconButton } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import QuickCreateDialog from '../components/common/QuickCreateDialog.tsx';
import EntityFormDialog from '../components/common/EntityFormDialog.tsx';
import DataTable from '../components/common/DataTable.tsx';
import { businessDocuments, chatGroups, conversations, customers, documentCategories, employees, messages, performanceEvents, performanceReasons, projectEvents, projects, tasks, users } from '../mock/data.ts';
import { formatDate, formatDateTime, formatRelative } from '../utils/format.ts';
import { registerFile } from '../services/fileService.ts';
import { scoreSummary } from '../utils/performance.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { documentRepository, performanceEventRepository, projectEventRepository } from '../services/repositories.ts';
import { notify } from '../services/notificationService.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';

const personName = (id?: string) => employees.find((x) => x.id === id)?.fullName ?? users.find((x) => x.id === id)?.name ?? '—';
const projectLabel = (id?: string) => { const p = projects.find((x) => x.id === id); return p ? `${p.code ?? `P-${700000 + Number(p.id.slice(1) || 0)}`} — ${p.name}` : '—'; };
const customerLabel = (id?: string) => { const c = customers.find((x) => x.id === id); return c ? `${c.code ?? `C-${600000 + Number(c.id.slice(1) || 0)}`} — ${c.company}` : '—'; };
const documentSectionLabels = { projects: 'دبیرخانه پروژه‌ها', customers: 'دبیرخانه مشتریان', finance: 'دبیرخانه مالی', hr: 'دبیرخانه منابع انسانی', general: 'دبیرخانه عمومی' } as const;
const documentSections = Object.keys(documentSectionLabels) as Array<keyof typeof documentSectionLabels>;
function Shell({ title, subtitle, children, action }: { title: string; subtitle: string; children: React.ReactNode; action?: React.ReactNode }) {
  const fields = title.includes('لیبل') ? ['نام لیبل', 'رنگ', 'توضیحات'] : title.includes('امتیاز') ? ['کارمند', 'نوع تغییر (مثبت / منفی)', 'تعداد امتیاز', 'دلیل', 'پروژه', 'تاریخ', 'توضیحات'] : title.includes('رویداد') ? ['نوع رخداد', 'پروژه', 'شخص', 'مرحله', 'اولویت', 'تاریخ', 'توضیحات', 'نتیجه'] : title.includes('دبیرخانه') ? ['عنوان سند', 'نوع سند', 'شماره سند', 'پروژه', 'مشتری', 'فرستنده', 'دریافت‌کننده', 'مسئول پیگیری', 'تاریخ سررسید', 'وضعیت', 'اولویت', 'لینک سند', 'توضیحات'] : title.includes('گفتگو') ? ['نام فرد مقابل', 'پیام آغازین'] : ['عنوان', 'شرح'];
  return <Box><PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={action ?? <QuickCreateDialog title={`ایجاد ${title}`} fields={fields} />} />{children}</Box>;
}

export function TaskLabelsPage() {
  const [rows, setRows] = useState(() => ['فوری', 'فنی', 'سئو', 'نیازمند مشتری', 'داخلی', 'مهم'].map((name, i) => ({ id: `label-${i}`, name, color: ['#FEE2E2','#DBEAFE','#EDE9FE','#FEF3C7','#E2E8F0','#D1FAE5'][i], usage: 'قابل انتخاب برای چندین وظیفه' })));
  const [open, setOpen] = useState(false);
  return <Shell title="لیبل‌های وظایف" subtitle="مدیریت برچسب‌های قابل استفاده در کارها" action={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>لیبل جدید</Button>}><Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(x) => x.id} searchPlaceholder="جستجوی نام لیبل..." csvFilename="task-labels.csv" columns={[{ key: 'name', label: 'لیبل', value: (x) => x.name, render: (x) => <Chip label={x.name} sx={{ bgcolor: x.color }} /> }, { key: 'color', label: 'رنگ', value: (x) => x.color }, { key: 'usage', label: 'کاربرد', value: (x) => x.usage }]} /></Card><EntityFormDialog open={open} onClose={() => setOpen(false)} title="ایجاد لیبل وظیفه" fields={[{ name: 'name', label: 'نام لیبل', required: true }, { name: 'color', label: 'رنگ', required: true }]} onSubmit={(values) => { setRows((prev) => [{ id: `label-${Date.now()}`, name: values.name, color: values.color, usage: 'قابل انتخاب برای چندین وظیفه' }, ...prev]); setOpen(false); }} submitLabel="ذخیره لیبل" /></Shell>;
}

export function PerformancePointsPage() {
  const [employee, setEmployee] = useState('all'); const [open, setOpen] = useState(false); const [rows, setRows] = useState(() => performanceEventRepository.list());
  useEffect(() => performanceEventRepository.subscribe(setRows), []);
  const filteredRows = rows.filter((x) => employee === 'all' || x.employeeId === employee);
  const fields = [
    { name: 'employeeId', label: 'کارمند', type: 'select', required: true, options: employees.map((x) => ({ value: x.id, label: `${x.personnelCode} — ${x.fullName}` })) },
    { name: 'reasonId', label: 'دلیل استاندارد', type: 'select', required: true, options: performanceReasons.map((x) => ({ value: x.id, label: `${x.title} (${x.defaultPoints > 0 ? '+' : ''}${x.defaultPoints})` })) },
    { name: 'points', label: 'امتیاز', type: 'number', required: true },
    { name: 'projectId', label: 'پروژه (اختیاری)', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectLabel(x.id) })) },
    { name: 'taskId', label: 'وظیفه (اختیاری)', type: 'select', options: tasks.map((x) => ({ value: x.id, label: x.title })) },
    { name: 'date', label: 'تاریخ', type: 'date', required: true },
    { name: 'description', label: 'توضیحات تکمیلی', type: 'textarea' },
  ];
  const save = (values) => {
    const reason = performanceReasons.find((item) => item.id === values.reasonId);
    const rawPoints = Number(values.points);
    const points = (Number.isFinite(rawPoints) && rawPoints !== 0 ? Math.abs(rawPoints) : Math.abs(reason?.defaultPoints ?? 0)) * (reason?.direction === 'negative' ? -1 : 1);
    performanceEventRepository.create({ id: `point-${Date.now()}`, employeeId: values.employeeId, reasonId: values.reasonId, points, date: values.date || new Date().toISOString(), description: values.description || reason?.title || 'رویداد عملکردی', projectId: values.projectId || undefined, taskId: values.taskId || undefined, createdBy: 'u1' });
    setOpen(false);
  };
  return <Shell title="ارزیابی عملکرد" subtitle="امتیاز، درجه و رویدادهای مثبت و منفی در یک سیستم یکپارچه">
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}><FormControl sx={{ minWidth: 240 }}><InputLabel>کارمند</InputLabel><Select label="کارمند" value={employee} onChange={(e) => setEmployee(e.target.value)}><MenuItem value="all">همه کارکنان</MenuItem>{employees.map((x) => <MenuItem key={x.id} value={x.id}>{x.personnelCode} — {x.fullName}</MenuItem>)}</Select></FormControl><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>ثبت رویداد امتیاز</Button></Stack>
    <Card sx={{ mb: 2 }}><CardContent><Typography fontWeight={800} mb={1}>امتیاز ماه جاری</Typography><Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' } }}>{employees.slice(0, 8).map((item) => { const summary = scoreSummary(item.id, rows); return <Box key={item.id} sx={{ p: 1.5, bgcolor: '#F8FAFC', borderRadius: 2 }}><Typography fontWeight={700}>{item.fullName}</Typography><Typography variant="h6" fontWeight={800}>{summary.score} / ۱۰۰</Typography><Typography variant="caption">درجه {summary.grade} • {summary.delta > 0 ? '+' : ''}{summary.delta} این ماه</Typography></Box>; })}</Box></CardContent></Card>
    <Card sx={{ p: 1 }}><DataTable rows={filteredRows} getRowId={(x) => x.id} searchPlaceholder="جستجوی کارمند، دلیل یا پروژه..." toolbar={<CsvToolbar rows={filteredRows} entityLabel="رویدادهای امتیاز" filename="performance-events.csv" onImport={(items) => { let created = 0; const errors: string[] = []; items.forEach((item, index) => { const employeeId = employees.find((person) => person.id === item.employeeId || person.fullName === item.employeeId)?.id; const reason = performanceReasons.find((candidate) => candidate.id === item.reasonId || candidate.title === item.reasonId) ?? performanceReasons[0]; const points = Number(item.points); if (!employeeId || !Number.isFinite(points)) { errors.push(`ردیف ${index + 2}: کارمند یا امتیاز معتبر نیست`); return; } performanceEventRepository.create({ id: undefined, employeeId, reasonId: reason.id, points: reason.direction === 'negative' ? -Math.abs(points) : Math.abs(points), date: item.date || new Date().toISOString(), description: item.description || reason.title, projectId: projects.find((project) => project.id === item.projectId || project.name === item.projectId)?.id, createdBy: 'u1' }); created += 1; }); return { created, errors }; }} columns={[{ key: 'employee', label: 'کارمند', value: (x) => personName(x.employeeId) }, { key: 'date', label: 'تاریخ', value: (x) => x.date }, { key: 'reason', label: 'دلیل', value: (x) => performanceReasons.find((r) => r.id === x.reasonId)?.title }, { key: 'project', label: 'پروژه', value: (x) => projectLabel(x.projectId) }, { key: 'points', label: 'امتیاز', value: (x) => x.points }]} />} columns={[{ key: 'employee', label: 'کارمند', value: (x) => personName(x.employeeId) }, { key: 'date', label: 'تاریخ', value: (x) => x.date, render: (x) => formatDate(x.date) }, { key: 'reason', label: 'دلیل', value: (x) => performanceReasons.find((r) => r.id === x.reasonId)?.title }, { key: 'project', label: 'پروژه', value: (x) => projectLabel(x.projectId) }, { key: 'task', label: 'وظیفه', value: (x) => tasks.find((t) => t.id === x.taskId)?.title ?? '—' }, { key: 'points', label: 'امتیاز', value: (x) => x.points, render: (x) => <Typography sx={{ color: x.points >= 0 ? 'success.main' : 'error.main', fontWeight: 800 }}>{x.points > 0 ? '+' : ''}{x.points}</Typography> }, { key: 'description', label: 'توضیحات', value: (x) => x.description }]} /></Card>
    <EntityFormDialog open={open} onClose={() => setOpen(false)} title="ثبت رویداد تغییر امتیاز" fields={fields} onSubmit={save} submitLabel="ثبت رویداد" />
  </Shell>;
}

export function ProjectEventsPage() {
  const { id } = useParams();
  const [project, setProject] = useState(id ?? 'all');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => projectEventRepository.list());
  useEffect(() => projectEventRepository.subscribe(setRows), []);
  const filteredRows = rows.filter((x) => project === 'all' || x.projectId === project).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const save = (values) => { projectEventRepository.create({ id: undefined, projectId: project === 'all' ? values.projectId : project, eventType: values.eventType || 'یادداشت عملیاتی', stage: 'ثبت شد', priority: values.priority || 'عادی', status: 'open', date: values.date || new Date().toISOString(), registeredBy: 'u1', description: values.description || 'رخداد جدید پروژه', customerVisible: values.customerVisible === 'true' }); setOpen(false); };
  return <Shell title="رویدادهای پروژه" subtitle="تایم‌لاین تصمیم‌ها، تغییر وضعیت‌ها و رخدادهای عملیاتی پروژه‌ها"><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}><FormControl sx={{ minWidth: 300 }}><InputLabel>پروژه</InputLabel><Select label="پروژه" value={project} onChange={(e) => setProject(e.target.value)}><MenuItem value="all">همه پروژه‌ها</MenuItem>{projects.map((x) => <MenuItem key={x.id} value={x.id}>{projectLabel(x.id)}</MenuItem>)}</Select></FormControl><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>ثبت رویداد جدید</Button></Stack><Card><CardContent><Stack spacing={0}>{filteredRows.map((x) => <Box key={x.id} sx={{ position: 'relative', pr: 3, pb: 2.5, mb: 2, borderRight: '2px solid', borderColor: x.status === 'completed' ? 'success.main' : 'warning.main' }}><Box sx={{ position: 'absolute', right: -7, top: 0, width: 12, height: 12, borderRadius: '50%', bgcolor: x.status === 'completed' ? 'success.main' : 'warning.main' }} /><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={800}>{x.eventType}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(x.date)} • ثبت‌کننده: {personName(x.registeredBy)}</Typography></Box><Stack direction="row" spacing={1}><Chip size="small" label={x.priority} color={x.priority === 'بسیار بالا' ? 'error' : x.priority === 'بالا' ? 'warning' : 'default'} /><Chip size="small" label={x.stage} /><CustomerVisibilityBadge visible={x.customerVisible} /></Stack></Stack><Typography variant="body2" sx={{ mt: 1 }}>{x.description}</Typography><Typography variant="caption" color="text.secondary">پروژه: {projectLabel(x.projectId)} • شخص: {personName(x.personId)}</Typography>{x.result && <Typography variant="body2" color="success.main" sx={{ mt: .5 }}>نتیجه: {x.result}</Typography>}</Box>)}</Stack></CardContent></Card><EntityFormDialog open={open} onClose={() => setOpen(false)} title="ثبت رویداد پروژه" fields={[{ name: 'eventType', label: 'نوع رخداد', required: true }, { name: 'projectId', label: 'پروژه', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectLabel(x.id) })) }, { name: 'priority', label: 'اولویت', type: 'select', options: [{ value: 'عادی', label: 'عادی' }, { value: 'بالا', label: 'بالا' }, { value: 'بسیار بالا', label: 'بسیار بالا' }] }, { name: 'date', label: 'تاریخ', type: 'date' }, { name: 'description', label: 'توضیحات', type: 'textarea', required: true }, { name: 'customerVisible', label: 'قابل مشاهده برای مشتری', type: 'checkbox' }]} onSubmit={save} submitLabel="ثبت رخداد" /></Shell>;
}

export function DocumentsRepositoryPage() {
  return <ModernDocumentsRepositoryPage />;
}

function ModernDocumentsRepositoryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const section = params.get('section') ?? 'all';
  const view = params.get('view') ?? 'all';
  const [selected, setSelected] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [groupBy, setGroupBy] = useState('');
  const [records, setRecords] = useState(() => [...businessDocuments]);
  const sectionLabels = documentSectionLabels;
  const category = (id: string) => documentCategories.find((x) => x.id === id);
  const labelFor = (row: any) => row.projectId ? projectLabel(row.projectId) : row.customerId ? customerLabel(row.customerId) : row.employeeId ? personName(row.employeeId) : 'داخلی سازمان';
  const statusText: any = { draft: 'پیش‌نویس', open: 'ثبت شده', completed: 'تکمیل شده', archived: 'بایگانی شده', cancelled: 'لغو شده' };
  const rows = records.filter((row) => (section === 'all' || row.section === section) && (view === 'archive' ? row.status === 'archived' : view === 'followup' ? row.status !== 'completed' && row.status !== 'archived' && Boolean(row.dueDate) : view !== 'internal' || !row.customerVisible));
  const createFields = [
    { name: 'title', label: 'عنوان سند', required: true }, { name: 'documentNumber', label: 'شماره سند', required: true },
    { name: 'categoryId', label: 'نوع سند', type: 'select', required: true, options: documentCategories.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })) },
    { name: 'recordType', label: 'نوع مکاتبه', type: 'select', options: [{ value: 'incoming', label: 'وارده' }, { value: 'outgoing', label: 'صادره' }, { value: 'record', label: 'ثبت داخلی' }] },
    { name: 'projectId', label: 'پروژه (اختیاری)', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectLabel(x.id) })) },
    { name: 'customerId', label: 'مشتری (اختیاری)', type: 'select', options: customers.map((x) => ({ value: x.id, label: customerLabel(x.id) })) },
    { name: 'recipientId', label: 'دریافت‌کننده', type: 'select', options: users.map((x) => ({ value: x.id, label: x.name })) },
    { name: 'followUpId', label: 'مسئول پیگیری', type: 'select', options: users.map((x) => ({ value: x.id, label: x.name })) },
    { name: 'priority', label: 'اولویت', type: 'select', options: [{ value: 'low', label: 'عادی' }, { value: 'normal', label: 'متوسط' }, { value: 'high', label: 'بالا' }] },
    { name: 'dueDate', label: 'تاریخ سررسید', type: 'date' }, { name: 'followUpDate', label: 'تاریخ پیگیری', type: 'date' },
    { name: 'summary', label: 'شرح مختصر', type: 'textarea', required: true }, { name: 'documentUrl', label: 'لینک سند', direction: 'ltr' },
    { name: 'tags', label: 'برچسب‌ها (با ویرگول جدا کنید)' }, { name: 'customerVisible', label: 'قابل مشاهده برای مشتری', type: 'checkbox' },
  ];
  const save = (values: any) => {
    if (selected && editOpen) {
      const updated = { ...selected, title: values.title, documentNumber: values.documentNumber, categoryId: values.categoryId || selected.categoryId, recordType: values.recordType || selected.recordType, projectId: values.projectId || undefined, customerId: values.customerId || undefined, recipientId: values.recipientId || undefined, followUpId: values.followUpId || undefined, dueDate: values.dueDate || undefined, followUpDate: values.followUpDate || undefined, documentUrl: values.documentUrl || undefined, summary: values.summary, priority: values.priority || 'normal', tags: values.tags ? values.tags.split(',').map((x: string) => x.trim()).filter(Boolean) : selected.tags, customerVisible: values.customerVisible === 'true', updatedAt: new Date().toISOString() };
      documentRepository.update(updated.id, updated); setRecords((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setEditOpen(false); return;
    }
    const next = { id: `bd-new-${Date.now()}`, title: values.title, section: section === 'all' ? 'general' : section, recordType: values.recordType || 'record', categoryId: values.categoryId || 'cat-general', documentNumber: values.documentNumber, summary: values.summary, senderId: 'u1', recipientId: values.recipientId || undefined, followUpId: values.followUpId || undefined, projectId: values.projectId || undefined, customerId: values.customerId || undefined, dueDate: values.dueDate || undefined, followUpDate: values.followUpDate || undefined, documentUrl: values.documentUrl || undefined, status: 'open', stage: 'registered', priority: values.priority || 'normal', tags: values.tags ? values.tags.split(',').map((x: string) => x.trim()).filter(Boolean) : [], attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), customerVisible: values.customerVisible === 'true' };
    documentRepository.create(next); setRecords((current) => [next, ...current]); setCreateOpen(false);
  };
  const updateStatus = (nextStatus: string) => { if (!selected) return; const next = { ...selected, status: nextStatus, stage: nextStatus === 'completed' ? 'completed' : nextStatus === 'archived' ? 'archived' : 'follow_up', updatedAt: new Date().toISOString() }; setRecords((current) => current.map((x) => x.id === next.id ? next : x)); documentRepository.update(next.id, next); setSelected(next); };
  const summaryCards = [{ label: 'کل اسناد', value: records.length }, { label: 'فعال', value: records.filter((x) => x.status === 'open').length }, { label: 'نیازمند پیگیری', value: records.filter((x) => x.status === 'open' && x.dueDate).length }, { label: 'سررسید گذشته', value: records.filter((x) => x.status === 'open' && x.dueDate && new Date(x.dueDate) < new Date()).length }, { label: 'بایگانی', value: records.filter((x) => x.status === 'archived').length }];
  const groupsView = <DataTable rows={documentCategories.map((x) => ({ ...x, count: records.filter((r) => r.categoryId === x.id).length, state: 'فعال' }))} getRowId={(row) => row.id} searchPlaceholder="جستجوی گروه یا نوع سند..." csvFilename="document-groups.csv" columns={[{ key: 'name', label: 'نوع سند', value: (row) => row.name }, { key: 'group', label: 'گروه‌بندی', value: (row) => ({ project: 'اسناد پروژه‌ها', customer: 'اسناد مشتریان', contractor: 'اسناد پیمانکار', management: 'اسناد مدیریتی', general: 'اسناد عمومی', legal: 'اسناد حقوقی' } as any)[row.group] }, { key: 'code', label: 'کد', value: (row) => row.code }, { key: 'count', label: 'تعداد اسناد', value: (row) => row.count }, { key: 'state', label: 'وضعیت', value: (row) => row.state, render: () => <Chip size="small" color="success" label="فعال" /> }]} />;
  if (view === 'groups') return <Shell title="گروه‌بندی اسناد" subtitle="مدیریت نوع‌ها و کدهای استاندارد دبیرخانه"><Card sx={{ p: 1 }}>{groupsView}</Card></Shell>;
  return <Shell title="دبیرخانه" subtitle="ثبت، گردش، پیگیری و آرشیو مکاتبات سازمان" action={<Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>ایجاد سند</Button>}>
    {view === 'all' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5, mb: 2 }}>{summaryCards.map((x) => <Card key={x.label}><CardContent><Typography variant="caption" color="text.secondary">{x.label}</Typography><Typography variant="h5" fontWeight={800}>{x.value.toLocaleString('fa-IR')}</Typography></CardContent></Card>)}</Box>}
    <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>{[['all', 'همه اسناد'], ['internal', 'اسناد داخلی'], ['followup', 'پیگیری اسناد'], ['archive', 'آرشیو']].map(([key, label]) => <Button key={key} size="small" variant={view === key ? 'contained' : 'outlined'} onClick={() => navigate(`/documents?view=${key}${section !== 'all' ? `&section=${section}` : ''}`)}>{label}</Button>)}<FormControl size="small" sx={{ minWidth: 210 }}><InputLabel>بخش دبیرخانه</InputLabel><Select label="بخش دبیرخانه" value={section} onChange={(e) => navigate(`/documents?view=${view}&section=${e.target.value}`)}><MenuItem value="all">همه بخش‌ها</MenuItem>{Object.entries(sectionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl></Stack>
    <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی عنوان، شماره، نوع یا شرح..." onRowClick={setSelected} csvFilename="dabirkhane-documents.csv" groupBy={groupBy} onGroupByChange={setGroupBy} filters={[{ key: 'customerVisible', label: 'نمایش به مشتری', options: [{ value: 'visible', label: 'قابل مشاهده برای مشتری' }, { value: 'internal', label: 'داخلی' }], value: (row) => row.customerVisible ? 'visible' : 'internal' }, { key: 'status', label: 'وضعیت', options: Object.entries(statusText).map(([value, label]) => ({ value, label })), value: (row) => row.status }]} columns={[
      { key: 'title', label: 'عنوان', value: (row) => `${row.title} ${row.summary}`, render: (row) => <Box><Typography fontWeight={700}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{row.summary}</Typography></Box>, groupable: true },
      { key: 'number', label: 'شماره سند', value: (row) => row.documentNumber }, { key: 'type', label: 'نوع سند', value: (row) => category(row.categoryId)?.name || '—' }, { key: 'section', label: 'گروه', value: (row) => sectionLabels[row.section] || 'عمومی' }, { key: 'context', label: 'مورد مرتبط', value: labelFor }, { key: 'sender', label: 'ارسال‌کننده', value: (row) => personName(row.senderId) }, { key: 'recipient', label: 'دریافت‌کننده', value: (row) => personName(row.recipientId) }, { key: 'follow', label: 'مسئول پیگیری', value: (row) => personName(row.followUpId) }, { key: 'priority', label: 'اولویت', value: (row) => row.priority }, { key: 'due', label: 'سررسید', value: (row) => row.dueDate || '', render: (row) => row.dueDate ? formatDate(row.dueDate) : '—' }, { key: 'status', label: 'وضعیت', value: (row) => statusText[row.status] || row.status, render: (row) => <Chip size="small" color={row.status === 'completed' ? 'success' : row.status === 'archived' ? 'default' : 'warning'} label={statusText[row.status] || row.status} /> }, { key: 'visibility', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'بله' : 'خیر', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> }, { key: 'attachments', label: 'پیوست', value: (row) => row.attachments?.length || 0, render: (row) => `${row.attachments?.length || 0} فایل` },
    ]} /></Card>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md"><DialogTitle>{selected?.title}</DialogTitle><DialogContent dividers>{selected && <Stack spacing={1.25} sx={{ pt: 1 }}><Stack direction="row" spacing={1}><Chip label={category(selected.categoryId)?.name || 'سند'} /><Chip label={statusText[selected.status] || selected.status} color={selected.status === 'completed' ? 'success' : 'warning'} /><CustomerVisibilityBadge visible={selected.customerVisible} /></Stack><Typography><b>شماره:</b> {selected.documentNumber}</Typography><Typography><b>گروه:</b> {sectionLabels[selected.section] || 'عمومی'} • <b>مورد مرتبط:</b> {labelFor(selected)}</Typography><Typography><b>ارسال‌کننده:</b> {personName(selected.senderId)} • <b>دریافت‌کننده:</b> {personName(selected.recipientId)}</Typography><Typography><b>مسئول پیگیری:</b> {personName(selected.followUpId)} • <b>سررسید:</b> {selected.dueDate ? formatDate(selected.dueDate) : '—'}</Typography><Divider /><Typography>{selected.summary}</Typography>{selected.tags?.length > 0 && <Stack direction="row" spacing={.5}>{selected.tags.map((tag: string) => <Chip key={tag} size="small" label={tag} variant="outlined" />)}</Stack>}{selected.documentUrl && <Button href={selected.documentUrl} target="_blank">باز کردن لینک سند</Button>}<Divider /><Typography fontWeight={800}>تاریخچه سند</Typography><Typography variant="body2">{formatDateTime(selected.createdAt)} • سند ایجاد شد</Typography><Typography variant="body2">{formatDateTime(selected.updatedAt)} • آخرین بروزرسانی</Typography></Stack>}</DialogContent><DialogActions sx={{ flexWrap: 'wrap' }}><Button onClick={() => setEditOpen(true)}>ویرایش سند</Button>{selected?.status === 'open' && <Button color="success" onClick={() => updateStatus('completed')}>تکمیل سند</Button>}{selected?.status !== 'archived' && <Button onClick={() => updateStatus('archived')}>بایگانی</Button>}{selected?.status === 'archived' && <Button onClick={() => updateStatus('open')}>بازگردانی به فعال</Button>}<Button onClick={() => setSelected(null)}>بستن</Button></DialogActions></Dialog>
    <EntityFormDialog open={createOpen || editOpen} title={editOpen ? 'ویرایش سند' : `ایجاد سند در ${sectionLabels[section] || 'دبیرخانه عمومی'}`} fields={createFields} initialValues={editOpen && selected ? { ...selected, tags: selected.tags?.join(', ') } : {}} onClose={() => { setCreateOpen(false); setEditOpen(false); }} onSubmit={save} submitLabel={editOpen ? 'ذخیره تغییرات' : 'ثبت سند'} />
  </Shell>;
}

export function LegacyDocumentsRepositoryPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const sectionFromUrl = params.get('section'); const initialSection = sectionFromUrl && (sectionFromUrl === 'all' || documentSections.includes(sectionFromUrl as keyof typeof documentSectionLabels)) ? sectionFromUrl : 'all'; const [section, setSection] = useState(initialSection); const [q, setQ] = useState(''); const [type, setType] = useState('all'); const [selected, setSelected] = useState(null); const [createOpen, setCreateOpen] = useState(false); const [records, setRecords] = useState(businessDocuments);
  const sectionLabels = documentSectionLabels;
  useEffect(() => { const next = params.get('section'); setSection(next && (next === 'all' || documentSections.includes(next as keyof typeof documentSectionLabels)) ? next : 'all'); }, [sectionFromUrl]);
  const rows = records.filter((x) => (section === 'all' || x.section === section) && (type === 'all' || x.recordType === type) && `${x.title} ${x.documentNumber} ${x.summary}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  const createFields = [{ name: 'title', label: 'عنوان سند', required: true }, { name: 'recordType', label: 'نوع مکاتبه', type: 'select', options: [{ value: 'incoming', label: 'وارده' }, { value: 'outgoing', label: 'صادره' }, { value: 'record', label: 'ثبت داخلی' }] }, { name: 'documentNumber', label: 'شماره سند', required: true }, { name: 'summary', label: 'شرح مختصر', type: 'textarea', required: true }, { name: 'dueDate', label: 'تاریخ پیگیری', type: 'date' }, { name: 'priority', label: 'اولویت', type: 'select', options: [{ value: 'low', label: 'عادی' }, { value: 'normal', label: 'متوسط' }, { value: 'high', label: 'بالا' }] }];
  const save = (values) => { const next = { id: `bd-new-${Date.now()}`, title: values.title, section: section === 'all' ? 'general' : section, recordType: values.recordType || 'record', categoryId: section === 'projects' ? 'cat-minutes' : section === 'customers' ? 'cat-contract' : section === 'hr' ? 'cat-personnel' : 'cat-policy', documentNumber: values.documentNumber, summary: values.summary, senderId: 'u1', dueDate: values.dueDate || undefined, status: 'open', priority: values.priority || 'normal', tags: [], attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; businessDocuments.unshift(next); setRecords((current) => [next, ...current]); setCreateOpen(false); };
  const labelFor = (x) => x.section === 'projects' ? projectLabel(x.projectId) : x.section === 'customers' ? customerLabel(x.customerId) : x.section === 'hr' ? personName(x.employeeId) : 'داخلی سازمان';
  return <Shell title="دبیرخانه" subtitle="مکاتبات بخش‌بندی‌شده پروژه‌ها، مشتریان، امور مالی و منابع انسانی" action={<Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>سند جدید</Button>}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}><TextField fullWidth placeholder="جستجوی عنوان، شماره سند یا شرح..." value={q} onChange={(e) => setQ(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">⌕</InputAdornment> }} /><FormControl sx={{ minWidth: 210 }}><InputLabel>بخش دبیرخانه</InputLabel><Select label="بخش دبیرخانه" value={section} onChange={(e) => { setSection(e.target.value); navigate(`/documents?section=${e.target.value}`, { replace: true }); }}><MenuItem value="all">همه بخش‌های مجاز</MenuItem>{Object.entries(sectionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl sx={{ minWidth: 160 }}><InputLabel>نوع</InputLabel><Select label="نوع" value={type} onChange={(e) => setType(e.target.value)}><MenuItem value="all">همه انواع</MenuItem><MenuItem value="incoming">وارده</MenuItem><MenuItem value="outgoing">صادره</MenuItem><MenuItem value="record">ثبت داخلی</MenuItem></Select></FormControl></Stack><Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجو..." onRowClick={setSelected} columns={[{ key: 'title', label: 'عنوان', value: (row) => `${row.title} ${row.summary}`, render: (row) => <Box><Typography fontWeight={700}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{row.summary}</Typography></Box> }, { key: 'section', label: 'بخش', value: (row) => sectionLabels[row.section] ?? 'عمومی' }, { key: 'number', label: 'شماره سند', value: (row) => row.documentNumber }, { key: 'context', label: 'مورد مرتبط', value: (row) => labelFor(row) }, { key: 'type', label: 'نوع', value: (row) => row.recordType === 'incoming' ? 'وارده' : row.recordType === 'outgoing' ? 'صادره' : 'ثبت داخلی', render: (row) => <Chip size="small" label={row.recordType === 'incoming' ? 'وارده' : row.recordType === 'outgoing' ? 'صادره' : 'ثبت داخلی'} /> }, { key: 'due', label: 'موعد پیگیری', value: (row) => row.dueDate ?? '', render: (row) => row.dueDate ? formatDate(row.dueDate) : '—' }, { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => <Chip size="small" color={row.status === 'completed' ? 'success' : 'warning'} label={row.status === 'completed' ? 'تکمیل‌شده' : 'در حال پیگیری'} /> }]} /></Card><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md"><DialogTitle>{selected?.title}</DialogTitle><DialogContent>{selected && <Stack spacing={1.5} sx={{ pt: 1 }}><Typography><strong>بخش:</strong> {sectionLabels[selected.section] ?? 'عمومی'}</Typography><Typography><strong>شماره سند:</strong> {selected.documentNumber}</Typography><Typography><strong>مورد مرتبط:</strong> {labelFor(selected)}</Typography><Typography><strong>ارسال‌کننده:</strong> {personName(selected.senderId)} • <strong>مسئول پیگیری:</strong> {personName(selected.followUpId)}</Typography><Typography><strong>شرح:</strong> {selected.summary}</Typography><Divider /><Typography fontWeight={700}>پیوست‌ها</Typography>{selected.attachments.length ? selected.attachments.map((a) => <Chip key={a} icon={<AttachFile />} label={a} variant="outlined" onClick={() => navigate('/media')} />) : <Typography color="text.secondary">پیوستی ثبت نشده است.</Typography>}</Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>بستن</Button></DialogActions></Dialog><EntityFormDialog open={createOpen} title={`ایجاد سند در ${sectionLabels[section] ?? 'دبیرخانه عمومی'}`} fields={createFields} onClose={() => setCreateOpen(false)} onSubmit={save} submitLabel="ثبت سند" /></Shell>;
}

export function ChatPage() {
  const storageKey = 'trileez-chat-state-v1';
  const [chatParams] = useSearchParams();
  const [chat, setChat] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.conversations) && Array.isArray(parsed?.messages)) {
          const known = new Set(parsed.conversations.map((item) => item.id));
          return { conversations: [...parsed.conversations, ...conversations.filter((item) => !known.has(item.id)).map((item) => ({ ...item }))], messages: parsed.messages };
        }
      }
    } catch { /* ignore malformed prototype state */ }
    return { conversations: conversations.map((x) => ({ ...x })), messages: messages.map((x) => ({ ...x })) };
  });
  const [active, setActive] = useState(() => {
    const projectId = chatParams.get('project');
    const conversationId = chatParams.get('conversation');
    const personId = chatParams.get('person');
    const group = projectId ? chatGroups.find((item) => item.projectId === projectId && item.isDefault) : undefined;
    return chat.conversations.find((item) => item.id === conversationId)?.id ?? chat.conversations.find((item) => personId && item.participantIds.includes(personId) && item.participantIds.includes('u1') && item.participantIds.length === 2)?.id ?? chat.conversations.find((item) => group && item.groupId === group.id)?.id ?? chat.conversations[0]?.id ?? '';
  });
  const [draft, setDraft] = useState(''); const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false); const [groupOpen, setGroupOpen] = useState(false); const [personQuery, setPersonQuery] = useState(''); const [selectedPerson, setSelectedPerson] = useState(''); const [groupName, setGroupName] = useState(''); const [groupMembers, setGroupMembers] = useState(['u1']);
  const [profileOpen, setProfileOpen] = useState(false); const [attachment, setAttachment] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(chat)); } catch { /* storage is optional */ }
    window.dispatchEvent(new Event('trileez-chat-updated'));
  }, [chat]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...chat.conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).filter((c) => {
      const peer = c.participantIds.find((id) => id !== 'u1');
      const latest = [...chat.messages].filter((m) => m.conversationId === c.id).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
      const title = c.title ?? (c.participantIds.length > 2 ? `گروه ${c.participantIds.slice(0, 2).map((id) => personName(id)).join(' و ')}` : personName(peer));
      return (groupFilter === 'all' || c.groupId === groupFilter) && (!q || `${title} ${latest?.body ?? ''}`.toLowerCase().includes(q));
    });
  }, [chat, groupFilter, search]);
  const conversation = chat.conversations.find((c) => c.id === active) ?? visible[0] ?? chat.conversations[0];
  const thread = conversation ? [...chat.messages].filter((m) => m.conversationId === conversation.id).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()) : [];
  const other = conversation?.participantIds.find((id) => id !== 'u1');
  const isGroup = Boolean(conversation && (conversation.participantIds.length > 2 || conversation.title));
  const conversationTitle = conversation ? (conversation.title ?? (isGroup ? `گروه ${conversation.participantIds.filter((id) => id !== 'u1').slice(0, 2).map((id) => personName(id)).join(' و ')}` : personName(other))) : '';
  const otherUser = users.find((u) => u.id === other);
  const candidates = employees.filter((e) => e.id !== 'u1' && personName(e.id).includes(personQuery));

  const selectConversation = (id) => {
    setActive(id);
    setChat((prev) => ({ ...prev, conversations: prev.conversations.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c), messages: prev.messages.map((m) => m.conversationId === id ? { ...m, read: true } : m) }));
  };
  const sendMessage = () => {
    const body = draft.trim();
    if (!conversation || (!body && !attachment)) return;
    const now = new Date().toISOString();
    const message = { id: `msg-${Date.now()}`, conversationId: conversation.id, senderId: 'u1', body: body || 'پیوست ارسال شد.', sentAt: now, read: true, attachments: attachment ? [attachment] : [] };
    attachment && registerFile({ ...attachment, source: 'گفتگو', sourceId: conversation.id, uploadedAt: now, uploadedBy: 'u1', visibility: 'workspace', access: ['view', 'share'], context: { kind: 'conversation', id: conversation.id } });
    setChat((prev) => ({ messages: [...prev.messages, message], conversations: prev.conversations.map((c) => c.id === conversation.id ? { ...c, updatedAt: now } : c) }));
    const recipientIds = conversation.participantIds.filter((id) => id !== 'u1');
    recipientIds.forEach((recipientId) => notify({ id: `n-chat-${Date.now()}-${recipientId}`, title: `پیام جدید از ${personName('u1')}`, body: body || 'یک پیوست برای شما ارسال شد.', createdAt: now, type: 'chat', conversationId: conversation.id, projectId: conversation.projectId, recipientId, actorId: 'u1', entityType: 'conversation', entityId: conversation.id }));
    setDraft(''); setAttachment(null);
  };
  const createGroup = () => {
    if (!groupName.trim() || groupMembers.length < 2) return;
    const now = new Date().toISOString(); const id = `conv-group-${Date.now()}`;
    const next = { id, title: groupName.trim(), participantIds: Array.from(new Set(groupMembers)), unreadCount: 0, updatedAt: now, groupId: 'chat-general' };
    setChat((prev) => ({ ...prev, conversations: [next, ...prev.conversations] })); setActive(id); setGroupOpen(false); setGroupName(''); setGroupMembers(['u1']);
  };
  const onFile = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const base = { id: `att-${Date.now()}`, name: file.name, type: file.type || 'فایل', size: `${(file.size / 1024).toFixed(1)} کیلوبایت` };
    if (file.type.startsWith('image/')) {
      const reader = new FileReader(); reader.onload = () => setAttachment({ ...base, url: String(reader.result) }); reader.readAsDataURL(file);
    } else setAttachment(base);
    event.target.value = '';
  };
  const startConversation = () => {
    if (!selectedPerson) return;
    const now = new Date().toISOString();
    const existing = chat.conversations.find((c) => c.participantIds.includes(selectedPerson) && c.participantIds.includes('u1') && c.participantIds.length === 2);
    if (existing) selectConversation(existing.id);
    else {
      const next = { id: `conv-${Date.now()}`, participantIds: ['u1', selectedPerson], unreadCount: 0, updatedAt: now, groupId: 'chat-general' };
      setChat((prev) => ({ ...prev, conversations: [next, ...prev.conversations] })); setActive(next.id);
    }
    setNewOpen(false); setSelectedPerson(''); setPersonQuery('');
  };
  const projectCount = other ? projects.filter((p) => p.members?.includes(other) || p.managerId === other).length : 0;

  return <Shell title="گفتگوهای داخلی" subtitle="گفتگوهای مستقیم و گروهی اعضای سازمان و تیم‌های پروژه" action={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<GroupAdd />} onClick={() => setGroupOpen(true)}>گروه جدید</Button><Button variant="contained" startIcon={<PersonAdd />} onClick={() => setNewOpen(true)}>گفتگوی جدید</Button></Stack>}>
    <Card sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, minHeight: 620, overflow: 'hidden' }}>
      <Box sx={{ borderLeft: { md: '1px solid' }, borderColor: 'divider', bgcolor: '#fff' }}>
        <Box sx={{ p: 1.5, display: 'grid', gap: 1 }}><TextField size="small" fullWidth placeholder="جستجوی گفتگو یا پیام..." value={search} onChange={(e) => setSearch(e.target.value)} /><FormControl size="small"><InputLabel>گروه گفتگو</InputLabel><Select label="گروه گفتگو" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><MenuItem value="all">همه گروه‌ها</MenuItem>{chatGroups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}</Select></FormControl></Box>
        <Divider />
        {visible.length === 0 ? <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>گفتگویی پیدا نشد</Typography> : visible.map((c) => {
          const peer = c.participantIds.find((id) => id !== 'u1'); const latest = [...chat.messages].filter((m) => m.conversationId === c.id).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0]; const title = c.title ?? (c.participantIds.length > 2 ? `گروه ${c.participantIds.filter((id) => id !== 'u1').slice(0, 2).map((id) => personName(id)).join(' و ')}` : personName(peer));
          return <Box key={c.id} onClick={() => selectConversation(c.id)} sx={{ p: 1.5, cursor: 'pointer', bgcolor: c.id === conversation?.id ? 'action.selected' : 'transparent', borderBottom: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
            <Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{title.slice(0, 1)}</Box><Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={700} noWrap>{title}</Typography>{c.unreadCount > 0 && <Chip size="small" color="error" label={c.unreadCount} />}</Stack><Typography variant="caption" color="text.secondary" noWrap display="block">{latest?.body ?? 'هنوز پیامی ارسال نشده است'}</Typography></Box></Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5, mr: 6 }}>{chatGroups.find((group) => group.id === c.groupId)?.name ?? 'بدون گروه'} • {formatRelative(c.updatedAt)}</Typography>
          </Box>;
        })}
      </Box>
      {!conversation ? <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}><Typography color="text.secondary">یک گفتگو را برای شروع انتخاب کنید</Typography></Box> : <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer' }} onClick={() => setProfileOpen(true)}><Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ width: 42, height: 42, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{conversationTitle.slice(0, 1)}</Box><Box sx={{ flex: 1 }}><Typography fontWeight={800}>{conversationTitle}</Typography><Typography variant="caption" color="text.secondary">{isGroup ? `${conversation.participantIds.length} عضو` : (otherUser?.title ?? 'عضو سازمان')} • {isGroup ? 'گفتگوی گروهی' : (otherUser?.status === 'online' ? 'آنلاین' : 'آخرین فعالیت ثبت شده')}</Typography></Box><FormControl size="small" sx={{ minWidth: 150 }} onClick={(e) => e.stopPropagation()}><InputLabel>گروه</InputLabel><Select label="گروه" value={conversation.groupId ?? ''} onChange={(e) => setChat((prev) => ({ ...prev, conversations: prev.conversations.map((item) => item.id === conversation.id ? { ...item, groupId: e.target.value } : item) }))}>{chatGroups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}</Select></FormControl></Stack></Box>
        <Box sx={{ flex: 1, p: { xs: 1.5, md: 2.5 }, bgcolor: '#F8FAFC', overflowY: 'auto' }}>{thread.length === 0 ? <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 8 }}>هنوز پیامی در این گفتگو وجود ندارد</Typography> : thread.map((m) => <Box key={m.id} sx={{ mb: 1.5, display: 'flex', justifyContent: m.senderId === 'u1' ? 'flex-start' : 'flex-end' }}><Box sx={{ maxWidth: '78%', p: 1.5, bgcolor: m.senderId === 'u1' ? 'primary.main' : 'white', color: m.senderId === 'u1' ? 'white' : 'text.primary', borderRadius: 2, boxShadow: m.senderId === 'u1' ? 'none' : '0 1px 4px rgba(15,23,42,.08)' }}><Typography variant="caption" sx={{ display: 'block', fontWeight: 700, opacity: .8 }}>{isGroup ? personName(m.senderId) : ''}</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.body}</Typography>{m.attachments?.map((a) => a.url ? <Box key={a.id} component="img" src={a.url} alt={a.name} sx={{ display: 'block', maxWidth: 220, maxHeight: 160, borderRadius: 1.5, mt: 1 }} /> : <Chip key={a.id} icon={<InsertDriveFileOutlined />} label={`${a.name} (${a.size})`} sx={{ mt: 1, bgcolor: 'rgba(255,255,255,.16)', color: 'inherit' }} />)}<Stack direction="row" spacing={.5} alignItems="center" justifyContent="flex-end" sx={{ mt: .5, opacity: .72 }}><Typography variant="caption">{formatDateTime(m.sentAt)}</Typography>{m.senderId === 'u1' && <DoneAll sx={{ fontSize: 15 }} />}</Stack></Box></Box>)}</Box>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); sendMessage(); }} sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>{attachment && <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, p: .75, bgcolor: 'action.hover', borderRadius: 1.5, width: 'fit-content' }}><AttachFile fontSize="small" /><Typography variant="caption">{attachment.name}</Typography><IconButton size="small" onClick={() => setAttachment(null)}><Close fontSize="small" /></IconButton></Stack>}<Stack direction="row" spacing={1} alignItems="flex-end"><input hidden ref={fileRef} type="file" onChange={onFile} /><IconButton onClick={() => fileRef.current?.click()} aria-label="پیوست"><AttachFile /></IconButton><TextField fullWidth multiline maxRows={4} size="small" placeholder="پیام خود را بنویسید..." value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} /><Button type="submit" variant="contained" startIcon={<Send />} disabled={!draft.trim() && !attachment}>ارسال</Button></Stack></Box>
      </Box>}
    </Card>
    <Dialog open={newOpen} onClose={() => setNewOpen(false)} fullWidth maxWidth="sm"><DialogTitle>گفتگوی جدید</DialogTitle><DialogContent><TextField autoFocus fullWidth label="جستجوی کارمند" value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} sx={{ mt: 1, mb: 1.5 }} />{candidates.map((e) => <Box key={e.id} onClick={() => setSelectedPerson(e.id)} sx={{ p: 1.25, borderRadius: 1.5, cursor: 'pointer', bgcolor: selectedPerson === e.id ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}><Typography fontWeight={700}>{e.personnelCode} — {e.fullName}</Typography><Typography variant="caption" color="text.secondary">{e.jobTitle} • {e.department}</Typography></Box>)}{!candidates.length && <Typography color="text.secondary">کارمندی پیدا نشد</Typography>}</DialogContent><DialogActions><Button onClick={() => setNewOpen(false)}>انصراف</Button><Button variant="contained" onClick={startConversation} disabled={!selectedPerson}>شروع گفتگو</Button></DialogActions></Dialog>
    <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} fullWidth maxWidth="sm"><DialogTitle>گروه گفتگوی جدید</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus fullWidth label="نام گروه" value={groupName} onChange={(e) => setGroupName(e.target.value)} /><Typography variant="body2" color="text.secondary">اعضای گروه را انتخاب کنید</Typography>{employees.filter((e) => e.id !== 'u1').map((e) => <Box key={e.id} onClick={() => setGroupMembers((current) => current.includes(e.id) ? current.filter((id) => id !== e.id) : [...current, e.id])} sx={{ p: 1, borderRadius: 1.5, cursor: 'pointer', bgcolor: groupMembers.includes(e.id) ? 'action.selected' : 'transparent' }}><Typography fontWeight={700}>{e.personnelCode} — {e.fullName}</Typography><Typography variant="caption" color="text.secondary">{e.jobTitle} • {e.department}</Typography></Box>)}</Stack></DialogContent><DialogActions><Button onClick={() => setGroupOpen(false)}>انصراف</Button><Button variant="contained" onClick={createGroup} disabled={!groupName.trim() || groupMembers.length < 2}>ایجاد گروه</Button></DialogActions></Dialog>
    <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} fullWidth maxWidth="sm"><DialogTitle>اطلاعات مخاطب</DialogTitle><DialogContent>{other && <Stack spacing={1.25} sx={{ pt: 1 }}><Typography variant="h6" fontWeight={800}>{personName(other)}</Typography><Typography>{otherUser?.title ?? 'عضو سازمان'} • {employees.find((e) => e.id === other)?.department ?? '—'}</Typography><Typography>وضعیت همکاری: فعال</Typography><Typography>پروژه‌های مرتبط: {projectCount.toLocaleString('fa-IR')}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setProfileOpen(false)}>بستن</Button></DialogActions></Dialog>
  </Shell>;
}
