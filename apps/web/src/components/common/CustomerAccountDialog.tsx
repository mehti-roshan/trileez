import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { createCustomerAccount } from '../../services/userAdministration.ts';
import type { Customer } from '../../types/index.ts';
import { customerDisplayName, customerEntityType } from '../../utils/customer.ts';

export default function CustomerAccountDialog({ open, customer, onClose }: { open: boolean; customer: Customer; onClose: () => void }) {
  const { user: actor } = useApp();
  const isPerson = customerEntityType(customer) === 'person';
  const initialValues = () => ({
    fullName: isPerson ? customerDisplayName(customer) : '',
    position: isPerson ? 'مشتری' : '',
    email: isPerson ? customer.email ?? '' : '',
    phone: isPerson ? customer.phone ?? '' : '',
    password: '',
  });
  const [values, setValues] = useState(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const close = () => { setError(''); setValues(initialValues()); setShowPassword(false); onClose(); };
  const submit = async () => {
    setError(''); setSubmitting(true);
    try { await createCustomerAccount({ actor, customer, ...values }); close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ایجاد حساب مشتری انجام نشد.'); }
    finally { setSubmitting(false); }
  };
  return <Dialog open={open} onClose={submitting ? undefined : close} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
    <DialogTitle sx={{ fontWeight: 800 }}>{isPerson ? 'ایجاد حساب سامانه برای مشتری' : 'افزودن کاربر شرکت'}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="body2" color="text.secondary">این حساب به «{customerDisplayName(customer)}» متصل می‌شود و فقط به اطلاعات مجاز همین مشتری دسترسی خواهد داشت.</Typography>
      <TextField required label="نام و نام خانوادگی" value={values.fullName} onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))} />
      <TextField required={!isPerson} label={isPerson ? 'سمت / عنوان' : 'سمت در شرکت (مانند CTO یا CFO)'} value={values.position} onChange={(event) => setValues((current) => ({ ...current, position: event.target.value }))} />
      <TextField required label="ایمیل ورود" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} slotProps={{ htmlInput: { dir: 'ltr' } }} sx={{ '& .MuiInputBase-input': { direction: 'ltr', textAlign: 'left' } }} />
      <TextField required label="شماره موبایل" value={values.phone} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} slotProps={{ htmlInput: { dir: 'ltr' } }} sx={{ '& .MuiInputBase-input': { direction: 'ltr', textAlign: 'left' } }} />
      <TextField required type={showPassword ? 'text' : 'password'} label="رمز عبور حساب مشتری" autoComplete="new-password" value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' }, input: { endAdornment: <InputAdornment position="end" sx={{ ml: 0.5 }}><Tooltip title={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}><IconButton onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}>{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></Tooltip></InputAdornment> } }} sx={{ '& .MuiInputBase-root': { direction: 'ltr' }, '& .MuiInputLabel-root': { direction: 'rtl' } }} />
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={close} disabled={submitting}>انصراف</Button><Button variant="contained" onClick={submit} disabled={submitting || !values.fullName.trim() || (!isPerson && !values.position.trim()) || !values.email.trim() || !values.phone.trim() || values.password.length < 8}>{submitting ? 'در حال ایجاد…' : isPerson ? 'ایجاد حساب مشتری' : 'افزودن کاربر شرکت'}</Button></DialogActions>
  </Dialog>;
}
