import { Download, MarkEmailRead, Search, Visibility, UploadFile, GridView, ViewList, DeleteOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import QuickCreateDialog from '../components/common/QuickCreateDialog.tsx';
import { tasks, users } from '../mock/data.ts';
import { notificationRepository } from '../services/repositories.ts';
import { formatDate, formatRelative } from '../utils/format.ts';
import DataTable, { type DataTableColumn } from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { canAccessFile, listFiles, registerFile, type FileMetadata } from '../services/fileService.ts';
import { useApp } from '../context/AppContext.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { exportCsv } from '../services/csv.ts';

const knowledge = [
  { id: 'kb1', title: 'راهنمای شروع کار با فضای کاری', category: 'شروع سریع', status: 'published', authorId: 'u3', views: 248, updatedAt: '2026-08-21' },
  { id: 'kb2', title: 'پروتکل پاسخ‌گویی به تیکت‌های فوری', category: 'پشتیبانی', status: 'published', authorId: 'u5', views: 184, updatedAt: '2026-08-19' },
  { id: 'kb3', title: 'راهنمای ثبت ساعات قابل صورتحساب', category: 'مالی و عملیات', status: 'draft', authorId: 'u2', views: 42, updatedAt: '2026-08-24' },
  { id: 'kb4', title: 'سیاست رضایت در نشست مانیتورینگ', category: 'مانیتورینگ', status: 'published', authorId: 'u6', views: 91, updatedAt: '2026-08-16' },
  { id: 'kb5', title: 'سؤالات متداول تمدید قرارداد', category: 'فروش', status: 'review', authorId: 'u7', views: 67, updatedAt: '2026-08-23' },
];
const reminders = [
  ...tasks.filter((task) => task.status !== 'done').slice(0, 8).map((task) => ({ id: task.id, title: task.title, type: 'موعد کار', dueDate: task.dueDate, owner: users.find((u) => u.id === task.assigneeId)?.name ?? '—', done: false })),
  { id: 'r-contract', title: 'پیگیری تمدید قرارداد پتروشیمی فارس', type: 'قرارداد', dueDate: '2026-08-30', owner: 'سارا محمدی', done: false },
  { id: 'r-report', title: 'ارسال گزارش فروش هفتگی', type: 'گزارش', dueDate: '2026-08-26', owner: 'علی رضایی', done: true },
];
const media = [
  { name: 'لوگوی پارس وود.svg', type: 'برند', size: '۲۴۰ کیلوبایت', updatedAt: '2026-08-20', owner: 'سارا محمدی' },
  { name: 'قرارداد-۱۴۰۵-۰۲۱.pdf', type: 'سند', size: '۱.۸ مگابایت', updatedAt: '2026-08-18', owner: 'نگار صالحی' },
  { name: 'تصویر داشبورد فروش.png', type: 'تصویر', size: '۸۶۰ کیلوبایت', updatedAt: '2026-08-24', owner: 'مریم حسینی' },
  { name: 'راهنمای نصب Agent.pdf', type: 'سند', size: '۳.۲ مگابایت', updatedAt: '2026-08-15', owner: 'امیر جعفری' },
];
const announcements = [
  { id: 'an1', title: 'بروزرسانی فرآیند ثبت ساعت کاری', body: 'از این هفته ساعات قابل صورتحساب تا پایان روز کاری باید ارسال شوند.', audience: 'همه سازمان', createdAt: '2026-08-24', pinned: true },
  { id: 'an2', title: 'جلسه مرور اهداف فصل سوم', body: 'جلسه مدیران فروش و عملیات دوشنبه ساعت ۱۰ برگزار می‌شود.', audience: 'مدیران', createdAt: '2026-08-22', pinned: false },
  { id: 'an3', title: 'نگهداری برنامه‌ریزی‌شده سرویس', body: 'سرویس مانیتورینگ پنجشنبه بین ساعت ۲ تا ۳ بامداد در دسترس نیست.', audience: 'فنی و زیرساخت', createdAt: '2026-08-20', pinned: false },
];

function Shell({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  const fields = title === 'یادآورها' ? ['عنوان یادآور', 'نوع یادآور', 'موعد', 'مسئول', 'توضیحات'] : title === 'پایگاه دانش' ? ['عنوان مقاله', 'دسته‌بندی', 'نویسنده', 'خلاصه مقاله'] : title === 'رسانه' ? ['نام فایل', 'نوع فایل', 'توضیحات'] : title === 'اطلاعیه‌ها' ? ['عنوان اطلاعیه', 'مخاطبان', 'متن اطلاعیه'] : ['عنوان', 'توضیحات'];
  return <Box><PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={action ?? <QuickCreateDialog title={`ایجاد ${title}`} fields={fields} />} />{children}</Box>;
}
function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <TextField fullWidth placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />;
}

export function RemindersPage() {
  const [params] = useSearchParams(); const [view, setView] = useState(params.get('view') ?? 'all');
  const today = new Date('2026-08-25T00:00:00Z').getTime();
  const rows = reminders.filter((x) => {
    const due = new Date(x.dueDate).getTime();
    const matchesView = view === 'all' || (view === 'done' ? x.done : view === 'today' ? due >= today && due < today + 86_400_000 : !x.done && due >= today);
    return matchesView;
  });
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'title', label: 'یادآور', value: (row) => row.title, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.title}</Typography> },
    { key: 'type', label: 'نوع', value: (row) => row.type, groupable: true },
    { key: 'owner', label: 'مسئول', value: (row) => row.owner },
    { key: 'dueDate', label: 'موعد', value: (row) => row.dueDate, render: (row) => formatDate(row.dueDate) },
    { key: 'status', label: 'وضعیت', value: (row) => row.done ? 'done' : 'pending', render: (row) => <Chip size="small" color={row.done ? 'success' : 'warning'} label={row.done ? 'انجام‌شده' : 'در انتظار اقدام'} /> },
  ];
  return <Shell title="یادآورها" subtitle="پیگیری کارها، قراردادها و تعهدات نزدیک" action={<FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>نمایش</InputLabel><Select label="نمایش" value={view} onChange={(e) => setView(e.target.value)}><MenuItem value="all">همه یادآورها</MenuItem><MenuItem value="today">امروز</MenuItem><MenuItem value="upcoming">آینده</MenuItem><MenuItem value="done">انجام‌شده</MenuItem></Select></FormControl>}><Card sx={{ p: 1 }}><DataTable rows={rows} columns={columns} getRowId={(row) => row.id} searchPlaceholder="جستجوی یادآور، نوع یا مسئول..." filters={[{ key: 'status', label: 'وضعیت', options: [{ value: 'pending', label: 'در انتظار اقدام' }, { value: 'done', label: 'انجام‌شده' }], value: (row) => row.done ? 'done' : 'pending' }]} toolbar={<CsvToolbar rows={rows} entityLabel="یادآورها" filename="reminders.csv" columns={columns} />} /></Card></Shell>;
}

export function KnowledgePage() {
  const [query, setQuery] = useState(''); const rows = knowledge.filter((x) => `${x.title} ${x.category}`.includes(query));
  return <Shell title="پایگاه دانش" subtitle="مقالات داخلی، راهنماهای محصول و رویه‌های سازمانی"><Card sx={{ p: 2, mb: 2 }}><SearchBox value={query} onChange={setQuery} placeholder="جستجو در مقالات..." /></Card><Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>{rows.map((x) => <Card key={x.id}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Chip size="small" label={x.category} /><Chip size="small" color={x.status === 'published' ? 'success' : 'warning'} label={x.status === 'published' ? 'منتشرشده' : x.status === 'draft' ? 'پیش‌نویس' : 'در بازبینی'} /></Stack><Typography sx={{ fontWeight: 800, mt: 1.5 }}>{x.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>نویسنده: {users.find((u) => u.id === x.authorId)?.name} • {x.views} بازدید</Typography><Typography variant="caption" color="text.secondary">آخرین بروزرسانی: {formatDate(x.updatedAt)}</Typography></CardContent></Card>)}</Box></Shell>;
}

export function MediaPage() {
  const { user } = useApp();
  const seed: FileMetadata[] = media.map((item, index) => ({ id: `media-${index + 1}`, name: item.name, type: item.type === 'تصویر' ? 'image/png' : 'application/pdf', size: item.size, uploadedBy: users[index % users.length]?.id ?? user.id, visibility: 'workspace', access: ['view', 'share'], customerVisible: index === 0 || index === 2 }));
  const [files, setFiles] = useState<FileMetadata[]>(() => [...seed, ...listFiles()]);
  const [selected, setSelected] = useState<FileMetadata | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [folder, setFolder] = useState('همه فایل‌ها');
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const metadata: FileMetadata = { id: `file-${Date.now()}`, name: file.name, type: file.type || 'application/octet-stream', size: `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`, url: typeof reader.result === 'string' ? reader.result : undefined, uploadedBy: user.id, visibility: 'workspace', access: ['view', 'share'], customerVisible: false };
      registerFile(metadata); setFiles((current) => [metadata, ...current]);
    };
    reader.readAsDataURL(file); event.target.value = '';
  };
  const download = (file: FileMetadata) => {
    const href = file.url ?? URL.createObjectURL(new Blob([`فایل نمونه: ${file.name}`], { type: file.type }));
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = file.name; anchor.click();
    if (!file.url) URL.revokeObjectURL(href);
  };
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
    { key: 'actions', label: 'عملیات', sortable: false, searchable: false, render: (row) => <Stack direction="row" spacing={.5}><Button size="small" startIcon={<Visibility />} onClick={(event) => { event.stopPropagation(); setSelected(row); }}>مشاهده</Button><Button size="small" startIcon={<Download />} onClick={(event) => { event.stopPropagation(); download(row); }}>دریافت</Button></Stack> },
  ];
  return <Shell title="رسانه" subtitle="فایل‌های قابل دسترس و دارایی‌های مشترک فضای کاری" action={<Stack direction="row" spacing={1}><Button component="label" variant="contained" startIcon={<UploadFile />}>بارگذاری فایل<input hidden type="file" onChange={upload} /></Button><Button variant="outlined" startIcon={viewMode === 'list' ? <GridView /> : <ViewList />} onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>{viewMode === 'list' ? 'نمایش شبکه‌ای' : 'نمایش فهرستی'}</Button></Stack>}><Card sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}><Button variant={folder === 'همه فایل‌ها' ? 'contained' : 'outlined'} onClick={() => setFolder('همه فایل‌ها')}>همه فایل‌ها</Button><Button variant={folder === 'پروژه‌ها' ? 'contained' : 'outlined'} onClick={() => setFolder('پروژه‌ها')}>فایل‌های پروژه‌ها</Button></Stack>{viewMode === 'list' ? <DataTable rows={visible} columns={columns} getRowId={(row) => row.id} searchPlaceholder="جستجو در نام فایل، نوع یا بارگذاری‌کننده..." onRowClick={setSelected} /> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1.5 }}>{visible.map((file) => <Card key={file.id} variant="outlined" onClick={() => setSelected(file)} sx={{ cursor: 'pointer', p: 1.5 }}><Box sx={{ height: 90, bgcolor: file.type.startsWith('image') ? 'primary.50' : 'grey.100', borderRadius: 1, display: 'grid', placeItems: 'center', mb: 1 }}>{file.type.startsWith('image') && file.url ? <Box component="img" src={file.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 1 }} /> : <Typography variant="h5">{file.type.includes('pdf') ? 'PDF' : 'FILE'}</Typography>}</Box><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{file.name}</Typography><Typography variant="caption" color="text.secondary">{file.size}</Typography><Stack direction="row" spacing={.5} sx={{ mt: .5 }}><Button size="small" onClick={(e) => { e.stopPropagation(); setSelected(file); }}><Visibility fontSize="small" /></Button><Button size="small" onClick={(e) => { e.stopPropagation(); download(file); }}><Download fontSize="small" /></Button><Button size="small" onClick={(e) => { e.stopPropagation(); setFiles((current) => current.filter((x) => x.id !== file.id)); }}><DeleteOutlined fontSize="small" /></Button></Stack></Card>)}</Box>}</Card><Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>{selected?.name}</DialogTitle><DialogContent>{selected?.type.startsWith('image') && selected?.url ? <Box component="img" src={selected.url} alt={selected.name} sx={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 2 }} /> : <Alert severity="info">پیش‌نمایش این نوع فایل در نمونه اولیه در دسترس نیست. اطلاعات فایل و امکان دریافت در دسترس است.</Alert>}{selected && <Stack spacing={.5} sx={{ mt: 2 }}><Typography variant="body2">نوع فایل: {selected.type}</Typography><Typography variant="body2">حجم: {selected.size}</Typography><Typography variant="body2">بارگذاری‌کننده: {ownerName(selected.uploadedBy)}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setSelected(null)}>بستن</Button>{selected && <Button variant="contained" startIcon={<Download />} onClick={() => download(selected)}>دریافت فایل</Button>}</DialogActions></Dialog></Shell>;
}

export function ExportsPage() {
  const [selected, setSelected] = useState('فاکتورها');
  const [notice, setNotice] = useState('');
  const buildExport = () => {
    exportCsv([{ type: selected, range: '۱۴۰۵/۰۶/۰۱ تا ۱۴۰۵/۰۶/۳۱', generatedAt: new Date().toISOString() }], [
      { key: 'type', label: 'نوع خروجی', value: (row) => row.type },
      { key: 'range', label: 'بازه زمانی', value: (row) => row.range },
      { key: 'generatedAt', label: 'زمان ایجاد', value: (row) => row.generatedAt },
    ], `trileez-${selected}.csv`);
    setNotice(`خروجی ${selected} آماده شد و دانلود آن آغاز شد.`);
  };
  return <Shell title="برون‌بری گروهی PDF" subtitle="تهیه خروجی گروهی از اسناد و گزارش‌های سازمان"><Card sx={{ p: 3 }}><Stack spacing={2}><FormControl><InputLabel>نوع خروجی</InputLabel><Select label="نوع خروجی" value={selected} onChange={(e) => setSelected(e.target.value)}>{['فاکتورها', 'پیش‌فاکتورها', 'قراردادها', 'گزارش فعالیت', 'گزارش ساعات کاری'].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select></FormControl><TextField label="بازه زمانی" value="۱۴۰۵/۰۶/۰۱ تا ۱۴۰۵/۰۶/۳۱" InputProps={{ readOnly: true }} /><TextField label="فیلتر مشتری (اختیاری)" placeholder="همه مشتریان" /><Button variant="contained" startIcon={<Download />} onClick={buildExport}>ساخت خروجی {selected}</Button>{notice && <Alert severity="success">{notice}</Alert>}</Stack></Card></Shell>;
}

export function AnnouncementsPage() { return <Shell title="اطلاعیه‌ها" subtitle="ارتباطات داخلی و اعلان‌های مهم سازمان"><Stack spacing={2}>{announcements.map((x) => <Card key={x.id}><CardContent><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Box><Typography sx={{ fontWeight: 800 }}>{x.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{x.body}</Typography></Box>{x.pinned && <Chip size="small" color="primary" label="مهم" />}</Stack><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{x.audience} • {formatDate(x.createdAt)}</Typography></CardContent></Card>)}</Stack></Shell>; }

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
