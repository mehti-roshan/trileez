import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack, TextField } from '@mui/material';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { projectPhases, projects, taskLabels, users } from '../../mock/data.ts';
import type { Priority, Task, TaskStatus } from '../../types/index.ts';
import { TagSelect } from './TagSelect.tsx';

const empty = { title: '', projectId: '', phaseId: '', description: '', status: 'todo' as TaskStatus, priority: 'medium' as Priority, startDate: '', dueDate: '', repeatEvery: '', estimatedHours: '8', hourlyRate: '200000', assigneeIds: [] as string[], followerIds: [] as string[], labelIds: [] as string[], tags: '', customerVisible: false };

export default function TaskFormDialog({ open, task, defaultProjectId, onClose, onSave }: { open: boolean; task?: Task | null; defaultProjectId?: string; onClose: () => void; onSave: (values: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void }) {
  const [form, setForm] = useState(empty); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(task ? { title: task.title, projectId: task.projectId, phaseId: task.phaseId ?? '', description: task.description ?? '', status: task.status, priority: task.priority, startDate: task.startDate?.slice(0, 10) ?? '', dueDate: task.dueDate?.slice(0, 10) ?? '', repeatEvery: task.repeatEvery?.toString() ?? '', estimatedHours: (task.estimatedHours ?? 8).toString(), hourlyRate: (task.hourlyRate ?? 200000).toString(), assigneeIds: task.assigneeIds ?? [task.assigneeId], followerIds: task.followerIds ?? [], labelIds: task.labelIds ?? [], tags: task.tags.join('، '), customerVisible: task.customerVisible ?? false } : { ...empty, projectId: defaultProjectId ?? '' });
    setError('');
  }, [defaultProjectId, open, task]);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!form.title.trim() || !form.projectId) return setError('عنوان و پروژه الزامی هستند.');
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) return setError('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.');
    if (Number(form.hourlyRate) < 0 || Number(form.estimatedHours) < 0 || (form.repeatEvery && Number(form.repeatEvery) < 1)) return setError('نرخ ساعتی، ساعت تخمینی و فاصله تکرار باید معتبر باشند.');
    const assignees = form.assigneeIds.length ? form.assigneeIds : ['u1'];
    onSave({ title: form.title.trim(), projectId: form.projectId, phaseId: form.phaseId || undefined, description: form.description.trim(), status: form.status, priority: form.priority, assigneeId: assignees[0], assigneeIds: assignees, followerIds: form.followerIds, startDate: form.startDate || undefined, dueDate: form.dueDate || new Date().toISOString(), repeatEvery: form.repeatEvery ? Number(form.repeatEvery) : undefined, estimatedHours: Number(form.estimatedHours) || 0, hourlyRate: Number(form.hourlyRate) || 0, tags: form.tags.split(/[،,]/).map((tag) => tag.trim()).filter(Boolean), labelIds: form.labelIds, customerVisible: form.customerVisible });
    setSaved(true); onClose();
  };
  return <><Dialog open={open} onClose={onClose} fullWidth maxWidth="md"><DialogTitle>{task ? 'ویرایش وظیفه' : 'ایجاد وظیفه جدید'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    <TextField required label="عنوان وظیفه" value={form.title} onChange={(e) => set('title', e.target.value)} />
    <FormControl required><InputLabel>پروژه</InputLabel><Select label="پروژه" value={form.projectId} onChange={(e) => { set('projectId', e.target.value); set('phaseId', ''); }}><MenuItem value="">انتخاب پروژه</MenuItem>{projects.map((project) => <MenuItem key={project.id} value={project.id}>{project.code} — {project.name}</MenuItem>)}</Select></FormControl>
    <FormControl><InputLabel>فاز پروژه</InputLabel><Select label="فاز پروژه" value={form.phaseId} onChange={(e) => set('phaseId', e.target.value)}><MenuItem value="">بدون فاز</MenuItem>{projectPhases.filter((phase) => phase.projectId === form.projectId).map((phase) => <MenuItem key={phase.id} value={phase.id}>{phase.title}</MenuItem>)}</Select></FormControl>
    <TextField label="توضیحات" multiline minRows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><FormControl fullWidth><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={form.status} onChange={(e) => set('status', e.target.value)}>{[['todo','انجام نشده'],['in_progress','در حال انجام'],['review','بازبینی'],['done','انجام‌شده']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl fullWidth><InputLabel>اولویت</InputLabel><Select label="اولویت" value={form.priority} onChange={(e) => set('priority', e.target.value)}>{[['low','کم'],['medium','متوسط'],['high','بالا'],['urgent','فوری']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl></Stack>
    <TagSelect options={taskLabels} value={form.labelIds} onChange={(value) => set('labelIds', value)} label="لیبل‌های وظیفه" />
    <TextField label="تگ‌های کاربرساز" placeholder="مثلاً مشتری، فنی، انتشار" value={form.tags} onChange={(e) => set('tags', e.target.value)} helperText="تگ‌ها را با ویرگول جدا کنید." />
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><TextField fullWidth type="date" label="تاریخ شروع" slotProps={{ inputLabel: { shrink: true } }} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /><TextField fullWidth required type="date" label="تاریخ پایان" slotProps={{ inputLabel: { shrink: true } }} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><TextField fullWidth type="number" label="تکرار هر چند روز" value={form.repeatEvery} onChange={(e) => set('repeatEvery', e.target.value)} /><TextField fullWidth type="number" label="ساعت تخمینی" value={form.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} /><TextField fullWidth type="number" label="نرخ ساعتی (تومان)" value={form.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} /></Stack>
    <Autocomplete multiple options={users.filter((user) => !form.projectId || projects.find((project) => project.id === form.projectId)?.members.includes(user.id))} value={users.filter((user) => form.assigneeIds.includes(user.id))} getOptionLabel={(user) => user.name} onChange={(_, next) => set('assigneeIds', next.map((user) => user.id))} renderInput={(params) => <TextField {...params} label="افراد مسئول" placeholder="انتخاب اعضای پروژه" />} />
    <Autocomplete multiple options={users.filter((user) => !form.projectId || projects.find((project) => project.id === form.projectId)?.members.includes(user.id))} value={users.filter((user) => form.followerIds.includes(user.id))} getOptionLabel={(user) => user.name} onChange={(_, next) => set('followerIds', next.map((user) => user.id))} renderInput={(params) => <TextField {...params} label="دنبال‌کنندگان" placeholder="مدیران و افراد مطلع" />} />
    <FormControl><InputLabel>نمایش برای مشتری</InputLabel><Select label="نمایش برای مشتری" value={form.customerVisible ? 'yes' : 'no'} onChange={(e) => set('customerVisible', e.target.value === 'yes')}><MenuItem value="no">خیر، فقط داخلی</MenuItem><MenuItem value="yes">بله، قابل مشاهده برای مشتری</MenuItem></Select></FormControl>
    {error && <Alert severity="error">{error}</Alert>}
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>انصراف</Button><Button variant="contained" onClick={submit}>ذخیره وظیفه</Button></DialogActions></Dialog><Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} message="وظیفه با موفقیت ذخیره شد." /></>;
}
