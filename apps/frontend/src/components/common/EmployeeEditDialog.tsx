import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { compensationRepository, employeeRepository, userRepository } from '../../services/repositories.ts';
import type { Employee, EmploymentCompensation } from '../../types/index.ts';

type Props = { open: boolean; employee: Employee | null; onClose: () => void };
type FormValues = {
  fullName: string;
  personnelCode: string;
  email: string;
  phone: string;
  nationalId: string;
  jobTitle: string;
  department: string;
  employmentStatus: Employee['employmentStatus'];
  employmentType: Employee['employmentType'];
  compensationType: Employee['compensationType'];
  workLocation: string;
  workMode: Employee['workMode'];
  leaveBalance: string;
  hasGuarantee: boolean;
  guaranteeAmount: string;
};

const emptyValues: FormValues = {
  fullName: '', personnelCode: '', email: '', phone: '', nationalId: '', jobTitle: '', department: '',
  employmentStatus: 'active', employmentType: 'full_time', compensationType: 'full_time_attendance', workLocation: '', workMode: 'ترکیبی',
  leaveBalance: '0', hasGuarantee: false, guaranteeAmount: '',
};

const toValues = (employee: Employee | null): FormValues => employee ? {
  fullName: employee.fullName,
  personnelCode: employee.personnelCode,
  email: employee.email,
  phone: employee.phone,
  nationalId: employee.nationalId,
  jobTitle: employee.jobTitle,
  department: employee.department,
  employmentStatus: employee.employmentStatus,
  employmentType: employee.employmentType,
  compensationType: employee.compensationType,
  workLocation: employee.workLocation,
  workMode: employee.workMode,
  leaveBalance: String(employee.leaveBalance ?? 0),
  hasGuarantee: Boolean(employee.hasGuarantee),
  guaranteeAmount: employee.guaranteeAmount ? String(employee.guaranteeAmount) : '',
} : emptyValues;

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() ?? '', lastName: parts.join(' ') };
};

export default function EmployeeEditDialog({ open, employee, onClose }: Props) {
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [compensations, setCompensations] = useState<EmploymentCompensation[]>(() => compensationRepository.list());

  useEffect(() => compensationRepository.subscribe(setCompensations), []);

  useEffect(() => {
    setValues(toValues(employee));
    setError('');
  }, [employee]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!employee || saving) return;
    if (!values.fullName.trim() || !values.personnelCode.trim() || !values.email.trim() || !values.phone.trim()) {
      setError('نام، کد پرسنلی، ایمیل و شماره تماس الزامی است.');
      return;
    }
    setSaving(true);
    try {
      const patch = {
        fullName: values.fullName.trim(), personnelCode: values.personnelCode.trim(), email: values.email.trim(), phone: values.phone.trim(),
        nationalId: values.nationalId.trim(), jobTitle: values.jobTitle.trim() || 'کارشناس', department: values.department.trim() || 'سازمانی',
        employmentStatus: values.employmentStatus, employmentType: values.employmentType, compensationType: values.compensationType, workLocation: values.workLocation.trim() || 'تعیین نشده',
        workMode: values.workMode, leaveBalance: Number(values.leaveBalance) || 0,
        hasGuarantee: values.hasGuarantee, guaranteeAmount: values.hasGuarantee && Number(values.guaranteeAmount) > 0 ? Number(values.guaranteeAmount) : undefined,
      } satisfies Partial<Employee>;
      await employeeRepository.update(employee.id, patch);
      if (employee.userId) {
        const { firstName, lastName } = splitName(patch.fullName!);
        await userRepository.update(employee.userId, { name: patch.fullName, firstName, lastName, email: patch.email, phone: patch.phone, title: patch.jobTitle });
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ویرایش اطلاعات کارمند انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveCompensation = employee ? compensations
    .filter((item) => item.employeeId === employee.id && item.status === 'active')
    .sort((left, right) => Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom))[0] : undefined;

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl', maxHeight: 'calc(100vh - 24px)' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>ویرایش اطلاعات کارمند</DialogTitle>
    <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth required label="نام و نام خانوادگی" value={values.fullName} onChange={(event) => set('fullName', event.target.value)} />
        <TextField fullWidth required label="کد پرسنلی" value={values.personnelCode} onChange={(event) => set('personnelCode', event.target.value)} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth required label="ایمیل" value={values.email} onChange={(event) => set('email', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
        <TextField fullWidth required label="شماره تماس" value={values.phone} onChange={(event) => set('phone', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth label="کد ملی" value={values.nationalId} onChange={(event) => set('nationalId', event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
        <TextField fullWidth label="سمت" value={values.jobTitle} onChange={(event) => set('jobTitle', event.target.value)} />
        <TextField fullWidth label="واحد" value={values.department} onChange={(event) => set('department', event.target.value)} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <FormControl fullWidth><InputLabel>وضعیت همکاری</InputLabel><Select label="وضعیت همکاری" value={values.employmentStatus} onChange={(event) => set('employmentStatus', event.target.value as Employee['employmentStatus'])}><MenuItem value="active">فعال</MenuItem><MenuItem value="leave">در مرخصی</MenuItem><MenuItem value="suspended">تعلیق</MenuItem><MenuItem value="terminated">خاتمه همکاری</MenuItem></Select></FormControl>
        <FormControl fullWidth><InputLabel>نوع همکاری</InputLabel><Select label="نوع همکاری" value={values.employmentType} onChange={(event) => set('employmentType', event.target.value as Employee['employmentType'])}><MenuItem value="full_time">تمام‌وقت</MenuItem><MenuItem value="part_time">پاره‌وقت</MenuItem><MenuItem value="project">پروژه‌ای</MenuItem><MenuItem value="intern">کارآموز</MenuItem></Select></FormControl>
        <FormControl fullWidth><InputLabel>شیوه کار</InputLabel><Select label="شیوه کار" value={values.workMode} onChange={(event) => set('workMode', event.target.value as Employee['workMode'])}><MenuItem value="حضوری">حضوری</MenuItem><MenuItem value="دورکاری">دورکاری</MenuItem><MenuItem value="ترکیبی">ترکیبی</MenuItem></Select></FormControl>
      </Stack>
      <FormControl fullWidth required><InputLabel>نوع جبران خدمت</InputLabel><Select label="نوع جبران خدمت" value={values.compensationType} onChange={(event) => set('compensationType', event.target.value as Employee['compensationType'])}>
        <MenuItem value="full_time_attendance"><Box><Typography sx={{ fontWeight: 700 }}>تمام‌وقت — حقوق ماهانه بر اساس کارکرد</Typography><Typography variant="caption" color="text.secondary">مبنای حقوق: برنامه کاری و حضور و غیاب تأییدشده</Typography></Box></MenuItem>
        <MenuItem value="hourly_task"><Box><Typography sx={{ fontWeight: 700 }}>پروژه‌ای/ساعتی — پرداخت بر اساس ساعات تسک‌ها</Typography><Typography variant="caption" color="text.secondary">مبنای پرداخت: ساعات تأییدشده پروژه و تسک</Typography></Box></MenuItem>
      </Select></FormControl>
      <Alert severity="info">
        {values.compensationType === 'full_time_attendance'
          ? `پیکربندی مرتبط: حقوق ماهانه ${effectiveCompensation?.paymentMethod === 'full_time_attendance' ? Number(effectiveCompensation.monthlySalary ?? 0).toLocaleString('fa-IR') : 'تعریف نشده'} ریال؛ برنامه هفتگی ${effectiveCompensation?.paymentMethod === 'full_time_attendance' ? ((effectiveCompensation.expectedSchedule.weeklyExpectedMinutes ?? 0) / 60).toLocaleString('fa-IR') : '۰'} ساعت.`
          : `پیکربندی مرتبط: نرخ ساعتی ${effectiveCompensation?.paymentMethod === 'hourly_task' ? Number(effectiveCompensation.hourlyRate ?? 0).toLocaleString('fa-IR') : 'تعریف نشده'} ریال؛ مبنا فقط ساعات تسک تأییدشده است.`}
        {effectiveCompensation && ' تغییر مستقیم نوع پس از ثبت سابقه مجاز نیست و سرور از آن جلوگیری می‌کند.'}
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth label="محل کار" value={values.workLocation} onChange={(event) => set('workLocation', event.target.value)} />
        <TextField fullWidth type="number" label="مانده مرخصی" value={values.leaveBalance} onChange={(event) => set('leaveBalance', event.target.value)} slotProps={{ htmlInput: { min: 0, dir: 'ltr' } }} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <FormControl fullWidth><InputLabel>سفته ضمانت</InputLabel><Select label="سفته ضمانت" value={values.hasGuarantee ? 'yes' : 'no'} onChange={(event) => set('hasGuarantee', event.target.value === 'yes')}><MenuItem value="yes">دارد</MenuItem><MenuItem value="no">ندارد</MenuItem></Select></FormControl>
        <TextField fullWidth type="number" label="مبلغ سفته" disabled={!values.hasGuarantee} value={values.guaranteeAmount} onChange={(event) => set('guaranteeAmount', event.target.value)} slotProps={{ htmlInput: { min: 0, dir: 'ltr' } }} />
      </Stack>
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>انصراف</Button><Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</Button></DialogActions>
  </Dialog>;
}
