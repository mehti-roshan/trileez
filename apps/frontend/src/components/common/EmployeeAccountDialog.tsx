import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { roleDefinitions } from '../../constants/roleDefinitions.ts';
import { customerRepository, userRepository } from '../../services/repositories.ts';
import { createCustomerAccount, createEmployeeAccount, generateSecurePassword } from '../../services/userAdministration.ts';
import type { Employee, PermissionKey, User, UserRole } from '../../types/index.ts';
import { customerDisplayName, customerEntityType } from '../../utils/customer.ts';

const permissionLabels: Record<PermissionKey, string> = {
  'project:view': 'مشاهده پروژه‌ها', 'project:create': 'ایجاد پروژه', 'project:update': 'ویرایش پروژه‌ها',
  'task:view': 'مشاهده وظایف', 'task:create': 'ایجاد وظیفه', 'task:update': 'ویرایش وظایف',
  'finance:view': 'مشاهده امور مالی', 'finance:pay': 'تأیید و ثبت پرداخت‌های مالی',
  'hr:view': 'مشاهده منابع انسانی', 'hr:manage-users': 'مدیریت کاربران و دسترسی‌ها', 'hr:manage-performance': 'مدیریت ارزیابی عملکرد', 'hr:reopen-performance': 'بازگشایی ارزیابی نهایی‌شده',
  'reports:view': 'مشاهده گزارش‌ها', 'document:view': 'مشاهده اسناد',
};
const allPermissions = [...new Set(roleDefinitions.flatMap((definition) => definition.permissions))] as PermissionKey[];
const emptyValues = { firstName: '', lastName: '', customerUserName: '', email: '', phone: '', role: 'member' as UserRole, password: '', title: '', department: '', personnelCode: '', customerId: '', compensationType: 'full_time_attendance' as Employee['compensationType'], hasGuarantee: false, guaranteeAmount: '' };

export default function EmployeeAccountDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { user: actor } = useApp();
  const [accountType, setAccountType] = useState<'employee' | 'customer'>('employee');
  const [values, setValues] = useState(() => ({ ...emptyValues, password: generateSecurePassword() }));
  const [customerRows, setCustomerRows] = useState(() => customerRepository.list());
  const [accounts, setAccounts] = useState<User[]>(() => userRepository.list());
  const [decisions, setDecisions] = useState<Partial<Record<PermissionKey, 'default' | 'add' | 'remove'>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isGeneratedPassword, setIsGeneratedPassword] = useState(true);
  const [revealedPassword, setRevealedPassword] = useState('');
  useEffect(() => customerRepository.subscribe(setCustomerRows), []);
  useEffect(() => userRepository.subscribe(setAccounts), []);

  const selectedCustomer = customerRows.find((customer) => customer.id === values.customerId);
  const role = roleDefinitions.find((candidate) => candidate.id === values.role) ?? roleDefinitions[2];
  const inherited = useMemo(() => new Set(role.permissions), [role]);
  const reset = () => { setAccountType('employee'); setValues({ ...emptyValues, password: generateSecurePassword() }); setIsGeneratedPassword(true); setShowPassword(false); setDecisions({}); setError(''); };
  const close = () => { if (submitting) return; reset(); onClose(); };

  const selectCustomer = (customerId: string) => {
    const customer = customerRows.find((item) => item.id === customerId);
    const isPerson = customer && customerEntityType(customer) === 'person';
    setValues((current) => ({
      ...current,
      customerId,
      customerUserName: isPerson ? customerDisplayName(customer) : '',
      title: isPerson ? 'مشتری' : '',
      email: isPerson ? customer.email : '',
      phone: isPerson ? customer.phone : '',
    }));
  };

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      if (accountType === 'customer') {
        if (!selectedCustomer) throw new Error('مشتری موردنظر را انتخاب کنید.');
        const result = await createCustomerAccount({ actor, customer: selectedCustomer, fullName: values.customerUserName, position: values.title, email: values.email, phone: values.phone, password: values.password, passwordGenerated: isGeneratedPassword });
        if (result.generatedPassword) setRevealedPassword(result.generatedPassword);
      } else {
        const result = await createEmployeeAccount({
          actor, firstName: values.firstName, lastName: values.lastName, email: values.email, phone: values.phone,
          role: values.role, password: values.password, passwordGenerated: isGeneratedPassword, title: values.title, department: values.department, personnelCode: values.personnelCode,
          compensationType: values.compensationType,
          hasGuarantee: values.hasGuarantee, guaranteeAmount: values.hasGuarantee ? Number(values.guaranteeAmount) || undefined : undefined,
          overrides: {
            additions: allPermissions.filter((permission) => decisions[permission] === 'add' && !inherited.has(permission)),
            removals: allPermissions.filter((permission) => decisions[permission] === 'remove' && inherited.has(permission)),
          },
        });
        if (result.generatedPassword) setRevealedPassword(result.generatedPassword);
      }
      reset();
      onCreated?.();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ایجاد حساب انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  };

  const customerFieldsValid = Boolean(selectedCustomer && values.customerUserName.trim() && values.title.trim() && values.email.trim() && values.phone.trim() && values.password.length >= 8);
  const employeeFieldsValid = Boolean(values.firstName.trim() && values.lastName.trim() && values.email.trim() && values.phone.trim() && values.personnelCode.trim() && values.password.length >= 8);

  return <>
  <Dialog open={open} onClose={close} fullWidth maxWidth="md" slotProps={{ paper: { sx: { direction: 'rtl', maxHeight: 'calc(100vh - 24px)' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>ایجاد کاربر</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <ToggleButtonGroup exclusive fullWidth color="primary" value={accountType} onChange={(_, next) => { if (!next) return; setAccountType(next); setValues({ ...emptyValues, password: generateSecurePassword() }); setIsGeneratedPassword(true); setDecisions({}); setError(''); }}>
        <ToggleButton value="employee">کارمند / فریلنسر</ToggleButton>
        <ToggleButton value="customer">کاربر مشتری</ToggleButton>
      </ToggleButtonGroup>

      {accountType === 'customer' ? <>
        <Box><Typography sx={{ fontWeight: 800 }}>اطلاعات کاربر مشتری</Typography><Typography variant="body2" color="text.secondary">شرکت‌ها می‌توانند چند کاربر با سمت‌های متفاوت داشته باشند؛ مشتری حقیقی فقط یک حساب دارد.</Typography></Box>
        <FormControl required fullWidth><InputLabel>مشتری</InputLabel><Select label="مشتری" value={values.customerId} onChange={(event) => selectCustomer(event.target.value)}>{customerRows.map((customer) => {
          const hasAccount = accounts.some((user) => user.customerId === customer.id);
          const unavailable = customerEntityType(customer) === 'person' && hasAccount;
          return <MenuItem key={customer.id} value={customer.id} disabled={unavailable}>{customerDisplayName(customer)} — {customerEntityType(customer) === 'company' ? 'شرکت' : unavailable ? 'شخص حقیقی (دارای حساب)' : 'شخص حقیقی'}</MenuItem>;
        })}</Select></FormControl>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField required label="نام و نام خانوادگی" value={values.customerUserName} onChange={(event) => setValues({ ...values, customerUserName: event.target.value })} />
          <TextField required label={selectedCustomer && customerEntityType(selectedCustomer) === 'company' ? 'سمت در شرکت (مانند CTO یا CFO)' : 'سمت / عنوان'} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} />
          <TextField required label="ایمیل ورود" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <TextField required label="شماره موبایل" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <PasswordField value={values.password} visible={showPassword} onChange={(password) => { setIsGeneratedPassword(false); setValues({ ...values, password }); }} onToggle={() => setShowPassword((visible) => !visible)} onGenerate={() => { setIsGeneratedPassword(true); setValues({ ...values, password: generateSecurePassword() }); }} label="رمز عبور حساب مشتری" />
        </Box>
      </> : <>
        <Typography sx={{ fontWeight: 800 }}>اطلاعات حساب</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField required label="نام" value={values.firstName} onChange={(event) => setValues({ ...values, firstName: event.target.value })} />
          <TextField required label="نام خانوادگی" value={values.lastName} onChange={(event) => setValues({ ...values, lastName: event.target.value })} />
          <TextField required label="ایمیل" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <TextField required label="شماره تماس" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <PasswordField value={values.password} visible={showPassword} onChange={(password) => { setIsGeneratedPassword(false); setValues({ ...values, password }); }} onToggle={() => setShowPassword((visible) => !visible)} onGenerate={() => { setIsGeneratedPassword(true); setValues({ ...values, password: generateSecurePassword() }); }} label="رمز عبور حساب سامانه" />
          <FormControl required><InputLabel>نقش سامانه</InputLabel><Select label="نقش سامانه" value={values.role} onChange={(event) => { setValues({ ...values, role: event.target.value as UserRole }); setDecisions({}); }}>{roleDefinitions.filter((item) => item.id !== 'customer').map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</Select></FormControl>
        </Box>
        <Divider />
        <Typography sx={{ fontWeight: 800 }}>اطلاعات همکاری</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField required label="کد پرسنلی" value={values.personnelCode} onChange={(event) => setValues({ ...values, personnelCode: event.target.value })} />
          <TextField label="سمت" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} />
          <TextField label="واحد" value={values.department} onChange={(event) => setValues({ ...values, department: event.target.value })} />
          <FormControl required sx={{ gridColumn: { sm: '1 / -1' } }}><InputLabel>نوع جبران خدمت</InputLabel><Select label="نوع جبران خدمت" value={values.compensationType} onChange={(event) => setValues({ ...values, compensationType: event.target.value as 'full_time_attendance' | 'hourly_task' })}>
            <MenuItem value="full_time_attendance"><Box><Typography sx={{ fontWeight: 700 }}>تمام‌وقت — حقوق ماهانه بر اساس کارکرد</Typography><Typography variant="caption" color="text.secondary">حقوق ماهانه با برنامه کاری و حضور و غیاب تأییدشده محاسبه می‌شود.</Typography></Box></MenuItem>
            <MenuItem value="hourly_task"><Box><Typography sx={{ fontWeight: 700 }}>پروژه‌ای/ساعتی — پرداخت بر اساس ساعات تسک‌ها</Typography><Typography variant="caption" color="text.secondary">فقط ساعات تأییدشده پروژه و تسک با نرخ ساعتی پرداخت می‌شوند.</Typography></Box></MenuItem>
          </Select></FormControl>
        </Box>
        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box><Typography sx={{ fontWeight: 700 }}>سفته ضمانت</Typography><Typography variant="caption" color="text.secondary">ثبت سفته برای پرونده همکاری اختیاری است.</Typography></Box>
            <Switch checked={values.hasGuarantee} onChange={(event) => setValues({ ...values, hasGuarantee: event.target.checked, guaranteeAmount: event.target.checked ? values.guaranteeAmount : '' })} slotProps={{ input: { 'aria-label': 'کارمند سفته ضمانت دارد' } }} />
          </Stack>
          {values.hasGuarantee && <TextField fullWidth type="number" label="مبلغ سفته (تومان)" value={values.guaranteeAmount} onChange={(event) => setValues({ ...values, guaranteeAmount: event.target.value })} slotProps={{ htmlInput: { min: 0, step: 1000000 } }} sx={{ mt: 1.5 }} />}
        </Box>
        <Divider />
        <Box><Typography sx={{ fontWeight: 800 }}>دسترسی‌ها و استثناهای شخصی</Typography><Typography variant="body2" color="text.secondary">مجوزهای نقش «{role.label}» به‌صورت پیش‌فرض اعمال می‌شوند. تغییرات زیر فقط روی همین کاربر اثر دارند.</Typography></Box>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>{allPermissions.map((permission) => {
          const isInherited = inherited.has(permission);
          const decision = decisions[permission] ?? 'default';
          return <Stack key={permission} direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Box sx={{ flex: 1 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{permissionLabels[permission]}</Typography><Typography variant="caption" color="text.secondary">{isInherited ? 'اعطا‌شده از نقش' : 'در نقش وجود ندارد'}</Typography></Box>
            <Select size="small" value={decision} onChange={(event) => setDecisions((current) => ({ ...current, [permission]: event.target.value as 'default' | 'add' | 'remove' }))} sx={{ minWidth: 130 }}>
              <MenuItem value="default">بدون تغییر</MenuItem>{!isInherited && <MenuItem value="add">افزودن برای کاربر</MenuItem>}{isInherited && <MenuItem value="remove">حذف برای کاربر</MenuItem>}
            </Select>
          </Stack>;
        })}</Box>
      </>}
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={close} disabled={submitting}>انصراف</Button><Button variant="contained" disabled={submitting || (accountType === 'customer' ? !customerFieldsValid : !employeeFieldsValid)} onClick={submit}>{submitting ? 'در حال ایجاد…' : accountType === 'customer' ? 'ایجاد کاربر مشتری' : 'ایجاد حساب و پرونده همکاری'}</Button></DialogActions>
  </Dialog>
  <Dialog open={Boolean(revealedPassword)} onClose={() => setRevealedPassword('')} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>رمز عبور یک‌بارنمایش</DialogTitle>
    <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>این رمز فقط اکنون نمایش داده می‌شود. آن را در اختیار کاربر قرار دهید؛ در پرونده کارمند، پروژه یا گزارش‌ها ذخیره نشده است.</Alert><TextField fullWidth value={revealedPassword} slotProps={{ htmlInput: { readOnly: true, dir: 'ltr' } }} sx={{ '& .MuiInputBase-input': { direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' } }} /></DialogContent>
    <DialogActions><Button onClick={() => { void navigator.clipboard?.writeText(revealedPassword); }}>کپی رمز</Button><Button variant="contained" onClick={() => setRevealedPassword('')}>متوجه شدم</Button></DialogActions>
  </Dialog>
  </>;
}

function PasswordField({ value, visible, onChange, onToggle, onGenerate, label }: { value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void; onGenerate: () => void; label: string }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth required type={visible ? 'text' : 'password'} label={label} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' }, input: { endAdornment: <InputAdornment position="end" sx={{ ml: 0.5 }}><Tooltip title={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}><IconButton onClick={onToggle} aria-label={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}>{visible ? <VisibilityOff /> : <Visibility />}</IconButton></Tooltip></InputAdornment> } }} sx={{ '& .MuiInputBase-root': { direction: 'ltr' }, '& .MuiInputLabel-root': { direction: 'rtl' } }} /><Button variant="outlined" onClick={onGenerate} sx={{ minWidth: 132, whiteSpace: 'nowrap' }}>تولید رمز امن</Button></Stack>;
}
