import { Alert, Autocomplete, Box, Dialog, DialogActions, DialogContent, DialogTitle, Button, FormControl, FormHelperText, InputLabel, MenuItem, Select, Slider, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { customers, users } from '../../services/repositories.ts';
import { customerDisplayName } from '../../utils/customer.ts';
import { defaultProjectTags, normalizeProjectGrade, normalizeProjectTags, projectGradeLabel, projectStatusLabels } from '../../utils/project.ts';
import type { Project, ProjectStatus } from '../../types/index.ts';
import JalaliDatePicker from './JalaliDatePicker.tsx';

export type ProjectFormValues = Pick<Project, 'name' | 'customerId' | 'managerId' | 'budget' | 'grade' | 'tags' | 'status' | 'startDate' | 'endDate' | 'color' | 'description'> &
  Pick<Project, 'code' | 'website' | 'instagram' | 'telegram' | 'about' | 'goals' | 'advantages' | 'competitors' | 'contactPhone' | 'officeAddress' | 'factoryAddress'>;

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void;
  project?: Project;
  suggestedTags?: string[];
};

const today = () => new Date().toISOString().slice(0, 10);
const inThreeMonths = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date.toISOString().slice(0, 10);
};

const initialValues = (project?: Project): ProjectFormValues => ({
  code: project?.code ?? '', name: project?.name ?? '', customerId: project?.customerId ?? '', managerId: project?.managerId ?? 'u2', budget: project?.budget ?? 0, grade: project?.grade ?? 50, tags: project?.tags ?? [], status: project?.status ?? 'active',
  startDate: project?.startDate ?? today(), endDate: project?.endDate ?? inThreeMonths(), color: project?.color ?? '#1E3A8A', description: project?.description ?? '', website: project?.website ?? '', instagram: project?.instagram ?? '', telegram: project?.telegram ?? '',
  about: project?.about ?? '', goals: project?.goals ?? '', advantages: project?.advantages ?? '', competitors: project?.competitors ?? '', contactPhone: project?.contactPhone ?? '', officeAddress: project?.officeAddress ?? '', factoryAddress: project?.factoryAddress ?? '',
});

export default function ProjectFormDialog({ open, onClose, onSubmit, project, suggestedTags = [] }: Props) {
  const [values, setValues] = useState<ProjectFormValues>(() => initialValues(project));
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const close = () => { setValues(initialValues(project)); setSubmitted(false); onClose(); };
  const invalidDates = Boolean(values.startDate && values.endDate && values.endDate < values.startDate);
  const requiredMissing = !values.name.trim() || !values.customerId || !values.managerId || !values.startDate || !values.endDate;
  const save = () => {
    setSubmitted(true);
    if (requiredMissing || invalidDates) return;
    onSubmit({ ...values, name: values.name.trim(), code: values.code?.trim(), budget: Math.max(0, Number(values.budget) || 0), grade: normalizeProjectGrade(values.grade), tags: normalizeProjectTags(values.tags), description: values.description.trim() });
    setValues(initialValues(project)); setSubmitted(false);
  };

  return <Dialog open={open} onClose={close} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{project ? 'ویرایش پروژه' : 'ایجاد پروژه جدید'}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={3} sx={{ py: 1 }}>
        {submitted && requiredMissing && <Alert severity="error">نام پروژه، مشتری، مدیر پروژه و بازه زمانی الزامی هستند.</Alert>}
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>اطلاعات اصلی</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField required label="نام پروژه" value={values.name} error={submitted && !values.name.trim()} onChange={(event) => set('name', event.target.value)} />
            <TextField label="کد پروژه" placeholder="در صورت خالی‌بودن خودکار تولید می‌شود" value={values.code} onChange={(event) => set('code', event.target.value)} />
            <FormControl required error={submitted && !values.customerId}><InputLabel>مشتری</InputLabel><Select label="مشتری" value={values.customerId} onChange={(event) => set('customerId', event.target.value)}><MenuItem value="">انتخاب مشتری</MenuItem>{customers.map((customer) => <MenuItem key={customer.id} value={customer.id}>{customerDisplayName(customer)}</MenuItem>)}</Select></FormControl>
            <FormControl required error={submitted && !values.managerId}><InputLabel>مدیر پروژه</InputLabel><Select label="مدیر پروژه" value={values.managerId} onChange={(event) => set('managerId', event.target.value)}>{users.filter((user) => user.role !== 'customer' && user.isActive).map((user) => <MenuItem key={user.id} value={user.id}>{user.name} — {user.title}</MenuItem>)}</Select></FormControl>
            <FormControl><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={values.status} onChange={(event) => set('status', event.target.value as ProjectStatus)}>{Object.entries(projectStatusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
            <TextField type="number" label="بودجه پروژه (تومان)" value={values.budget} onChange={(event) => set('budget', Math.max(0, Number(event.target.value)))} slotProps={{ htmlInput: { min: 0, step: 1000000 } }} />
          </Box>
          <Autocomplete multiple freeSolo options={normalizeProjectTags([...defaultProjectTags, ...suggestedTags])} value={values.tags} onChange={(_, next) => set('tags', normalizeProjectTags(next))} renderInput={(params) => <TextField {...params} label="برچسب‌های پروژه" placeholder="مثلاً سئو یا طراحی وب‌سایت" helperText="از پیشنهادها انتخاب کنید یا برچسب جدیدی بنویسید و Enter بزنید." />} sx={{ mt: 1.5 }} />
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800 }}>درجه اهمیت پروژه</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>امتیازی از ۰ تا ۱۰۰ برای اولویت‌بندی مدیریتی پروژه.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Slider value={values.grade} min={0} max={100} step={1} valueLabelDisplay="auto" onChange={(_, value) => set('grade', Array.isArray(value) ? value[0] : value)} sx={{ flex: 1 }} />
            <TextField type="number" label="امتیاز اهمیت" value={values.grade} onChange={(event) => set('grade', normalizeProjectGrade(event.target.value, 0))} slotProps={{ htmlInput: { min: 0, max: 100 } }} sx={{ width: { sm: 150 } }} helperText={projectGradeLabel(values.grade)} />
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>برنامه زمانی</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <JalaliDatePicker required label="تاریخ شروع" value={values.startDate} onChange={(value) => set('startDate', value)} error={submitted && !values.startDate} />
            <JalaliDatePicker required label="تاریخ پایان" value={values.endDate} onChange={(value) => set('endDate', value)} error={submitted && (!values.endDate || invalidDates)} helperText={invalidDates ? 'تاریخ پایان باید بعد از تاریخ شروع باشد.' : undefined} />
          </Box>
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>شرح و اهداف</Typography>
          <Stack spacing={1.5}>
            <TextField multiline minRows={3} label="شرح پروژه" value={values.description} onChange={(event) => set('description', event.target.value)} />
            <TextField multiline minRows={2} label="درباره پروژه" value={values.about} onChange={(event) => set('about', event.target.value)} />
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField multiline minRows={3} label="اهداف" placeholder="هر هدف را در یک خط وارد کنید" value={values.goals} onChange={(event) => set('goals', event.target.value)} />
              <TextField multiline minRows={3} label="مزیت‌ها و ارزش پیشنهادی" value={values.advantages} onChange={(event) => set('advantages', event.target.value)} />
              <TextField multiline minRows={2} label="رقبا / راهکارهای جایگزین" value={values.competitors} onChange={(event) => set('competitors', event.target.value)} />
              <TextField type="color" label="رنگ پروژه" value={values.color} onChange={(event) => set('color', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>اطلاعات تماس و کانال‌ها</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField label="شماره تماس" value={values.contactPhone} onChange={(event) => set('contactPhone', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <TextField label="وب‌سایت" value={values.website} onChange={(event) => set('website', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <TextField label="اینستاگرام" value={values.instagram} onChange={(event) => set('instagram', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <TextField label="تلگرام" value={values.telegram} onChange={(event) => set('telegram', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <TextField multiline minRows={2} label="آدرس دفتر" value={values.officeAddress} onChange={(event) => set('officeAddress', event.target.value)} />
            <TextField multiline minRows={2} label="آدرس محل اجرا / کارخانه" value={values.factoryAddress} onChange={(event) => set('factoryAddress', event.target.value)} />
          </Box>
          <FormHelperText sx={{ mt: 1 }}>پس از ایجاد، مدیر پروژه به‌عنوان نخستین عضو اضافه و ساختار اولیه فاز، نقش و فعالیت ایجاد می‌شود.</FormHelperText>
        </Box>
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={close}>انصراف</Button><Button variant="contained" onClick={save}>{project ? 'ذخیره تغییرات' : 'ذخیره پروژه'}</Button></DialogActions>
  </Dialog>;
}
