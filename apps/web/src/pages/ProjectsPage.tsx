import { FolderOutlined } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { projects, users } from '../mock/data.ts';
import { formatDate, formatNumber } from '../utils/format.ts';

export default function ProjectsPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <PageHeader
        title="پروژه‌ها"
        subtitle="فضای کاری پروژه‌های جاری سازمان"
        crumbs={['تری‌لیز', 'پروژه‌ها']}
        actions={<Button variant="contained">پروژه جدید</Button>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {projects.map((project) => {
          const members = users.filter((user) => project.members.includes(user.id));
          return (
            <Card key={project.id}>
              <CardActionArea onClick={() => navigate(`/projects/${project.id}`)}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start',  mb: 1.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: project.color, mt: 1 }} />
                    <ProjectStatusChip value={project.status} />
                  </Stack>
                  <Typography sx={{ fontWeight: 700, mb: 0.75 }}>{project.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 44 }}>
                    {project.description}
                  </Typography>
                  <Stack direction="row" sx={{ justifyContent: 'space-between',  mb: 1 }}>
                    <Typography variant="caption">پیشرفت</Typography>
                    <Typography variant="caption">{formatNumber(project.progress)}٪</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={project.progress} sx={{ height: 8, borderRadius: 99, mb: 2 }} />
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stack direction="row">
                      {members.slice(0, 4).map((member) => (
                        <Box key={member.id} sx={{ ml: -0.75 }}>
                          <UserAvatar user={member} size={28} />
                        </Box>
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(project.completedTasksCount)} از {formatNumber(project.tasksCount)} کار • {formatDate(project.endDate)}
                    </Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
      {projects.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
          <FolderOutlined />
          <Typography>پروژه‌ای ثبت نشده است.</Typography>
        </Box>
      ) : null}
    </Box>
  );
}
