import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { changePasswordErrorText } from '../../services/passwordChangeText.ts';

export default function ChangePasswordPage({
  email,
  initialCurrentPassword = '',
  onSubmit,
  onCancel,
}: {
  email?: string;
  initialCurrentPassword?: string;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState(initialCurrentPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }
    setSubmitting(true);
    try { await onSubmit(currentPassword, newPassword); }
    catch (reason) { setError(changePasswordErrorText(reason)); }
    finally { setSubmitting(false); }
  };
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2, direction: 'rtl' }}>
    <Card component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 440 }}><CardContent><Stack spacing={2.25}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>تغییر رمز عبور</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>برای ورود به پنل باید رمز عبور موقت را عوض کنید.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {email && <TextField label="ایمیل" value={email} slotProps={{ input: { readOnly: true }, htmlInput: { dir: 'ltr' } }} />}
      <TextField required label="رمز عبور فعلی" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <TextField required label="رمز عبور جدید" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} helperText="حداقل ۱۲ نویسه، شامل حرف بزرگ، حرف کوچک، عدد و نماد." slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <TextField required label="تکرار رمز عبور جدید" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? <CircularProgress size={22} color="inherit" /> : 'ذخیره و ورود'}</Button>
      <Button type="button" color="inherit" disabled={submitting} onClick={onCancel}>انصراف</Button>
    </Stack></CardContent></Card>
  </Box>;
}
