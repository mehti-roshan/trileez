import {
  AssignmentOutlined,
  ConfirmationNumberOutlined,
  DevicesOutlined,
  FolderOutlined,
  PeopleOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { Box, Button, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeader from '../components/common/PageHeader.tsx';
import StatCard from '../components/common/StatCard.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import {
  activities,
  customers,
  devices,
  projects,
  tasks,
  ticketCategorySeries,
  tickets,
  users,
  weeklyTaskSeries,
} from '../mock/data.ts';
import { formatNumber, formatRelative } from '../utils/format.ts';

const pieColors = ['#1E3A8A', '#DC2626', '#D97706', '#64748B'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const todayTasks = tasks.filter((task) => task.dueDate && new Date(task.dueDate) >= start && new Date(task.dueDate) <= today);
  const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate) < start && task.status !== 'done');
  const openTickets = tickets.filter((ticket) => ticket.status !== 'closed');
  const onlineDevices = devices.filter((device) => device.status === 'online');

  return (
    <Box>
      <PageHeader
        title="داشبورد"
        subtitle="نمای کلی کارها، مشتریان و وضعیت دستگاه‌های سازمان"
        crumbs={['تری‌لیز', 'داشبورد']}
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => navigate('/tasks')}>
              کار جدید
            </Button>
            <Button variant="contained" onClick={() => navigate('/monitoring')}>
              مشاهده مانیتورینگ
            </Button>
          </Stack>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
          mb: 3,
        }}
      >
        <StatCard title="پروژه‌ها" value={formatNumber(projects.length)} hint="۴ پروژه فعال در این فضا" icon={<FolderOutlined />} />
        <StatCard title="کارهای امروز" value={formatNumber(todayTasks.length)} hint="موعد امروز" icon={<AssignmentOutlined />} color="#047857" />
        <StatCard title="کارهای عقب‌افتاده" value={formatNumber(overdue.length)} hint="نیاز به پیگیری فوری" icon={<WarningAmberOutlined />} color="#B45309" />
        <StatCard title="تیکت‌های باز" value={formatNumber(openTickets.length)} hint="صف پشتیبانی" icon={<ConfirmationNumberOutlined />} color="#DC2626" />
        <StatCard title="مشتریان" value={formatNumber(customers.length)} hint="حساب‌های فعال و سرنخ" icon={<PeopleOutlined />} color="#0E7490" />
        <StatCard
          title="وضعیت دستگاه‌ها"
          value={`${formatNumber(onlineDevices.length)} / ${formatNumber(devices.length)}`}
          hint="آنلاین نسبت به کل"
          icon={<DevicesOutlined />}
          color="#059669"
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, mb: 3 }}>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>روند هفتگی کارها</Typography>
            <Box sx={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTaskSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="completed" name="تکمیل‌شده" fill="#1E3A8A" radius={4} />
                  <Bar dataKey="created" name="ایجادشده" fill="#93C5FD" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>ترکیب تیکت‌ها</Typography>
            <Box sx={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ticketCategorySeries} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                    {ticketCategorySeries.map((entry, index) => (
                      <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>فعالیت‌های اخیر</Typography>
            <Stack spacing={2}>
              {activities.slice(0, 6).map((activity) => {
                const user = users.find((item) => item.id === activity.userId);
                return (
                  <Stack key={activity.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <UserAvatar user={user} size={36} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {activity.userName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {activity.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatRelative(activity.createdAt)}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }}>پیشرفت پروژه‌ها</Typography>
            <Stack spacing={2.5}>
              {projects.slice(0, 4).map((project) => (
                <Box key={project.id}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between',  mb: 0.75 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {project.name}
                    </Typography>
                    <Typography variant="caption">{formatNumber(project.progress)}٪</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={project.progress} sx={{ height: 8, borderRadius: 99 }} />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
