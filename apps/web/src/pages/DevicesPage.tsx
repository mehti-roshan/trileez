import { Box, Card, LinearProgress } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { DeviceStatusChip } from '../components/common/StatusChip.tsx';
import DataTable from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { devices } from '../mock/data.ts';
import { formatNumber, formatRelative } from '../utils/format.ts';

export default function DevicesPage() {
  return (
    <Box>
      <PageHeader title="دستگاه‌ها" subtitle="فهرست دارایی‌های متصل به Agent تری‌لیز" crumbs={['تری‌لیز', 'دستگاه‌ها']} />
      <Card sx={{ p: 1 }}>
        <DataTable
          rows={devices}
          getRowId={(device) => device.id}
          searchPlaceholder="جستجوی نام دستگاه، کاربر یا سیستم‌عامل..."
          toolbar={<CsvToolbar rows={devices} entityLabel="دستگاه‌ها" filename="devices.csv" columns={[
            { key: 'name', label: 'نام دستگاه', value: (device) => device.name },
            { key: 'user', label: 'کاربر', value: (device) => device.userName },
            { key: 'os', label: 'سیستم‌عامل', value: (device) => `${device.os} ${device.osVersion}` },
            { key: 'status', label: 'وضعیت', value: (device) => device.status },
            { key: 'lastSeen', label: 'آخرین ارتباط', value: (device) => device.lastSeen },
            { key: 'health', label: 'سلامت', value: (device) => device.health },
          ]} />}
          columns={[
            { key: 'name', label: 'نام دستگاه', value: (device) => device.name, render: (device) => <Box sx={{ fontWeight: 600 }}>{device.name}</Box> },
            { key: 'user', label: 'کاربر', value: (device) => device.userName },
            { key: 'os', label: 'سیستم‌عامل', value: (device) => `${device.os} ${device.osVersion}` },
            { key: 'status', label: 'وضعیت', value: (device) => device.status, render: (device) => <DeviceStatusChip value={device.status} /> },
            { key: 'lastSeen', label: 'آخرین ارتباط', value: (device) => device.lastSeen, render: (device) => formatRelative(device.lastSeen) },
            { key: 'agent', label: 'نسخه Agent', value: (device) => device.agentVersion },
            { key: 'health', label: 'سلامت', value: (device) => device.health, aggregate: 'average', render: (device) => <Box sx={{ minWidth: 120 }}><LinearProgress variant="determinate" value={device.health} sx={{ height: 8, borderRadius: 99, mb: 0.5 }} />{formatNumber(device.health)}٪</Box> },
          ]}
        />
      </Card>
    </Box>
  );
}
