import { Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import { ChatBubbleOutlined } from '@mui/icons-material';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import TaskCard from '../components/common/TaskCard.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { activities, customers, expenses, invoices, payments, projectEvents, projectMembers, projects, tasks, timesheets, users } from '../mock/data.ts';
import type { TaskStatus } from '../types/index.ts';
import { formatCurrency, formatDate, formatNumber, formatRelative, taskStatusLabel } from '../utils/format.ts';

const columns: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const project = projects.find((item) => item.id === id);
  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === project?.id), [project?.id]);
  const members = users.filter((user) => project?.members.includes(user.id));
  const financial = project ? {
    invoiced: invoices.filter((item) => item.projectId === project.id).reduce((sum, item) => sum + item.amount, 0),
    received: payments.filter((item) => item.projectId === project.id && item.status === 'تایید شده').reduce((sum, item) => sum + item.amount, 0),
    costs: expenses.filter((item) => item.projectId === project.id).reduce((sum, item) => sum + item.amount, 0),
  } : { invoiced: 0, received: 0, costs: 0 };
  const memberRows = projectMembers.filter((member) => member.projectId === project?.id);
  const projectHours = timesheets.filter((entry) => entry.projectId === project?.id).reduce((sum, entry) => sum + entry.hours, 0);
  const laborCost = timesheets.filter((entry) => entry.projectId === project?.id).reduce((sum, entry) => sum + (entry.calculatedCost ?? entry.hours * (entry.hourlyRate ?? 200_000)), 0);

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
        subtitle={`${project.description} • مشتری: ${customers.find((customer) => customer.id === project.customerId)?.company ?? '—'}`}
        crumbs={['تری‌لیز', 'پروژه‌ها', project.name]}
        actions={<Button variant="outlined" startIcon={<ChatBubbleOutlined />} onClick={() => navigate(`/chat?project=${project.id}`)}>گفتگوی پروژه</Button>}
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
            <Typography variant="body2" sx={{ mt: 1.5 }}>مشتری: <strong>{customers.find((customer) => customer.id === project.customerId)?.company ?? '—'}</strong></Typography>
            <Typography variant="body2">مدیر پروژه: <strong>{users.find((user) => user.id === project.managerId)?.name ?? '—'}</strong></Typography>
            <Typography variant="body2">بازه: {formatDate(project.startDate)} تا {formatDate(project.endDate)}</Typography>
            <Typography variant="body2">بودجه: <strong>{new Intl.NumberFormat('fa-IR').format(project.budget)} تومان</strong></Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 1.5 }}>اعضا</Typography>
            <Stack spacing={1.25}>
              {members.map((member) => {
                const membership = memberRows.find((item) => item.personId === member.id);
                return (
                <Stack key={member.id} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <UserAvatar user={member} size={32} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {member.name} <Typography component="span" variant="caption" color="text.secondary">{membership?.role ?? 'عضو پروژه'}</Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.title}
                    </Typography>
                  </Box>
                </Stack>
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>هزینه نیروی انسانی: {formatCurrency(laborCost)} • {projectHours} ساعت ثبت‌شده</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="بورد کارها" />
        <Tab label="فعالیت" />
        <Tab label="خلاصه مالی" />
        <Tab label="رویدادها" />
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
      ) : tab === 1 ? (
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
      ) : tab === 2 ? (
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 800, mb: 2 }}>خلاصه مالی پروژه</Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
              {[
                ['ارزش قرارداد', project.budget],
                ['فاکتور شده', financial.invoiced],
                ['دریافت شده', financial.received],
                ['هزینه پروژه', financial.costs],
                ['سود تقریبی', financial.invoiced - financial.costs],
              ].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.5, bgcolor: '#F8FAFC', borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 800, mt: .5 }}>{formatCurrency(Number(value))}</Typography></Box>)}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>مشتری: {customers.find((customer) => customer.id === project.customerId)?.company ?? '—'} • مانده دریافت: {formatCurrency(financial.invoiced - financial.received)}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 800, mb: 1.5 }}>تایم‌لاین رویدادهای پروژه</Typography>
            <Stack spacing={1.5}>
              {projectEvents.filter((event) => event.projectId === project.id).map((event) => (
                <Box key={event.id} sx={{ p: 1.5, borderRight: '3px solid', borderColor: event.status === 'completed' ? 'success.main' : 'warning.main', bgcolor: '#F8FAFC' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 700 }}>{event.eventType}</Typography><Chip size="small" label={event.stage} /></Stack>
                  <Typography variant="caption" color="text.secondary">{formatDate(event.date)} • ثبت‌کننده: {event.registeredBy}</Typography>
                  <Typography variant="body2" sx={{ mt: .5 }}>{event.description}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
