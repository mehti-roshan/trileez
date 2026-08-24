import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { PriorityChip } from '../components/common/StatusChip.tsx';
import { tasks } from '../mock/data.ts';
import { formatDate } from '../utils/format.ts';

export default function CalendarPage() {
  const upcoming = [...tasks]
    .filter((task) => task.dueDate)
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())
    .slice(0, 10);

  return (
    <Box>
      <PageHeader title="تقویم" subtitle="نمای ساده موعد کارها" crumbs={['تری‌لیز', 'تقویم']} />
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            {upcoming.map((task) => (
              <Stack key={task.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center',  borderBottom: '1px solid', borderColor: 'divider', pb: 1.25 }}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    موعد {formatDate(task.dueDate)}
                  </Typography>
                </Box>
                <PriorityChip value={task.priority} />
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
