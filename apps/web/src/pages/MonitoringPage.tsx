import { Box, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { DeviceStatusChip, SessionStatusChip } from '../components/common/StatusChip.tsx';
import { activities, devices, screenshots, sessions } from '../mock/data.ts';
import { formatRelative } from '../utils/format.ts';

const tones: Record<string, string> = {
  blue: 'linear-gradient(135deg, #1E3A8A, #60A5FA)',
  emerald: 'linear-gradient(135deg, #047857, #6EE7B7)',
  slate: 'linear-gradient(135deg, #334155, #94A3B8)',
  amber: 'linear-gradient(135deg, #B45309, #FCD34D)',
};

export default function MonitoringPage() {
  return (
    <Box>
      <PageHeader
        title="مانیتورینگ"
        subtitle="وضعیت دستگاه‌ها، پیش‌نمایش صفحه و نشست‌های دارای رضایت"
        crumbs={['تری‌لیز', 'مانیتورینگ']}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        {devices.slice(0, 4).map((device) => (
          <Card key={device.id}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between',  mb: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{device.name}</Typography>
                <DeviceStatusChip value={device.status} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {device.userName}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block',  mt: 1 }}>
                آخرین فعالیت: {formatRelative(device.lastSeen)}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                Agent {device.agentVersion}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block',  mt: 1 }}>
                سلامت دستگاه
              </Typography>
              <LinearProgress variant="determinate" value={device.health} sx={{ height: 8, borderRadius: 99, mt: 0.5 }} />
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography sx={{ fontWeight: 700, mb: 1.5 }}>پیش‌نمایش صفحه (شبیه‌سازی‌شده)</Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        {screenshots.map((shot) => (
          <Card key={shot.id}>
            <Box sx={{ height: 120, background: tones[shot.tone], position: 'relative' }}>
              <Box sx={{ position: 'absolute', inset: 16, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: 1 }} />
              <Box sx={{ position: 'absolute', top: 24, right: 24, width: 48, height: 8, bgcolor: 'rgba(255,255,255,0.45)', borderRadius: 99 }} />
            </Box>
            <CardContent>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {shot.deviceName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {shot.label} • {formatRelative(shot.capturedAt)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>نشست‌های مانیتورینگ</Typography>
            <Stack spacing={1.5}>
              {sessions.map((session) => {
                const device = devices.find((item) => item.id === session.deviceId);
                return (
                  <Box key={session.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 700 }}>{device?.name}</Typography>
                      <SessionStatusChip value={session.status} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      اپراتور: {session.operatorName}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      رضایت: {session.consentMode === 'attended' ? 'با حضور کارمند' : 'بدون حضور'}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap',  mt: 1 }}>
                      {session.capabilities.map((cap) => (
                        <Chip key={cap} size="small" label={cap} />
                      ))}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>خط زمان فعالیت</Typography>
            <Stack spacing={2}>
              {activities
                .filter((activity) => activity.entityType === 'device' || activity.entityType === 'session')
                .map((activity) => (
                  <Box key={activity.id}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {activity.entityName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {activity.description}
                    </Typography>
                    <Typography variant="caption">{formatRelative(activity.createdAt)}</Typography>
                  </Box>
                ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
