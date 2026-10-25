import { CalendarMonth } from '@mui/icons-material';
import { Box, IconButton, Popover, Stack, TextField, Typography } from '@mui/material';
import dayjs, { type Dayjs } from 'dayjs';
import jalaliday from 'jalaliday/dayjs';
import { useMemo, useState } from 'react';

dayjs.extend(jalaliday);

const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const weekNames = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const toJalali = (value?: string) => value ? dayjs(value).calendar('jalali') : dayjs().calendar('jalali');
const toIso = (year: number, month: number, day: number) => dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, { jalali: true }).calendar('gregory').format('YYYY-MM-DD');

type Props = {
  value?: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
};

export default function JalaliDatePicker({ value, onChange, label, required, fullWidth = true, error, helperText }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [month, setMonth] = useState<Dayjs>(() => toJalali(value));
  const selected = value ? toJalali(value) : undefined;
  const today = toJalali();
  const days = useMemo(() => {
    const count = month.daysInMonth();
    const first = Number(month.startOf('month').calendar('gregory').format('d'));
    const offset = (first + 1) % 7;
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);
  const display = selected?.format('YYYY/MM/DD') ?? '';
  const moveMonth = (amount: number) => setMonth((current) => current.add(amount, 'month').calendar('jalali'));
  const openPicker = (element: HTMLElement) => {
    setMonth(toJalali(value));
    setAnchor(element);
  };
  const closePicker = () => {
    setAnchor(null);
  };
  return <Box sx={{ position: 'relative', width: fullWidth ? '100%' : undefined }}>
    <TextField fullWidth={fullWidth} required={required} label={label} value={display} error={error} helperText={helperText} placeholder="۱۴۰۵/۰۶/۱۲" onClick={(event) => openPicker(event.currentTarget)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closePicker(); event.currentTarget.blur(); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker(event.currentTarget); } }} slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric', readOnly: true, 'aria-haspopup': 'dialog', 'aria-expanded': Boolean(anchor) }, input: { endAdornment: <IconButton size="small" aria-label="انتخاب تاریخ" onMouseDown={(event) => event.preventDefault()} onClick={(event) => openPicker(event.currentTarget)}><CalendarMonth fontSize="small" /></IconButton> } }} sx={{ '& input': { direction: 'ltr', textAlign: 'right', cursor: 'pointer' } }} />
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={closePicker} disableRestoreFocus anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <Box sx={{ p: 1.5, width: 300, direction: 'rtl' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <IconButton size="small" onClick={() => moveMonth(1)}>‹</IconButton>
          <Typography sx={{ fontWeight: 800 }}>{monthNames[month.month()]} {month.year()}</Typography>
          <IconButton size="small" onClick={() => moveMonth(-1)}>›</IconButton>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: .5 }}>
          {weekNames.map((name) => <Typography key={name} variant="caption" align="center" color="text.secondary" sx={{ py: .5, fontWeight: 700 }}>{name}</Typography>)}
          {days.map((day, index) => { const isSelected = Boolean(day && selected?.year() === month.year() && selected.month() === month.month() && selected.date() === day); const isToday = Boolean(day && today.year() === month.year() && today.month() === month.month() && today.date() === day); return <Box key={`${month.year()}-${month.month()}-${index}`} aria-current={isToday ? 'date' : undefined} onClick={() => { if (day) { onChange(toIso(month.year(), month.month() + 1, day)); closePicker(); } }} sx={{ minHeight: 32, display: 'grid', placeItems: 'center', borderRadius: 1, cursor: day ? 'pointer' : 'default', bgcolor: isSelected ? 'primary.main' : isToday ? 'warning.light' : 'transparent', color: isSelected ? 'primary.contrastText' : isToday ? 'warning.dark' : 'text.primary', fontWeight: isToday || isSelected ? 800 : 400, boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px' : undefined, borderColor: 'warning.main', '&:hover': day ? { bgcolor: isSelected ? 'primary.dark' : isToday ? 'warning.main' : 'action.hover' } : {} }}>{day ?? ''}</Box>; })}
        </Box>
      </Box>
    </Popover>
  </Box>;
}
