import { Box, Card, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { DeviceStatusChip } from '../components/common/StatusChip.tsx';
import { devices } from '../mock/data.ts';
import { formatNumber, formatRelative } from '../utils/format.ts';

export default function DevicesPage() {
  return (
    <Box>
      <PageHeader title="دستگاه‌ها" subtitle="فهرست دارایی‌های متصل به Agent تری‌لیز" crumbs={['تری‌لیز', 'دستگاه‌ها']} />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>نام دستگاه</TableCell>
              <TableCell>کاربر</TableCell>
              <TableCell>سیستم‌عامل</TableCell>
              <TableCell>وضعیت</TableCell>
              <TableCell>آخرین ارتباط</TableCell>
              <TableCell>نسخه Agent</TableCell>
              <TableCell>سلامت</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.map((device) => (
              <TableRow key={device.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{device.name}</TableCell>
                <TableCell>{device.userName}</TableCell>
                <TableCell>
                  {device.os} {device.osVersion}
                </TableCell>
                <TableCell>
                  <DeviceStatusChip value={device.status} />
                </TableCell>
                <TableCell>{formatRelative(device.lastSeen)}</TableCell>
                <TableCell>{device.agentVersion}</TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <LinearProgress variant="determinate" value={device.health} sx={{ height: 8, borderRadius: 99, mb: 0.5 }} />
                  {formatNumber(device.health)}٪
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Box>
  );
}
