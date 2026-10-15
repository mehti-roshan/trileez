/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-expressions */
// Cross-module pages backed by the shared API repositories.
// @ts-nocheck
import { Add, AttachFile, Close, InsertDriveFileOutlined, Send, PersonAdd, GroupAdd, DoneAll } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, IconButton } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import QuickCreateDialog from '../components/common/QuickCreateDialog.tsx';
import EntityFormDialog from '../components/common/EntityFormDialog.tsx';
import DataTable from '../components/common/DataTable.tsx';
import { chatGroups, customers, employees, projectPhases, projects, tasks, users } from '../services/repositories.ts';
import { formatDate, formatDateTime, formatRelative } from '../utils/format.ts';
import { downloadStoredFile, uploadStoredFile } from '../services/fileService.ts';
import { chatGroupRepository, conversationRepository, messageRepository, projectEventRepository, taskLabelRepository } from '../services/repositories.ts';
import { createProjectEvent, PROJECT_EVENT_TYPES } from '../services/projectEventService.ts';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiClient } from '../services/apiClient.ts';
import { reportApiFailure } from '../services/apiEvents.ts';

const employeeForPerson = (id?: string) => employees.find((employee) => employee.id === id || employee.userId === id);
const personName = (id?: string) => employeeForPerson(id)?.fullName ?? users.find((x) => x.id === id)?.name ?? '—';
const projectLabel = (id?: string) => { const p = projects.find((x) => x.id === id); return p ? `${p.code ?? `P-${700000 + Number(p.id.slice(1) || 0)}`} — ${p.name}` : '—'; };
const customerLabel = (id?: string) => { const c = customers.find((x) => x.id === id); return c ? `${c.code ?? `C-${600000 + Number(c.id.slice(1) || 0)}`} — ${c.company}` : '—'; };
function Shell({ title, subtitle, children, action }: { title: string; subtitle: string; children: React.ReactNode; action?: React.ReactNode }) {
  const fields = title.includes('لیبل') ? ['نام لیبل', 'رنگ', 'توضیحات'] : title.includes('امتیاز') ? ['کارمند', 'نوع تغییر (مثبت / منفی)', 'تعداد امتیاز', 'دلیل', 'پروژه', 'تاریخ', 'توضیحات'] : title.includes('رویداد') ? ['نوع رخداد', 'پروژه', 'شخص', 'مرحله', 'اولویت', 'تاریخ', 'توضیحات', 'نتیجه'] : title.includes('دبیرخانه') ? ['عنوان سند', 'نوع سند', 'شماره سند', 'پروژه', 'مشتری', 'فرستنده', 'دریافت‌کننده', 'مسئول پیگیری', 'تاریخ سررسید', 'وضعیت', 'اولویت', 'لینک سند', 'توضیحات'] : title.includes('گفتگو') ? ['نام فرد مقابل', 'پیام آغازین'] : ['عنوان', 'شرح'];
  return <Box><PageHeader title={title} subtitle={subtitle} crumbs={['تری‌لیز', title]} actions={action ?? <QuickCreateDialog title={`ایجاد ${title}`} fields={fields} />} />{children}</Box>;
}

export function TaskLabelsPage() {
  const [rows, setRows] = useState(() => taskLabelRepository.list().map((label) => ({ ...label, usage: 'قابل انتخاب برای چندین وظیفه' })));
  const [open, setOpen] = useState(false);
  useEffect(() => taskLabelRepository.subscribe((items) => setRows(items.map((label) => ({ ...label, usage: 'قابل انتخاب برای چندین وظیفه' })))), []);
  return <Shell title="لیبل‌های وظایف" subtitle="مدیریت برچسب‌های قابل استفاده در کارها" action={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>لیبل جدید</Button>}><Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(x) => x.id} searchPlaceholder="جستجوی نام لیبل..." csvFilename="task-labels.csv" columns={[{ key: 'name', label: 'لیبل', value: (x) => x.name, render: (x) => <Chip label={x.name} sx={{ bgcolor: x.color }} /> }, { key: 'color', label: 'رنگ', value: (x) => x.color }, { key: 'usage', label: 'کاربرد', value: (x) => x.usage }]} /></Card><EntityFormDialog open={open} onClose={() => setOpen(false)} title="ایجاد لیبل وظیفه" fields={[{ name: 'name', label: 'نام لیبل', required: true }, { name: 'color', label: 'رنگ', required: true }]} onSubmit={async (values) => { await taskLabelRepository.create({ name: values.name, color: values.color }); }} submitLabel="ذخیره لیبل" /></Shell>;
}

export function ProjectEventsPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [project, setProject] = useState(id ?? 'all');
  const open = params.get('create') === '1';
  const [rows, setRows] = useState(() => projectEventRepository.list());
  useEffect(() => projectEventRepository.subscribe(setRows), []);
  useEffect(() => setProject(id ?? 'all'), [id]);
  const filteredRows = rows.filter((x) => project === 'all' || x.projectId === project).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const close = () => setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true });
  const save = async (values) => { const projectId = project === 'all' ? values.projectId : project; await createProjectEvent({ projectId, eventType: values.eventType, title: values.title, date: values.date ? `${values.date}T${values.time || '00:00'}` : new Date().toISOString(), description: values.description, createdBy: 'u1', personId: values.personId || undefined, taskId: values.taskId || undefined, phaseId: values.phaseId || undefined, attachments: (values.attachments || '').split(/[،,\n]/), customerVisible: values.customerVisible === 'true', priority: values.priority || 'عادی', result: values.result }, projectEventRepository); close(); };
  const relatedPeople = employees;
  const eventFields = [{ name: 'eventType', label: 'نوع رخداد', type: 'select', options: PROJECT_EVENT_TYPES.map((type) => ({ value: type, label: type })), required: true }, { name: 'title', label: 'عنوان رویداد', required: true }, ...(project === 'all' ? [{ name: 'projectId', label: 'پروژه', type: 'select', options: projects.map((x) => ({ value: x.id, label: projectLabel(x.id) })), required: true }] : []), { name: 'personId', label: 'عضو / کارمند مرتبط', type: 'select', options: [{ value: '', label: 'بدون عضو مشخص' }, ...relatedPeople.map((x) => ({ value: x.id, label: x.fullName }))] }, { name: 'phaseId', label: 'فاز مرتبط', type: 'select', options: [{ value: '', label: 'بدون فاز مشخص' }, ...projectPhases.filter((x) => project === 'all' || x.projectId === project).map((x) => ({ value: x.id, label: x.title }))] }, { name: 'taskId', label: 'وظیفه مرتبط', type: 'select', options: [{ value: '', label: 'بدون وظیفه مشخص' }, ...tasks.filter((x) => project === 'all' || x.projectId === project).map((x) => ({ value: x.id, label: x.title }))] }, { name: 'priority', label: 'اولویت', type: 'select', options: [{ value: 'عادی', label: 'عادی' }, { value: 'بالا', label: 'بالا' }, { value: 'بسیار بالا', label: 'بسیار بالا' }] }, { name: 'date', label: 'تاریخ رخداد', type: 'date', required: true }, { name: 'time', label: 'زمان رخداد', type: 'time', required: true }, { name: 'description', label: 'شرح و جزئیات', type: 'textarea', required: true }, { name: 'result', label: 'نتیجه / پیگیری بعدی', type: 'textarea' }, { name: 'attachments', label: 'پیوست / سند مرتبط', placeholder: 'نام فایل یا شناسه سند؛ موارد را با ویرگول جدا کنید' }, { name: 'customerVisible', label: 'قابل مشاهده برای مشتری', type: 'checkbox' }];
  return <Shell title="رویدادهای پروژه" subtitle="تایم‌لاین تصمیم‌ها، تغییر وضعیت‌ها و رخدادهای عملیاتی پروژه‌ها"><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}><FormControl sx={{ minWidth: 300 }}><InputLabel>پروژه</InputLabel><Select label="پروژه" value={project} onChange={(e) => setProject(e.target.value)}><MenuItem value="all">همه پروژه‌ها</MenuItem>{projects.map((x) => <MenuItem key={x.id} value={x.id}>{projectLabel(x.id)}</MenuItem>)}</Select></FormControl><Button variant="contained" startIcon={<Add />} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('create', '1'); return next; }, { replace: true })}>ثبت رویداد جدید</Button></Stack><Card><CardContent><Stack spacing={0}>{filteredRows.map((x) => <Box key={x.id} sx={{ position: 'relative', pr: 3, pb: 2.5, mb: 2, borderRight: '2px solid', borderColor: x.status === 'completed' ? 'success.main' : 'warning.main' }}><Box sx={{ position: 'absolute', right: -7, top: 0, width: 12, height: 12, borderRadius: '50%', bgcolor: x.status === 'completed' ? 'success.main' : 'warning.main' }} /><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={800}>{x.title ?? x.eventType}</Typography><Typography variant="body2" color="text.secondary">{x.eventType}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(x.date)} • ثبت‌کننده: {personName(x.registeredBy)}</Typography></Box><Stack direction="row" spacing={1}><Chip size="small" label={x.priority} color={x.priority === 'بسیار بالا' ? 'error' : x.priority === 'بالا' ? 'warning' : 'default'} /><Chip size="small" label={x.stage} /><CustomerVisibilityBadge visible={x.customerVisible} /></Stack></Stack><Typography variant="body2" sx={{ mt: 1 }}>{x.description}</Typography><Typography variant="caption" color="text.secondary">پروژه: {projectLabel(x.projectId)} • عضو: {personName(x.personId)}{x.phaseId ? ` • فاز: ${projectPhases.find((phase) => phase.id === x.phaseId)?.title ?? '—'}` : ''}{x.taskId ? ` • وظیفه: ${tasks.find((task) => task.id === x.taskId)?.title ?? '—'}` : ''}</Typography>{x.attachments?.length ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5 }}>پیوست: {x.attachments.join('، ')}</Typography> : null}{x.result && <Typography variant="body2" color="success.main" sx={{ mt: .5 }}>نتیجه: {x.result}</Typography>}</Box>)}</Stack>{!filteredRows.length && <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>برای این پروژه هنوز رویدادی ثبت نشده است.</Typography>}</CardContent></Card><EntityFormDialog key={`${project}-${open}`} open={open} onClose={close} title="ثبت رویداد پروژه" fields={eventFields} onSubmit={save} submitLabel="ثبت رخداد" /></Shell>;
}

export function ChatPage() {
  const { user } = useApp();
  const [chatParams] = useSearchParams();
  const [chat, setChat] = useState(() => ({ conversations: conversationRepository.list(), messages: messageRepository.list() }));
  const [contacts, setContacts] = useState(() => conversationRepository.list().flatMap((conversation) => conversation.participantDetails ?? []).filter((contact, index, all) => all.findIndex((item) => item.id === contact.id) === index));
  const [active, setActive] = useState(() => {
    const projectId = chatParams.get('project');
    const conversationId = chatParams.get('conversation');
    const personId = chatParams.get('person');
    const personUserId = employeeForPerson(personId ?? undefined)?.userId ?? personId;
    const group = projectId ? chatGroups.find((item) => item.projectId === projectId && item.isDefault) : undefined;
    return chat.conversations.find((item) => item.id === conversationId)?.id ?? chat.conversations.find((item) => personUserId && item.participantIds.includes(personUserId) && item.participantIds.includes(user.id) && item.participantIds.length === 2)?.id ?? chat.conversations.find((item) => group && item.groupId === group.id)?.id ?? chat.conversations[0]?.id ?? '';
  });
  const [draft, setDraft] = useState(''); const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [newOpen, setNewOpen] = useState(false); const [groupOpen, setGroupOpen] = useState(false); const [personQuery, setPersonQuery] = useState(''); const [selectedPerson, setSelectedPerson] = useState(''); const [groupName, setGroupName] = useState(''); const [groupMembers, setGroupMembers] = useState([user.id]);
  const [profileOpen, setProfileOpen] = useState(false); const [attachment, setAttachment] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const sync = () => setChat({ conversations: conversationRepository.list(), messages: messageRepository.list() });
    const unsubscribeConversations = conversationRepository.subscribe(sync);
    const unsubscribeMessages = messageRepository.subscribe(sync);
    sync();
    return () => { unsubscribeConversations(); unsubscribeMessages(); };
  }, []);

  useEffect(() => {
    let active = true;
    apiClient.list('data/chat-contacts').then((result) => { if (active) setContacts(result.data); }).catch((error) => {
      reportApiFailure({ message: error instanceof Error ? error.message : 'دریافت فهرست مخاطبان گفتگو ناموفق بود.', operation: 'list', resource: 'data/chat-contacts' });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const personId = chatParams.get('person');
    if (!personId) return;
    const participantId = contacts.find((contact) => contact.id === personId || contact.employeeId === personId)?.id ?? personId;
    const target = chat.conversations.find((item) => item.participantIds.includes(participantId) && item.participantIds.includes(user.id) && item.participantIds.length === 2);
    if (target) setActive(target.id);
  }, [chat.conversations, chatParams, contacts, user.id]);

  const chatPersonName = (id) => contacts.find((contact) => contact.id === id || contact.employeeId === id)?.name ?? chat.conversations.flatMap((item) => item.participantDetails ?? []).find((contact) => contact.id === id)?.name ?? personName(id);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...chat.conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).filter((c) => {
      const peer = c.participantIds.find((id) => id !== user.id);
      const latest = [...chat.messages].filter((m) => m.conversationId === c.id).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
      const title = c.title ?? (c.participantIds.length > 2 ? `گروه ${c.participantIds.filter((id) => id !== user.id).slice(0, 2).map((id) => chatPersonName(id)).join(' و ')}` : chatPersonName(peer));
      return (groupFilter === 'all' || c.groupId === groupFilter) && (!q || `${title} ${latest?.body ?? ''}`.toLowerCase().includes(q));
    });
  }, [chat, contacts, groupFilter, search, user.id]);
  const conversation = chat.conversations.find((c) => c.id === active) ?? visible[0] ?? chat.conversations[0];
  const thread = conversation ? [...chat.messages].filter((m) => m.conversationId === conversation.id).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()) : [];
  const other = conversation?.participantIds.find((id) => id !== user.id);
  const isGroup = Boolean(conversation && (conversation.participantIds.length > 2 || conversation.title));
  const conversationTitle = conversation ? (conversation.title ?? (isGroup ? `گروه ${conversation.participantIds.filter((id) => id !== user.id).slice(0, 2).map((id) => chatPersonName(id)).join(' و ')}` : chatPersonName(other))) : '';
  const otherUser = contacts.find((contact) => contact.id === other) ?? users.find((u) => u.id === other);
  const candidates = contacts.filter((contact) => contact.id !== user.id && contact.name.includes(personQuery));

  const selectConversation = async (id) => {
    setActive(id);
    const unread = messageRepository.list().filter((message) => message.conversationId === id && message.senderId !== user.id && !message.read);
    await Promise.all(unread.map((message) => messageRepository.update(message.id, { read: true })));
  };
  const sendMessage = async () => {
    const body = draft.trim();
    if (!conversation || (!body && !attachment)) return;
    const stored = attachment ? await uploadStoredFile(attachment, { visibility: 'workspace', customerVisible: false, context: { kind: 'conversation', id: conversation.id } }) : undefined;
    const message = await messageRepository.create({ conversationId: conversation.id, body: body || 'پیوست ارسال شد.', attachments: stored ? [stored] : [] });
    conversationRepository.adopt({ ...conversation, updatedAt: message.sentAt });
    setDraft(''); setAttachment(null);
  };
  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length < 2) return;
    const next = { title: groupName.trim(), participantIds: Array.from(new Set([...groupMembers, user.id])), unreadCount: 0, groupId: 'chat-general' };
    const created = await conversationRepository.create(next); setActive(created.id); setGroupOpen(false); setGroupName(''); setGroupMembers([user.id]);
  };
  const onFile = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    setAttachment(file);
    event.target.value = '';
  };
  const startConversation = async () => {
    if (!selectedPerson) return;
    const existing = chat.conversations.find((c) => c.participantIds.includes(selectedPerson) && c.participantIds.includes(user.id) && c.participantIds.length === 2);
    if (existing) await selectConversation(existing.id);
    else {
      const next = { participantIds: [user.id, selectedPerson], unreadCount: 0, groupId: 'chat-general' };
      const created = await conversationRepository.create(next); setActive(created.id);
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
          const peer = c.participantIds.find((id) => id !== user.id); const latest = [...chat.messages].filter((m) => m.conversationId === c.id).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0]; const title = c.title ?? (c.participantIds.length > 2 ? `گروه ${c.participantIds.filter((id) => id !== user.id).slice(0, 2).map((id) => chatPersonName(id)).join(' و ')}` : chatPersonName(peer)); const unreadCount = chat.messages.filter((message) => message.conversationId === c.id && message.senderId !== user.id && !message.read).length;
          return <Box key={c.id} onClick={() => { void selectConversation(c.id).catch(() => undefined); }} sx={{ p: 1.5, cursor: 'pointer', bgcolor: c.id === conversation?.id ? 'action.selected' : 'transparent', borderBottom: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
            <Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{title.slice(0, 1)}</Box><Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={700} noWrap>{title}</Typography>{unreadCount > 0 && <Chip size="small" color="error" label={unreadCount} />}</Stack><Typography variant="caption" color="text.secondary" noWrap display="block">{latest?.body ?? 'هنوز پیامی ارسال نشده است'}</Typography></Box></Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5, mr: 6 }}>{chatGroups.find((group) => group.id === c.groupId)?.name ?? 'بدون گروه'} • {formatRelative(c.updatedAt)}</Typography>
          </Box>;
        })}
      </Box>
      {!conversation ? <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}><Typography color="text.secondary">یک گفتگو را برای شروع انتخاب کنید</Typography></Box> : <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer' }} onClick={() => setProfileOpen(true)}><Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ width: 42, height: 42, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{conversationTitle.slice(0, 1)}</Box><Box sx={{ flex: 1 }}><Typography fontWeight={800}>{conversationTitle}</Typography><Typography variant="caption" color="text.secondary">{isGroup ? `${conversation.participantIds.length} عضو` : (otherUser?.title ?? 'عضو سازمان')} • {isGroup ? 'گفتگوی گروهی' : (otherUser?.status === 'online' ? 'آنلاین' : 'آخرین فعالیت ثبت شده')}</Typography></Box><FormControl size="small" sx={{ minWidth: 150 }} onClick={(e) => e.stopPropagation()}><InputLabel>گروه</InputLabel><Select label="گروه" value={conversation.groupId ?? ''} onChange={(e) => { void conversationRepository.update(conversation.id, { groupId: e.target.value }).catch(() => undefined); }}>{chatGroups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}</Select></FormControl></Stack></Box>
        <Box sx={{ flex: 1, p: { xs: 1.5, md: 2.5 }, bgcolor: '#F8FAFC', overflowY: 'auto' }}>{thread.length === 0 ? <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 8 }}>هنوز پیامی در این گفتگو وجود ندارد</Typography> : thread.map((m) => <Box key={m.id} sx={{ mb: 1.5, display: 'flex', justifyContent: m.senderId === user.id ? 'flex-start' : 'flex-end' }}><Box sx={{ maxWidth: '78%', p: 1.5, bgcolor: m.senderId === user.id ? 'primary.main' : 'white', color: m.senderId === user.id ? 'white' : 'text.primary', borderRadius: 2, boxShadow: m.senderId === user.id ? 'none' : '0 1px 4px rgba(15,23,42,.08)' }}><Typography variant="caption" sx={{ display: 'block', fontWeight: 700, opacity: .8 }}>{isGroup ? chatPersonName(m.senderId) : ''}</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.body}</Typography>{m.attachments?.map((a) => a.url ? <Box key={a.id} component="img" src={a.url} alt={a.name} sx={{ display: 'block', maxWidth: 220, maxHeight: 160, borderRadius: 1.5, mt: 1 }} /> : <Chip key={a.id} clickable onClick={() => { void downloadStoredFile(a).catch(() => undefined); }} icon={<InsertDriveFileOutlined />} label={`${a.name} (${a.size})`} sx={{ mt: 1, bgcolor: 'rgba(255,255,255,.16)', color: 'inherit' }} />)}<Stack direction="row" spacing={.5} alignItems="center" justifyContent="flex-end" sx={{ mt: .5, opacity: .72 }}><Typography variant="caption">{formatDateTime(m.sentAt)}</Typography>{m.senderId === user.id && <DoneAll sx={{ fontSize: 15 }} />}</Stack></Box></Box>)}</Box>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void sendMessage().catch(() => undefined); }} sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>{attachment && <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, p: .75, bgcolor: 'action.hover', borderRadius: 1.5, width: 'fit-content' }}><AttachFile fontSize="small" /><Typography variant="caption">{attachment.name}</Typography><IconButton size="small" onClick={() => setAttachment(null)}><Close fontSize="small" /></IconButton></Stack>}<Stack direction="row" spacing={1} alignItems="flex-end"><input hidden ref={fileRef} type="file" onChange={onFile} /><IconButton onClick={() => fileRef.current?.click()} aria-label="پیوست"><AttachFile /></IconButton><TextField fullWidth multiline maxRows={4} size="small" placeholder="پیام خود را بنویسید..." value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage().catch(() => undefined); } }} /><Button type="submit" variant="contained" startIcon={<Send />} disabled={!draft.trim() && !attachment}>ارسال</Button></Stack></Box>
      </Box>}
    </Card>
    <Dialog open={newOpen} onClose={() => setNewOpen(false)} fullWidth maxWidth="sm"><DialogTitle>گفتگوی جدید</DialogTitle><DialogContent><TextField autoFocus fullWidth label="جستجوی کارمند" value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} sx={{ mt: 1, mb: 1.5 }} />{candidates.map((contact) => <Box key={contact.id} onClick={() => setSelectedPerson(contact.id)} sx={{ p: 1.25, borderRadius: 1.5, cursor: 'pointer', bgcolor: selectedPerson === contact.id ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}><Typography fontWeight={700}>{contact.personnelCode ? `${contact.personnelCode} — ` : ''}{contact.name}</Typography><Typography variant="caption" color="text.secondary">{contact.jobTitle ?? contact.title ?? 'عضو سازمان'}{contact.department ? ` • ${contact.department}` : ''}</Typography></Box>)}{!candidates.length && <Typography color="text.secondary">کارمند دارای حساب کاربری پیدا نشد</Typography>}</DialogContent><DialogActions><Button onClick={() => setNewOpen(false)}>انصراف</Button><Button variant="contained" onClick={() => { void startConversation().catch(() => undefined); }} disabled={!selectedPerson}>شروع گفتگو</Button></DialogActions></Dialog>
    <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} fullWidth maxWidth="sm"><DialogTitle>گروه گفتگوی جدید</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus fullWidth label="نام گروه" value={groupName} onChange={(e) => setGroupName(e.target.value)} /><Typography variant="body2" color="text.secondary">اعضای گروه را انتخاب کنید</Typography>{contacts.filter((contact) => contact.id !== user.id).map((contact) => <Box key={contact.id} onClick={() => setGroupMembers((current) => current.includes(contact.id) ? current.filter((id) => id !== contact.id) : [...current, contact.id])} sx={{ p: 1, borderRadius: 1.5, cursor: 'pointer', bgcolor: groupMembers.includes(contact.id) ? 'action.selected' : 'transparent' }}><Typography fontWeight={700}>{contact.personnelCode ? `${contact.personnelCode} — ` : ''}{contact.name}</Typography><Typography variant="caption" color="text.secondary">{contact.jobTitle ?? contact.title ?? 'عضو سازمان'}{contact.department ? ` • ${contact.department}` : ''}</Typography></Box>)}</Stack></DialogContent><DialogActions><Button onClick={() => setGroupOpen(false)}>انصراف</Button><Button variant="contained" onClick={() => { void createGroup().catch(() => undefined); }} disabled={!groupName.trim() || groupMembers.length < 2}>ایجاد گروه</Button></DialogActions></Dialog>
    <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} fullWidth maxWidth="sm"><DialogTitle>اطلاعات مخاطب</DialogTitle><DialogContent>{other && <Stack spacing={1.25} sx={{ pt: 1 }}><Typography variant="h6" fontWeight={800}>{chatPersonName(other)}</Typography><Typography>{otherUser?.title ?? 'عضو سازمان'}{otherUser?.department ? ` • ${otherUser.department}` : ''}</Typography><Typography>وضعیت همکاری: فعال</Typography><Typography>پروژه‌های مرتبط: {projectCount.toLocaleString('fa-IR')}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={() => setProfileOpen(false)}>بستن</Button></DialogActions></Dialog>
  </Shell>;
}
