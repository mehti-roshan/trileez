import { Alert, Box, Card, CardContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { useApp } from '../context/AppContext.tsx';

export default function SettingsPage() {
  const { organization, user } = useApp();

  return (
    <Box>
      <PageHeader title="تنظیمات" subtitle="مشاهده پیکربندی فعلی فضای کاری" crumbs={['تری‌لیز', 'تنظیمات']} />
      <Alert severity="info" sx={{ mb: 2 }}>ویرایش تنظیمات سازمان و حساب هنوز به backend متصل نشده و در نسخه MVP غیرفعال است. مقادیر این صفحه فقط برای مشاهده هستند.</Alert>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>سازمان</Typography>
            <Stack spacing={2}>
              <TextField label="نام سازمان" value={organization.name} slotProps={{ input: { readOnly: true } }} />
              <TextField label="شناسه" value={organization.slug} slotProps={{ input: { readOnly: true } }} />
              <FormControlLabel control={<Switch checked disabled />} label="اعلان نشست مانیتورینگ برای کارمند" />
              <FormControlLabel control={<Switch checked disabled />} label="نمایش رضایت در کلاینت ویندوز" />
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>حساب جاری</Typography>
            <Stack spacing={2}>
              <TextField label="نام" value={user.name} slotProps={{ input: { readOnly: true } }} />
              <TextField label="ایمیل" value={user.email} slotProps={{ input: { readOnly: true } }} />
              <TextField label="سمت" value={user.title} slotProps={{ input: { readOnly: true } }} />
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
