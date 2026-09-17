import { Add, Search } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputAdornment, InputLabel, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import { activityLogs, customers, goals, projects, tasks, timesheets, users } from '../mock/data.ts';
import { formatCurrency, formatDate, formatDateTime, getTimesheetStatusLabel, normalizeTimesheetStatus, timesheetBillingStatusLabel, timesheetBillingStatusOptions, timesheetStatusOptions } from '../utils/format.ts';
import { goalRepository, timesheetRepository } from '../services/repositories.ts';
import EntityFormDialog, { type EntityField } from '../components/common/EntityFormDialog.tsx';

const labels: Record<string, string> = { identified: 'شناسایی شده', following: 'در حال پیگیری', proposal: 'پیشنهاد ارسال شده', negotiating: 'در حال مذاکره', won: 'موفق', lost: 'ناموفق', in_progress: 'در حال اجرا', completed: 'تکمیل شده', overdue: 'عقب‌افتاده', cancelled: 'لغو شده', draft: 'پیش‌نویس', submitted: 'ارسال شده', approved: 'تایید شده', rejected: 'رد شده' };
const tone = (value: string) => ['won', 'completed', 'approved'].includes(value) ? 'success' : ['lost', 'overdue', 'rejected'].includes(value) ? 'error' : ['following', 'proposal', 'negotiating', 'submitted'].includes(value) ? 'warning' : 'default';
const customerName = (id: string) => customers.find((x) => x.id === id)?.company ?? '—';

function Header({ title, subtitle, onAdd, action, csv }: { title: string; subtitle: string; onAdd?: () => void; action?: React.ReactNode; csv?: React.ReactNode }) {
  void csv;
  // Active Supplemental pages use DataTable's built-in CSV/search toolbar.
  // Do not repeat CSV actions in the page header.
  return <PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>{action ?? <Button variant="contained" startIcon={<Add />} onClick={onAdd}>ایجاد مورد جدید</Button>}</Stack>} />;
}
function supplementalCsv(title: string): React.ReactNode {
  void title;
  return null;
  /*
  if (title === 'اهداف') return <CsvToolbar rows={goals} entityLabel={title} filename="goals.csv" columns={[{ key: 'title', label: 'هدف', value: (x) => x.title }, { key: 'owner', label: 'مسئول', value: (x) => users.find((u) => u.id === x.ownerId)?.name }, { key: 'period', label: 'دوره', value: (x) => x.period }, { key: 'progress', label: 'پیشرفت', value: (x) => x.progress }, { key: 'status', label: 'وضعیت', value: (x) => labels[x.status] ?? x.status }]} />;
  if (title === 'ساعات کاری') return <CsvToolbar rows={timesheets} entityLabel={title} filename="timesheets.csv" columns={[{ key: 'employee', label: 'کارمند', value: (x) => users.find((u) => u.id === x.employeeId)?.name }, { key: 'project', label: 'پروژه', value: (x) => projects.find((p) => p.id === x.projectId)?.name }, { key: 'date', label: 'تاریخ', value: (x) => x.date }, { key: 'hours', label: 'ساعت', value: (x) => x.hours }, { key: 'status', label: 'وضعیت', value: (x) => labels[x.status] ?? x.status }]} />;
  if (title === 'فعالیت‌ها') return <CsvToolbar rows={activityLogs} entityLabel={title} filename="activities.csv" columns={[{ key: 'action', label: 'فعالیت', value: (x) => x.action }, { key: 'timestamp', label: 'تاریخ', value: (x) => x.timestamp }, { key: 'user', label: 'کاربر', value: (x) => users.find((u) => u.id === x.userId)?.name }, { key: 'entity', label: 'موجودیت', value: (x) => `${x.entityType} / ${x.entityId}` }]} />;
  return null;*/
}
void supplementalCsv;
function SearchBar({ query, setQuery, children }: { query: string; setQuery: (x: string) => void; children?: React.ReactNode }) {
  return <Card sx={{ p: 2, mb: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}><TextField fullWidth placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />{children}</Stack></Card>;
}
function Stat({ title, value, color = 'text.primary' }: { title: string; value: string; color?: string }) { return <Card><CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h6" sx={{ fontWeight: 800, color, mt: .5 }}>{value}</Typography></CardContent></Card>; }
function CreateDialog({ open, onClose, title, fields = ['عنوان', 'توضیحات'], onSave }: { open: boolean; onClose: () => void; title: string; fields?: string[]; onSave?: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const submit = () => { if (!values[fields[0]]?.trim()) return; onSave?.(values); setValues({}); onClose(); };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{title}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{fields.map((field, index) => <TextField key={field} required={index === 0} label={field} value={values[field] ?? ''} onChange={(e) => setValues({ ...values, [field]: e.target.value })} multiline={field.includes('توضیحات') || field.includes('دلیل')} minRows={field.includes('توضیحات') || field.includes('دلیل') ? 2 : undefined} />)}</Stack></DialogContent><DialogActions><Button onClick={onClose}>انصراف</Button><Button variant="contained" disabled={!values[fields[0]]?.trim()} onClick={submit}>ذخیره</Button></DialogActions></Dialog>;
}

function ModernGoalsPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(() => goalRepository.list());
  useEffect(() => goalRepository.subscribe(setRows), []);
  const open = params.get('create') === '1';
  const close = () => setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true });
  const fields: EntityField[] = [
    { name: 'title', label: 'عنوان هدف', required: true },
    { name: 'ownerId', label: 'مسئول', type: 'select', required: true, options: users.map((user) => ({ value: user.id, label: user.name })) },
    { name: 'department', label: 'واحد' },
    { name: 'period', label: 'دوره', required: true },
    { name: 'target', label: 'مقدار هدف', type: 'number', required: true },
    { name: 'dueDate', label: 'موعد', type: 'date', required: true },
    { name: 'description', label: 'توضیحات', type: 'textarea' },
  ];
  const save = (values: Record<string, string>) => {
    goalRepository.create({ id: undefined, title: values.title, ownerId: values.ownerId, department: values.department || 'سازمانی', period: values.period, target: Number(values.target) || 0, current: 0, progress: 0, status: 'in_progress', dueDate: values.dueDate, description: values.description || '', createdAt: new Date().toISOString() });
    close();
  };
  return <Box><Header title="اهداف" subtitle="مدیریت اهداف تیمی و شاخص‌های عملکرد" onAdd={() => setParams((current) => { const next = new URLSearchParams(current); next.set('create', '1'); return next; }, { replace: true })} csv={<CsvToolbar rows={rows} entityLabel="اهداف" filename="goals.csv" columns={[{ key: 'title', label: 'هدف', value: (row) => row.title }, { key: 'owner', label: 'مسئول', value: (row) => users.find((user) => user.id === row.ownerId)?.name }, { key: 'progress', label: 'پیشرفت', value: (row) => row.progress }, { key: 'status', label: 'وضعیت', value: (row) => labels[row.status] ?? row.status }]} />} /><Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی عنوان هدف، مسئول یا واحد..." filters={[{ key: 'status', label: 'وضعیت', options: Object.entries(labels).filter(([key]) => ['in_progress', 'completed', 'overdue', 'cancelled'].includes(key)).map(([value, label]) => ({ value, label })), value: (row) => row.status }]} columns={[{ key: 'title', label: 'هدف', value: (row) => `${row.title} ${row.department}`, render: (row) => <Box><Typography sx={{ fontWeight: 700 }}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{row.department}</Typography></Box> }, { key: 'owner', label: 'مسئول', value: (row) => users.find((user) => user.id === row.ownerId)?.name ?? '—' }, { key: 'period', label: 'دوره', value: (row) => row.period }, { key: 'progress', label: 'پیشرفت', value: (row) => row.progress, aggregate: 'average', render: (row) => `${row.progress}٪` }, { key: 'dueDate', label: 'موعد', value: (row) => row.dueDate, render: (row) => formatDate(row.dueDate) }, { key: 'status', label: 'وضعیت', value: (row) => row.status, render: (row) => <Chip size="small" color={tone(row.status) as 'default'} label={labels[row.status] ?? row.status} /> }]} /></Card><EntityFormDialog open={open} onClose={close} title="ایجاد هدف" fields={fields} onSubmit={save} submitLabel="ثبت هدف" /></Box>;
}

function ModernTimesheetsPage() {
  const [rows, setRows] = useState(timesheetRepository.list());
  useEffect(() => timesheetRepository.subscribe(setRows), []);
  return <Box><Header title="ساعات کاری" subtitle="ثبت و بررسی زمان صرف‌شده روی پروژه‌ها و وظایف" csv={<CsvToolbar rows={rows} entityLabel="ساعات کاری" filename="timesheets.csv" columns={[
    { key: 'employee', label: 'کارمند', value: (row) => users.find((user) => user.id === row.employeeId)?.name },
    { key: 'project', label: 'پروژه', value: (row) => projects.find((project) => project.id === row.projectId)?.name },
    { key: 'date', label: 'تاریخ', value: (row) => row.date },
    { key: 'hours', label: 'ساعت', value: (row) => row.hours },
    { key: 'status', label: 'وضعیت کار', value: (row) => getTimesheetStatusLabel(row.status) },
    { key: 'billingStatus', label: 'وضعیت مالی', value: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'] },
  ]} />} /><Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(row) => row.id} searchPlaceholder="جستجوی کارمند، پروژه یا وظیفه..." filters={[
    { key: 'status', label: 'وضعیت کار', options: timesheetStatusOptions, value: (row) => normalizeTimesheetStatus(row.status) },
    { key: 'billingStatus', label: 'وضعیت مالی', options: timesheetBillingStatusOptions, value: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'] },
    { key: 'customerVisible', label: 'نمایش به مشتری', options: [{ value: 'visible', label: 'قابل مشاهده برای مشتری' }, { value: 'internal', label: 'داخلی' }], value: (row) => row.customerVisible ? 'visible' : 'internal' },
  ]} columns={[
    { key: 'employee', label: 'کارمند', value: (row) => users.find((user) => user.id === row.employeeId)?.name ?? '—' },
    { key: 'project', label: 'پروژه', value: (row) => projects.find((project) => project.id === row.projectId)?.name ?? '—', groupable: true },
    { key: 'task', label: 'وظیفه', value: (row) => tasks.find((task) => task.id === row.taskId)?.title ?? '—' },
    { key: 'date', label: 'تاریخ', value: (row) => row.date, render: (row) => formatDate(row.date) },
    { key: 'hours', label: 'ساعت', value: (row) => row.hours, aggregate: 'sum', render: (row) => `${row.hours} ساعت` },
    { key: 'cost', label: 'هزینه', value: (row) => row.calculatedCost ?? row.hours * (row.hourlyRate ?? 200000), aggregate: 'sum', render: (row) => formatCurrency(row.calculatedCost ?? row.hours * (row.hourlyRate ?? 200000)) },
    { key: 'status', label: 'وضعیت کار', value: (row) => row.status, render: (row) => <Select size="small" value={row.status} onChange={(event) => timesheetRepository.update(row.id, { status: event.target.value as typeof row.status })} sx={{ minWidth: 160 }}>{timesheetStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select> },
    { key: 'billingStatus', label: 'وضعیت مالی', value: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'], render: (row) => <Chip size="small" color={row.billingStatus === 'paid' ? 'success' : row.billingStatus === 'suspended' ? 'default' : 'warning'} label={timesheetBillingStatusLabel[row.billingStatus ?? 'suspended']} /> },
    { key: 'customerVisible', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <Checkbox size="small" checked={Boolean(row.customerVisible)} onChange={(event) => timesheetRepository.update(row.id, { customerVisible: event.target.checked })} onClick={(event) => event.stopPropagation()} slotProps={{ input: { 'aria-label': row.customerVisible ? 'مخفی کردن از مشتری' : 'نمایش برای مشتری' } }} /> },
  ]} /></Card></Box>;
}

function ModernActivitiesPage() {
  return <Box><Header title="فعالیت‌ها" subtitle="گزارش رویدادها و ردپای تغییرات فضای کاری" csv={<CsvToolbar rows={activityLogs} entityLabel="فعالیت‌ها" filename="activities.csv" columns={[{ key: 'action', label: 'فعالیت', value: (row) => row.action }, { key: 'timestamp', label: 'تاریخ', value: (row) => row.timestamp }, { key: 'user', label: 'کاربر', value: (row) => users.find((user) => user.id === row.userId)?.name }]} />} /><Card sx={{ p: 1 }}><DataTable rows={activityLogs} getRowId={(row) => row.id} searchPlaceholder="جستجوی فعالیت، کاربر یا IP..." columns={[{ key: 'action', label: 'فعالیت', value: (row) => `${row.action} ${row.description}`, render: (row) => <Box><Typography sx={{ fontWeight: 700 }}>{row.action}</Typography><Typography variant="body2" color="text.secondary">{row.description}</Typography></Box> }, { key: 'timestamp', label: 'تاریخ و زمان', value: (row) => row.timestamp, render: (row) => formatDateTime(row.timestamp), sortable: true }, { key: 'user', label: 'کاربر', value: (row) => users.find((user) => user.id === row.userId)?.name ?? '—' }, { key: 'entity', label: 'موجودیت', value: (row) => `${row.entityType} / ${row.entityId}` }, { key: 'ip', label: 'IP', value: (row) => row.ip }]} /></Card></Box>;
}

export function GoalsPage() { return <ModernGoalsPage />; }
export function TimesheetsPage() { return <ModernTimesheetsPage />; }
export function ActivitiesPage() { return <ModernActivitiesPage />; }

export function LegacyGoalsPage() {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [open, setOpen] = useState(false); const rows = goals.filter((x) => `${x.title} ${x.department}`.includes(query.trim()) && (status === 'all' || x.status === status));
  return <Box><Header title="اهداف" subtitle="مدیریت اهداف تیمی و شاخص‌های عملکرد" onAdd={() => setOpen(true)} /><Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, mb: 2 }}><Stat title="کل اهداف" value={`${goals.length}`} /><Stat title="در حال اجرا" value={`${goals.filter((x) => x.status === 'in_progress').length}`} color="warning.main" /><Stat title="تکمیل‌شده" value={`${goals.filter((x) => x.status === 'completed').length}`} color="success.main" /><Stat title="عقب‌افتاده" value={`${goals.filter((x) => x.status === 'overdue').length}`} color="error.main" /></Box><SearchBar query={query} setQuery={setQuery}><FormControl sx={{ minWidth: 180 }}><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value)}><MenuItem value="all">همه وضعیت‌ها</MenuItem>{['in_progress', 'completed', 'overdue', 'cancelled'].map((x) => <MenuItem key={x} value={x}>{labels[x]}</MenuItem>)}</Select></FormControl></SearchBar><Card><Table><TableHead><TableRow>{['هدف', 'مسئول', 'دوره', 'پیشرفت', 'مقدار فعلی / هدف', 'موعد', 'وضعیت'].map((x) => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id}><TableCell><Typography sx={{ fontWeight: 700 }}>{x.title}</Typography><Typography variant="caption" color="text.secondary">{x.department}</Typography></TableCell><TableCell>{users.find((u) => u.id === x.ownerId)?.name}</TableCell><TableCell>{x.period}</TableCell><TableCell sx={{ minWidth: 140 }}><LinearProgress variant="determinate" value={x.progress} sx={{ height: 8, borderRadius: 99, mb: .5 }} />{x.progress}٪</TableCell><TableCell>{formatCurrency(x.current)} / {formatCurrency(x.target)}</TableCell><TableCell>{formatDate(x.dueDate)}</TableCell><TableCell><Chip size="small" color={tone(x.status) as 'default'} label={labels[x.status]} /></TableCell></TableRow>)}</TableBody></Table></Card><CreateDialog open={open} onClose={() => setOpen(false)} title="هدف جدید" /></Box>;
}

export function LegacyTimesheetsPage() {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const rows = timesheets.filter((x) => { const project = projects.find((p) => p.id === x.projectId); const task = tasks.find((t) => t.id === x.taskId); return `${project?.name} ${task?.title} ${users.find((u) => u.id === x.employeeId)?.name}`.includes(query.trim()) && (status === 'all' || x.status === status); }); const weekHours = rows.reduce((s, x) => s + x.hours, 0);
  return <Box><Header title="ثبت ساعات کاری" subtitle="ثبت و بررسی زمان صرف‌شده روی پروژه‌ها و وظایف" /><Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5,1fr)' }, mb: 2 }}><Stat title="ساعات این هفته" value={`${weekHours} ساعت`} /><Stat title="قابل صورتحساب" value={`${rows.filter((x) => x.billable).reduce((s, x) => s + x.hours, 0)} ساعت`} color="success.main" /><Stat title="تایید شده" value={`${rows.filter((x) => x.status === 'approved').reduce((s, x) => s + x.hours, 0)} ساعت`} /><Stat title="هزینه نیروی انسانی" value={formatCurrency(rows.reduce((s, x) => s + (x.calculatedCost ?? x.hours * (x.hourlyRate ?? 200_000)), 0))} color="warning.main" /><Stat title="در صف بررسی" value={`${rows.filter((x) => normalizeTimesheetStatus(x.status) === 'pending_review').reduce((s, x) => s + x.hours, 0)} ساعت`} color="warning.main" /></Box><SearchBar query={query} setQuery={setQuery}><FormControl sx={{ minWidth: 180 }}><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={status} onChange={(e) => setStatus(e.target.value)}><MenuItem value="all">همه وضعیت‌ها</MenuItem>{timesheetStatusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl></SearchBar><Card><Table><TableHead><TableRow>{['کارمند', 'تاریخ', 'پروژه / مشتری', 'وظیفه', 'ساعت', 'نرخ ساعتی', 'هزینه', 'قابل صورتحساب', 'وضعیت', 'توضیحات'].map((x) => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{rows.slice(0, 40).map((x) => { const project = projects.find((p) => p.id === x.projectId); const rate = x.hourlyRate ?? 200_000; const cost = x.calculatedCost ?? x.hours * rate; return <TableRow hover key={x.id}><TableCell>{users.find((u) => u.id === x.employeeId)?.name}</TableCell><TableCell>{formatDate(x.date)}</TableCell><TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{project?.name}</Typography><Typography variant="caption" color="text.secondary">{customerName(project?.customerId ?? '')}</Typography></TableCell><TableCell>{tasks.find((t) => t.id === x.taskId)?.title}</TableCell><TableCell>{x.hours} ساعت</TableCell><TableCell>{formatCurrency(rate)}</TableCell><TableCell sx={{ fontWeight: 700 }}>{formatCurrency(cost)}</TableCell><TableCell>{x.billable ? 'بله' : 'خیر'}</TableCell><TableCell><Chip size="small" color={tone(normalizeTimesheetStatus(x.status)) as 'default'} label={getTimesheetStatusLabel(x.status)} /></TableCell><TableCell>{x.description}</TableCell></TableRow>; })}</TableBody></Table></Card></Box>;
}

export function LegacyActivitiesPage() {
  const [query, setQuery] = useState(''); const [entity, setEntity] = useState('all'); const [selected, setSelected] = useState<typeof activityLogs[number] | null>(null); const rows = activityLogs.filter((x) => `${x.action} ${x.description} ${x.ip}`.includes(query.trim()) && (entity === 'all' || x.entityType === entity)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return <Box><Header title="فعالیت‌ها" subtitle="گزارش رویدادها و ردپای تغییرات فضای کاری" /><SearchBar query={query} setQuery={setQuery}><FormControl sx={{ minWidth: 190 }}><InputLabel>نوع موجودیت</InputLabel><Select label="نوع موجودیت" value={entity} onChange={(e) => setEntity(e.target.value)}><MenuItem value="all">همه فعالیت‌ها</MenuItem>{['auth', 'customer', 'invoice', 'payment', 'project', 'task', 'ticket'].map((x) => <MenuItem key={x} value={x}>{x === 'auth' ? 'ورود و خروج' : labels[x] ?? x}</MenuItem>)}</Select></FormControl></SearchBar><Card><Table><TableHead><TableRow><TableCell>فعالیت</TableCell><TableCell>تاریخ و زمان</TableCell><TableCell>کاربر</TableCell></TableRow></TableHead><TableBody>{rows.map((x) => <TableRow hover key={x.id} onClick={() => setSelected(x)} sx={{ cursor: 'pointer' }}><TableCell><Typography sx={{ fontWeight: 700 }}>{x.action}</Typography><Typography variant="body2" color="text.secondary">{x.description}</Typography></TableCell><TableCell>{formatDateTime(x.timestamp)}</TableCell><TableCell>{users.find((u) => u.id === x.userId)?.name}</TableCell></TableRow>)}</TableBody></Table><TablePagination component="div" count={rows.length} page={0} rowsPerPage={10} onPageChange={() => undefined} onRowsPerPageChange={() => undefined} labelRowsPerPage="تعداد در صفحه" /></Card><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>جزئیات فعالیت</DialogTitle><DialogContent>{selected && <Stack spacing={1.5}><Typography><strong>نوع:</strong> {selected.action}</Typography><Typography><strong>کاربر:</strong> {users.find((u) => u.id === selected.userId)?.name}</Typography><Typography><strong>تاریخ:</strong> {formatDateTime(selected.timestamp)}</Typography><Typography><strong>موجودیت:</strong> {selected.entityType} / {selected.entityId}</Typography><Typography><strong>IP:</strong> {selected.ip}</Typography><Typography><strong>توضیحات:</strong> {selected.description}</Typography><Typography><strong>متادیتا:</strong> {selected.metadata}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>بستن</Button></DialogActions></Dialog></Box>;
}
