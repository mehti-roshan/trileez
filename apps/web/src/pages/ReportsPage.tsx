import { Box, Card, CardContent, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../components/common/PageHeader.tsx';
import StatCard from '../components/common/StatCard.tsx';
import { AssignmentOutlined, DevicesOutlined, FolderOutlined } from '@mui/icons-material';
import { devices, projects, tasks, weeklyTaskSeries } from '../mock/data.ts';
import { formatNumber } from '../utils/format.ts';

export default function ReportsPage() {
  return (
    <Box>
      <PageHeader title="گزارش‌ها" subtitle="خلاصه عملکرد هفته جاری" crumbs={['تری‌لیز', 'گزارش‌ها']} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 3 }}>
        <StatCard title="کارهای باز" value={formatNumber(tasks.filter((task) => task.status !== 'done').length)} icon={<AssignmentOutlined />} />
        <StatCard title="پروژه‌های فعال" value={formatNumber(projects.filter((project) => project.status === 'active').length)} icon={<FolderOutlined />} color="#047857" />
        <StatCard title="دستگاه آنلاین" value={formatNumber(devices.filter((device) => device.status === 'online').length)} icon={<DevicesOutlined />} color="#0E7490" />
      </Box>
      <Card>
        <CardContent>
          <Typography sx={{ fontWeight: 700, mb: 2 }}>خروجی هفتگی</Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTaskSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completed" name="تکمیل‌شده" fill="#059669" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
