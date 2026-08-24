import { Box, Card, CardContent, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import TaskCard from '../components/common/TaskCard.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { activities, projects, tasks, users } from '../mock/data.ts';
import type { TaskStatus } from '../types/index.ts';
import { formatDate, formatNumber, formatRelative, taskStatusLabel } from '../utils/format.ts';

const columns: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const project = projects.find((item) => item.id === id);
  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === project?.id), [project?.id]);
  const members = users.filter((user) => project?.members.includes(user.id));

  if (!project) {
    return (
      <Box>
        <PageHeader title="پروژه یافت نشد" crumbs={['تری‌لیز', 'پروژه‌ها']} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={project.name}
        subtitle={project.description}
        crumbs={['تری‌لیز', 'پروژه‌ها', project.name]}
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between',  mb: 2 }}>
              <ProjectStatusChip value={project.status} />
              <Typography variant="caption">پایان: {formatDate(project.endDate)}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              پیشرفت کلی
            </Typography>
            <LinearProgress variant="determinate" value={project.progress} sx={{ height: 10, borderRadius: 99, mb: 1 }} />
            <Typography variant="caption">{formatNumber(project.progress)}٪ تکمیل شده</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 1.5 }}>اعضا</Typography>
            <Stack spacing={1.25}>
              {members.map((member) => (
                <Stack key={member.id} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <UserAvatar user={member} size={32} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {member.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.title}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="بورد کارها" />
        <Tab label="فعالیت" />
      </Tabs>

      {tab === 0 ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
          {columns.map((status) => (
            <Box key={status} sx={{ bgcolor: '#F1F5F9', borderRadius: 2, p: 1.5, minHeight: 240 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                {taskStatusLabel[status]}
              </Typography>
              <Stack spacing={1.25}>
                {projectTasks
                  .filter((task) => task.status === status)
                  .map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => navigate('/tasks')} />
                  ))}
              </Stack>
            </Box>
          ))}
        </Box>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              {activities
                .filter((activity) => activity.entityId === project.id || projectTasks.some((task) => task.id === activity.entityId))
                .map((activity) => (
                  <Box key={activity.id}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {activity.userName}
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
      )}
    </Box>
  );
}
