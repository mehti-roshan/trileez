import { Box, Card, CardContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { useApp } from '../context/AppContext.tsx';

export default function SettingsPage() {
  const { organization, user } = useApp();

  return (
    <Box>
      <PageHeader title="تنظیمات" subtitle="پیکربندی سبک فضای کاری برای پیش‌نمایش" crumbs={['تری‌لیز', 'تنظیمات']} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>سازمان</Typography>
            <Stack spacing={2}>
              <TextField label="نام سازمان" value={organization.name} />
              <TextField label="شناسه" value={organization.slug} />
              <FormControlLabel control={<Switch defaultChecked />} label="اعلان نشست مانیتورینگ برای کارمند" />
              <FormControlLabel control={<Switch defaultChecked />} label="نمایش رضایت در کلاینت ویندوز" />
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>حساب جاری</Typography>
            <Stack spacing={2}>
              <TextField label="نام" value={user.name} />
              <TextField label="ایمیل" value={user.email} />
              <TextField label="سمت" value={user.title} />
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
