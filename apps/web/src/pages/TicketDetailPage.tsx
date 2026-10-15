import { ArrowBack, Edit, Send } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import TicketFormDialog from '../components/common/TicketFormDialog.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import { PriorityChip, TicketStatusChip } from '../components/common/StatusChip.tsx';
import { customers, projects, users } from '../services/repositories.ts';
import { ticketRepository } from '../services/repositories.ts';
import { notify } from '../services/notificationService.ts';
import type { Ticket, TicketReply } from '../types/index.ts';
import { formatDateTime, priorityLabel, ticketStatusLabel } from '../utils/format.ts';

export default function TicketDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate();
  const [ticket, setTicket] = useState(() => ticketRepository.get(id)); const [composer, setComposer] = useState(''); const [mode, setMode] = useState<'reply' | 'internal'>('reply'); const [editOpen, setEditOpen] = useState(false);
  useEffect(() => ticketRepository.subscribe((items) => setTicket(items.find((item) => item.id === id))), [id]);
  if (!ticket) return <Box><PageHeader title="تیکت یافت نشد" crumbs={['تری‌لیز', 'تیکت‌ها']} /><Button startIcon={<ArrowBack />} onClick={() => navigate('/tickets')}>بازگشت</Button></Box>;
  const customer = customers.find((item) => item.id === ticket.customerId); const project = projects.find((item) => item.id === ticket.projectId); const assignee = users.find((item) => item.id === ticket.assigneeId);
  const update = (patch: Partial<Ticket>, activity: string) => {
    const now = new Date().toISOString(); ticketRepository.update(ticket.id, { ...patch, updatedAt: now, activities: [...(ticket.activities ?? []), { id: `ta-${Date.now()}`, ticketId: ticket.id, type: 'updated', description: activity, actorId: 'u1', createdAt: now }] });
    if (patch.assigneeId && patch.assigneeId !== ticket.assigneeId) notify({ id: `n-${Date.now()}`, title: 'تیکت جدید به شما اختصاص داده شد', body: `تیکت «${ticket.title}» به شما اختصاص داده شد.`, createdAt: now, type: 'ticket', ticketId: ticket.id, recipientId: patch.assigneeId, actorId: 'u1', entityType: 'ticket', entityId: ticket.id });
  };
  const sendReply = () => {
    if (!composer.trim()) return;
    const now = new Date().toISOString(); const reply: TicketReply = { id: `tr-${Date.now()}`, ticketId: ticket.id, authorId: 'u1', body: composer.trim(), createdAt: now, customerVisible: mode === 'reply' };
    update({ replies: [...(ticket.replies ?? []), reply], status: mode === 'reply' ? 'waiting' : ticket.status }, mode === 'reply' ? 'پاسخ برای مشتری ارسال شد' : 'یادداشت داخلی ثبت شد'); setComposer('');
  };
  return <Box>
    <PageHeader title={ticket.title} subtitle={`#${ticket.id} • ${customer?.company ?? 'بدون مشتری'}${project ? ` • ${project.name}` : ''}`} crumbs={['تری‌لیز', 'تیکت‌ها', ticket.title]} actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<Edit />} onClick={() => setEditOpen(true)}>ویرایش</Button><Button startIcon={<ArrowBack />} onClick={() => navigate('/tickets')}>بازگشت</Button></Stack>} />
    <Stack spacing={2}>
      <Card><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}><Box><Stack direction="row" spacing={1} sx={{ mb: 1 }}><TicketStatusChip value={ticket.status} /><PriorityChip value={ticket.priority} /><CustomerVisibilityBadge visible={ticket.customerVisible} /></Stack><Typography variant="body2">مشتری: {customer?.company ?? '—'} • مسئول: {assignee?.name ?? '—'}</Typography><Typography variant="caption" color="text.secondary">ایجاد: {formatDateTime(ticket.createdAt)} • بروزرسانی: {formatDateTime(ticket.updatedAt)}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={ticket.status} onChange={(e) => update({ status: e.target.value as Ticket['status'] }, `وضعیت به «${ticketStatusLabel[e.target.value as Ticket['status']]}» تغییر کرد`)}>{Object.entries(ticketStatusLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 130 }}><InputLabel>اولویت</InputLabel><Select label="اولویت" value={ticket.priority} onChange={(e) => update({ priority: e.target.value as Ticket['priority'] }, `اولویت به «${priorityLabel[e.target.value as Ticket['priority']]}» تغییر کرد`)}>{Object.entries(priorityLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 160 }}><InputLabel>مسئول</InputLabel><Select label="مسئول" value={ticket.assigneeId} onChange={(e) => update({ assigneeId: String(e.target.value) }, `مسئول تیکت به ${users.find((user) => user.id === e.target.value)?.name ?? 'کاربر'} تغییر کرد`)}>{users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}</Select></FormControl></Stack></Stack></CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>گفتگو و پاسخ‌ها</Typography><Stack spacing={1.5}>{(ticket.replies ?? []).map((reply) => { const author = users.find((user) => user.id === reply.authorId); return <Box key={reply.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: reply.customerVisible ? '#EFF6FF' : '#FFF7ED', borderRight: `3px solid ${reply.customerVisible ? '#2563EB' : '#F59E0B'}` }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 700 }}>{author?.name ?? 'کاربر'}</Typography><CustomerVisibilityBadge visible={reply.customerVisible} /></Stack><Typography sx={{ mt: .75, whiteSpace: 'pre-wrap' }}>{reply.body}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(reply.createdAt)}</Typography></Box>; })}{!(ticket.replies?.length) && <Typography color="text.secondary">هنوز پاسخی ثبت نشده است.</Typography>}</Stack><Divider sx={{ my: 2 }} /><Stack direction="row" spacing={1} sx={{ mb: 1 }}><Button variant={mode === 'reply' ? 'contained' : 'outlined'} onClick={() => setMode('reply')}>پاسخ به مشتری</Button><Button variant={mode === 'internal' ? 'contained' : 'outlined'} color="warning" onClick={() => setMode('internal')}>یادداشت داخلی</Button></Stack><TextField fullWidth multiline minRows={3} placeholder={mode === 'reply' ? 'متن پاسخ مشتری...' : 'یادداشت داخلی تیم...'} value={composer} onChange={(e) => setComposer(e.target.value)} /><Button sx={{ mt: 1, alignSelf: 'flex-start' }} variant="contained" startIcon={<Send />} onClick={sendReply}>ارسال</Button></CardContent></Card>
      <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>تاریخچه فعالیت</Typography>{(ticket.activities ?? []).slice().reverse().map((activity) => <Stack key={activity.id} direction="row" spacing={1} sx={{ py: .75, borderBottom: '1px solid', borderColor: 'divider' }}><Chip size="small" label={users.find((user) => user.id === activity.actorId)?.name ?? 'کاربر'} /><Typography variant="body2" sx={{ flex: 1 }}>{activity.description}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(activity.createdAt)}</Typography></Stack>)}</CardContent></Card>
    </Stack>
    <TicketFormDialog open={editOpen} ticket={ticket} onClose={() => setEditOpen(false)} onSave={(value) => update(value, 'اطلاعات تیکت ویرایش شد')} />
  </Box>;
}
