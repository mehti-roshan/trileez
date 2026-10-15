import { Download, MarkEmailRead, Search, Visibility, UploadFile, GridView, ViewList, DeleteOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import QuickCreateDialog from '../components/common/QuickCreateDialog.tsx';
import { tasks, users } from '../services/repositories.ts';
import { candidateRepository, jobOpeningRepository, notificationRepository } from '../services/repositories.ts';
import { formatDate, formatRelative } from '../utils/format.ts';
import DataTable, { type DataTableColumn } from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { canAccessFile, downloadStoredFile, listFiles, persistFileUpdate, uploadStoredFile, type FileMetadata } from '../services/fileService.ts';
import { useApp } from '../context/AppContext.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { candidateMeetingResultLabels } from '../utils/recruitment.ts';

const knowledge: Array<{ id: string; title: string; category: string; status: string; authorId: string; views: number; updatedAt: string }> = [];
type ReminderRow = { id: string; title: string; type: string; dueDate: string; owner: string; done: boolean; detail?: string; to?: string };
const announcements: Array<{ id: string; title: string; body: string; audience: string; createdAt: string; pinned: boolean }> = [];

function Shell({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  const fields = title === 'یادآورها' ? ['عنوان یادآور', 'نوع یادآور', 'موعد', 'مسئول', 'توضیحات'] : title === 'پایگاه دانش' ? ['عنوان مقاله', 'دسته‌بندی', 'نویسنده', 'خلاصه مقاله'] : title === 'رسانه' ? ['نام فایل', 'نوع فایل', 'توضیحات'] : title === 'اطلاعیه‌ها' ? ['عنوان اطلاعیه', 'مخاطبان', 'متن اطلاعیه'] : ['عنوان', 'توضیحات'];
  return <Box><PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={action ?? <QuickCreateDialog title={`ایجاد ${title}`} fields={fields} />} />{children}</Box>;
}
function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <TextField fullWidth placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />;
}

export function RemindersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams(); const [view, setView] = useState(params.get('view') ?? 'all');
  const [candidateRows, setCandidateRows] = useState(() => candidateRepository.list());
  const [recruitmentRows, setRecruitmentRows] = useState(() => jobOpeningRepository.list());
  useEffect(() => candidateRepository.subscribe(setCandidateRows), []);
  useEffect(() => jobOpeningRepository.subscribe(setRecruitmentRows), []);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const recruitmentReminders: ReminderRow[] = candidateRows.flatMap((candidate) => candidate.meetings.map((meeting) => ({ id: `recruitment-${candidate.id}-${meeting.id}`, title: `جلسه استخدام با ${candidate.fullName}`, type: 'جلسه استخدام', dueDate: meeting.date, owner: users.find((user) => user.id === candidate.ownerId)?.name ?? '—', done: false, detail: `${recruitmentRows.find((job) => job.id === candidate.jobId)?.title ?? 'موقعیت استخدامی'} • ${candidateMeetingResultLabels[meeting.result]}`, to: `/hr/recruitment/${candidate.jobId}` })));
  const taskReminders: ReminderRow[] = tasks.filter((task) => task.status !== 'done').slice(0, 8).map((task) => ({ id: task.id, title: task.title, type: 'موعد کار', dueDate: task.dueDate, owner: users.find((u) => u.id === task.assigneeId)?.name ?? '—', done: false, to: `/tasks/${task.id}` }));
  const reminders = [...recruitmentReminders, ...taskReminders];
  const rows = reminders.filter((x) => {
    const matchesView = view === 'all' || (view === 'done' ? x.done : view === 'today' ? !x.done && x.dueDate === today : !x.done && x.dueDate > today);
    return matchesView;
  });
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'title', label: 'یادآور', value: (row) => row.title, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.title}</Typography> },
    { key: 'type', label: 'نوع', value: (row) => row.type, groupable: true },
    { key: 'detail', label: 'جزئیات', value: (row) => row.detail ?? '—' },
    { key: 'owner', label: 'مسئول', value: (row) => row.owner },
    { key: 'dueDate', label: 'موعد', value: (row) => row.dueDate, render: (row) => formatDate(row.dueDate) },
    { key: 'status', label: 'وضعیت', value: (row) => row.done ? 'done' : 'pending', render: (row) => <Chip size="small" color={row.done ? 'success' : 'warning'} label={row.done ? 'انجام‌شده' : 'در انتظار اقدام'} /> },
  ];
  const csvColumns = columns.map(({ key, label, value }) => ({ key, label, value: value ?? (() => '') }));
  return <Shell title="یادآورها" subtitle="پیگیری کارها، جلسات استخدام، قراردادها و تعهدات نزدیک" action={<FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>نمایش</InputLabel><Select label="نمایش" value={view} onChange={(e) => setView(e.target.value)}><MenuItem value="all">همه یادآورها</MenuItem><MenuItem value="today">امروز</MenuItem><MenuItem value="upcoming">آینده</MenuItem><MenuItem value="done">انجام‌شده</MenuItem></Select></FormControl>}><Card sx={{ p: 1 }}><DataTable rows={rows} columns={columns} getRowId={(row) => row.id} onRowClick={(row) => { if (row.to) navigate(row.to); }} searchPlaceholder="جستجوی یادآور، نوع یا مسئول..." filters={[{ key: 'status', label: 'وضعیت', options: [{ value: 'pending', label: 'در انتظار اقدام' }, { value: 'done', label: 'انجام‌شده' }], value: (row) => row.done ? 'done' : 'pending' }]} toolbar={<CsvToolbar rows={rows} entityLabel="یادآورها" filename="reminders.csv" columns={csvColumns} />} /></Card></Shell>;
}

export function KnowledgePage() {
  const [query, setQuery] = useState(''); const rows = knowledge.filter((x) => `${x.title} ${x.category}`.includes(query));
  return <Shell title="پایگاه دانش" subtitle="این ماژول در MVP داخلی فعال نشده است" action={<></>}><Alert severity="warning" sx={{ mb: 2 }}>پایگاه دانش هنوز مدل و گردش کار backend ندارد؛ ایجاد و ویرایش مقاله در این نسخه غیرفعال است.</Alert><Card sx={{ p: 2, mb: 2 }}><SearchBox value={query} onChange={setQuery} placeholder="جستجو در مقالات..." /></Card>{rows.length ? <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>{rows.map((x) => <Card key={x.id}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Chip size="small" label={x.category} /><Chip size="small" color={x.status === 'published' ? 'success' : 'warning'} label={x.status === 'published' ? 'منتشرشده' : x.status === 'draft' ? 'پیش‌نویس' : 'در بازبینی'} /></Stack><Typography sx={{ fontWeight: 800, mt: 1.5 }}>{x.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>نویسنده: {users.find((u) => u.id === x.authorId)?.name} • {x.views} بازدید</Typography><Typography variant="caption" color="text.secondary">آخرین بروزرسانی: {formatDate(x.updatedAt)}</Typography></CardContent></Card>)}</Box> : <Alert severity="info">داده‌ای نمایش داده نمی‌شود؛ این بخش عمداً خارج از محدوده MVP است.</Alert>}</Shell>;
}

export function MediaPage() {
  const { user } = useApp();
  const [files, setFiles] = useState<FileMetadata[]>(() => listFiles().filter((file) => !file.deletedAt));
  const [selected, setSelected] = useState<FileMetadata | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [folder, setFolder] = useState('همه فایل‌ها');
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = '';
    const metadata = await uploadStoredFile(file, { visibility: 'workspace', customerVisible: false });
    setFiles((current) => [metadata, ...current.filter((item) => item.id !== metadata.id)]);
  };
  const download = (file: FileMetadata) => downloadStoredFile(file);
  const remove = async (file: FileMetadata) => { await persistFileUpdate(file.id, { deletedAt: new Date().toISOString() }); setFiles((current) => current.filter((item) => item.id !== file.id)); };
  const visible = files.filter((file) => canAccessFile(user, file)).filter((file) => folder === 'همه فایل‌ها' || (file.context?.kind === 'project' && folder === 'پروژه‌ها'));
  const ownerName = (id: string) => users.find((item) => item.id === id)?.name ?? 'کاربر سازمان';
  const columns: DataTableColumn<FileMetadata>[] = [
    { key: 'name', label: 'نام فایل', value: (row) => row.name, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography> },
    { key: 'type', label: 'نوع', value: (row) => row.type, render: (row) => <Chip size="small" label={row.type.startsWith('image') ? 'تصویر' : row.type.includes('pdf') ? 'PDF' : 'فایل'} /> },
    { key: 'size', label: 'حجم', value: (row) => row.size },
    { key: 'owner', label: 'بارگذاری‌کننده', value: (row) => ownerName(row.uploadedBy) },
    { key: 'source', label: 'منبع', value: (row) => row.source ?? (row.context?.kind === 'conversation' ? 'گفتگو' : 'فضای کاری') },
    { key: 'access', label: 'دسترسی', value: (row) => row.visibility === 'workspace' ? 'فضای کاری' : 'خصوصی' },
    { key: 'customerVisible', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> },
    { key: 'actions', label: 'عملیات', sortable: false, searchable: false, render: (row) => <Stack direction="row" spacing={.5}><Button size="small" startIcon={<Visibility />} onClick={(event) => { event.stopPropagation(); setSelected(row); }}>مشاهده</Button><Button size="small" startIcon={<Download />} onClick={(event) => { event.stopPropagation(); void download(row); }}>دریافت</Button></Stack> },
  ];
  return <Shell title="رسانه" subtitle="فایل‌های قابل دسترس و دارایی‌های مشترک فضای کاری" action={<Stack direction="row" spacing={1}><Button component="label" variant="contained" startIcon={<UploadFile />}>بارگذاری فایل<input hidden type="file" onChange={upload} /></Button><Button variant="outlined" startIcon={viewMode === 'list' ? <GridView /> : <ViewList />} onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>{viewMode === 'list' ? 'نمایش شبکه‌ای' : 'نمایش فهرستی'}</Button></Stack>}><Card sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}><Button variant={folder === 'همه فایل‌ها' ? 'contained' : 'outlined'} onClick={() => setFolder('همه فایل‌ها')}>همه فایل‌ها</Button><Button variant={folder === 'پروژه‌ها' ? 'contained' : 'outlined'} onClick={() => setFolder('پروژه‌ها')}>فایل‌های پروژه‌ها</Button></Stack>{viewMode === 'list' ? <DataTable rows={visible} columns={columns} getRowId={(row) => row.id} searchPlaceholder="جستجو در نام فایل، نوع یا بارگذاری‌کننده..." onRowClick={setSelected} /> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1.5 }}>{visible.map((file) => <Card key={file.id} variant="outlined" onClick={() => setSelected(file)} sx={{ cursor: 'pointer', p: 1.5 }}><Box sx={{ height: 90, bgcolor: file.type.startsWith('image') ? 'primary.50' : 'grey.100', borderRadius: 1, display: 'grid', placeItems: 'center', mb: 1 }}>{file.type.startsWith('image') && file.url ? <Box component="img" src={file.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }} /> : <Typography variant="h5">{file.type.includes('pdf') ? 'PDF' : 'FILE'}</Typography>}</Box><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{file.name}</Typography><Typography variant="caption" color="text.secondary">{file.size}</Typography><Stack direction="row" spacing={.5} sx={{ mt: .5 }}><Button size="small" onClick={(e) => { e.stopPropagation(); setSelected(file); }}><Visibility fontSize="small" /></Button><Button size="small" onClick={(e) => { e.stopPropagation(); void download(file); }}><Download fontSize="small" /></Button><Button size="small" onClick={(e) => { e.stopPropagation(); void remove(file); }}><DeleteOutlined fontSize="small" /></Button></Stack></Card>)}</Box>}</Card><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>{selected?.name}</DialogTitle><DialogContent>{selected?.type.startsWith('image') && selected?.url ? <Box component="img" src={selected.url} alt={selected.name} sx={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 2 }} /> : <Alert severity="info">پیش‌نمایش این نوع فایل در مرورگر در دسترس نیست. اطلاعات فایل و امکان دریافت از سرور در دسترس است.</Alert>}{selected && <Stack spacing={.5} sx={{ mt: 2 }}><Typography variant="body2">نوع فایل: {selected.type}</Typography><Typography variant="body2">حجم: {selected.size}</Typography><Typography variant="body2">بارگذاری‌کننده: {ownerName(selected.uploadedBy)}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>بستن</Button>{selected && <Button variant="contained" startIcon={<Download />} onClick={() => void download(selected)}>دریافت فایل</Button>}</DialogActions></Dialog></Shell>;
}

export function ExportsPage() {
  return <Shell title="برون‌بری گروهی" subtitle="خروجی‌های زمان‌بر و PDF در این MVP فعال نشده‌اند" action={<></>}><Alert severity="warning">این صفحه قبلاً یک فایل CSV نمایشی تولید می‌کرد که حاوی داده واقعی نبود. برای جلوگیری از برداشت اشتباه، خروجی گروهی تا اتصال UI به job/report backend غیرفعال شده است. خروجی CSV واقعی همچنان در جدول‌های هر بخش در دسترس است.</Alert></Shell>;
}

export function AnnouncementsPage() { return <Shell title="اطلاعیه‌ها" subtitle="این ماژول در MVP داخلی فعال نشده است" action={<></>}><Alert severity="warning" sx={{ mb: 2 }}>اطلاعیه‌ها هنوز repository و گردش کار backend ندارند؛ ایجاد اطلاعیه در این نسخه غیرفعال است.</Alert><Stack spacing={2}>{announcements.length ? announcements.map((x) => <Card key={x.id}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Box><Typography sx={{ fontWeight: 800 }}>{x.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{x.body}</Typography></Box>{x.pinned && <Chip size="small" color="primary" label="مهم" />}</Stack><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{x.audience} • {formatDate(x.createdAt)}</Typography></CardContent></Card>) : <Alert severity="info">داده‌ای نمایش داده نمی‌شود؛ این بخش عمداً خارج از محدوده MVP است.</Alert>}</Stack></Shell>; }

export function NotificationPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => notificationRepository.list());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  useEffect(() => notificationRepository.subscribe(setItems), []);
  const unread = items.filter((x) => !x.read).length;
  const markAllRead = () => { items.forEach((item) => notificationRepository.update(item.id, { read: true })); };
  const markRead = (id: string) => { notificationRepository.update(id, { read: true }); };
  const visible = items.filter((x) => (filter === 'all' || (filter === 'unread' ? !x.read : x.type === filter)) && (!query || `${x.title} ${x.body}`.includes(query)));
  return <Shell title="اعلان‌ها" subtitle={`${unread} اعلان خوانده‌نشده`} action={<Button variant="outlined" startIcon={<MarkEmailRead />} onClick={markAllRead}>خواندن همه</Button>}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}><TextField fullWidth placeholder="جستجوی اعلان..." value={query} onChange={(e) => setQuery(e.target.value)} /><FormControl sx={{ minWidth: 180 }}><InputLabel>نمایش</InputLabel><Select label="نمایش" value={filter} onChange={(e) => setFilter(e.target.value)}><MenuItem value="all">همه اعلان‌ها</MenuItem><MenuItem value="unread">خوانده‌نشده</MenuItem><MenuItem value="task_assigned">وظایف</MenuItem><MenuItem value="chat">گفتگوها</MenuItem><MenuItem value="ticket">تیکت‌ها</MenuItem><MenuItem value="project">پروژه‌ها</MenuItem><MenuItem value="document">اسناد</MenuItem></Select></FormControl></Stack><Stack spacing={1.5}>{visible.length ? visible.map((x) => <Card key={x.id} onClick={() => { markRead(x.id); if (x.conversationId) navigate(`/chat?conversation=${x.conversationId}`); else if (x.ticketId) navigate(`/tickets/${x.ticketId}`); else if (x.taskId) navigate(`/tasks/${x.taskId}`); else if (x.projectId) navigate(`/projects/${x.projectId}`); }} sx={{ borderRight: '4px solid', borderColor: x.read ? 'divider' : 'primary.main', cursor: x.taskId || x.projectId || x.ticketId || x.conversationId ? 'pointer' : undefined }}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Box><Typography sx={{ fontWeight: x.read ? 600 : 800 }}>{x.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{x.body}</Typography><Typography variant="caption" color="text.secondary">{formatRelative(x.createdAt)}{x.smsStatus === 'queued' ? ' • پیامک در صف ارسال' : ''}</Typography></Box>{!x.read && <Button size="small" onClick={(event) => { event.stopPropagation(); markRead(x.id); }}>خوانده شد</Button>}</Stack></CardContent></Card>) : <Alert severity="info">{filter === 'unread' ? 'همه اعلان‌ها خوانده شده‌اند.' : 'اعلانی برای نمایش وجود ندارد.'}</Alert>}</Stack></Shell>;
}
