import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';

export default function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { await onLogin(email, password); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : 'ورود انجام نشد.';
      setError(message === 'Password change required' ? 'برای ادامه باید رمز عبور را تغییر دهید.' : message);
    }
    finally { setSubmitting(false); }
  };
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2, direction: 'rtl' }}>
    <Card component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 440 }}><CardContent><Stack spacing={2.25}>
      <Box><Typography variant="h5" sx={{ fontWeight: 900 }}>ورود به پنل تری‌لیز</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>احراز هویت این صفحه از API و JWT استفاده می‌کند.</Typography></Box>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField required label="ایمیل" type="email" value={email} onChange={(event) => setEmail(event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <TextField required label="رمز عبور" type="password" value={password} onChange={(event) => setPassword(event.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <Button type="submit" variant="contained" size="large" disabled={submitting}>{submitting ? <CircularProgress size={22} color="inherit" /> : 'ورود'}</Button>
    </Stack></CardContent></Card>
  </Box>;
}
