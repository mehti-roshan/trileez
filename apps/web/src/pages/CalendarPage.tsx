import { ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, IconButton, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { tasks, projectEvents, projects } from '../mock/data.ts';

type CalendarItem = { id: string; date: string; title: string; kind: 'task' | 'event'; color: 'primary' | 'warning'; subtitle?: string };

const weekDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

function toPersianDate(date: Date) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\u200e/g, '');
}
function monthTitle(date: Date) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long' }).format(date);
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toPersianDate(new Date()));
  const items = useMemo<CalendarItem[]>(() => {
    const taskItems: CalendarItem[] = tasks.flatMap((task) => {
      const dates = [task.startDate, task.dueDate].filter(Boolean) as string[];
      if (task.repeatEvery && task.dueDate) {
        const base = new Date(task.dueDate);
        for (let index = 1; index <= 4; index += 1) {
          const next = new Date(base); next.setDate(next.getDate() + task.repeatEvery * index); dates.push(next.toISOString().slice(0, 10));
        }
      }
      return Array.from(new Set(dates)).map((date, index) => ({ id: `${task.id}-${index}`, date, title: task.title, kind: 'task', color: 'primary' as const, subtitle: index === 0 ? 'شروع/موعد وظیفه' : 'تکرار وظیفه' }));
    });
    const eventItems = projectEvents.map((event) => ({ id: event.id, date: event.date, title: event.eventType, kind: 'event' as const, color: 'warning' as const, subtitle: projects.find((project) => project.id === event.projectId)?.name ?? 'رویداد سازمانی' }));
    return [...taskItems, ...eventItems];
  }, []);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (start.getDay() + 1) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  const currentMonth = month.getMonth();
  const selectedItems = items.filter((item) => item.date === selectedDate);
  const changeMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const goToday = () => { const today = new Date(); setMonth(today); setSelectedDate(toPersianDate(today)); };
  return <Box>
    <PageHeader title="تقویم" subtitle="نمای زمانی وظایف و رویدادهای قابل دسترس" crumbs={['تری‌لیز', 'تقویم']} />
    <Card sx={{ mb: 2 }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }} spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><IconButton onClick={() => changeMonth(-1)}><ChevronRight /></IconButton><Typography variant="h6" sx={{ minWidth: 170, textAlign: 'center', fontWeight: 800 }}>{monthTitle(month)}</Typography><IconButton onClick={() => changeMonth(1)}><ChevronLeft /></IconButton></Stack>
      <Button variant="outlined" startIcon={<Today />} onClick={goToday}>امروز</Button>
    </Stack></CardContent></Card>
    <Card><CardContent>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: .75 }}>
        {weekDays.map((day) => <Typography key={day} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 700, py: 1 }}>{day}</Typography>)}
        {cells.map((cell) => {
          const iso = cell.toISOString().slice(0, 10); const fa = toPersianDate(cell); const dayItems = items.filter((item) => item.date === iso);
          return <Box key={iso} onClick={() => setSelectedDate(fa)} sx={{ minHeight: 104, p: 1, border: '1px solid', borderColor: fa === selectedDate ? 'primary.main' : 'divider', borderRadius: 1.5, bgcolor: cell.getMonth() === currentMonth ? 'background.paper' : 'action.hover', cursor: 'pointer' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: cell.getMonth() === currentMonth ? 'text.primary' : 'text.disabled' }}>{new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric' }).format(cell)}</Typography>
            <Stack spacing={.5} sx={{ mt: .75, minWidth: 0 }}>{dayItems.slice(0, 3).map((item) => <Chip key={item.id} size="small" color={item.color} label={item.title} onClick={(event) => { event.stopPropagation(); navigate(item.kind === 'task' ? '/tasks' : '/project-events'); }} sx={{ justifyContent: 'flex-start', maxWidth: '100%', minWidth: 0, overflow: 'hidden', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }} />)}{dayItems.length > 3 && <Typography variant="caption" color="text.secondary">+{dayItems.length - 3} مورد دیگر</Typography>}</Stack>
          </Box>;
        })}
      </Box>
    </CardContent></Card>
    <Card sx={{ mt: 2 }}><CardContent><Typography sx={{ fontWeight: 800, mb: 1 }}>رویدادهای {selectedDate}</Typography>{selectedItems.length ? <Stack spacing={1}>{selectedItems.map((item) => <Stack key={item.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid', borderColor: 'divider' }}><Box><Typography sx={{ fontWeight: 700 }}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.subtitle}</Typography></Box><Button size="small" onClick={() => navigate(item.kind === 'task' ? '/tasks' : '/project-events')}>مشاهده</Button></Stack>)}</Stack> : <Typography color="text.secondary">برای این روز وظیفه یا رویدادی ثبت نشده است.</Typography>}</CardContent></Card>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>موعدها از داده‌های واقعی وظایف و رویدادهای پروژه ساخته می‌شوند و منبع جداگانه‌ای ندارند.</Typography>
  </Box>;
}
