import { Box, Card, Dialog, DialogContent, DialogTitle, LinearProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { DeviceStatusChip } from '../components/common/StatusChip.tsx';
import DataTable from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import { devices } from '../mock/data.ts';
import { formatNumber, formatRelative } from '../utils/format.ts';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';

export default function DevicesPage() {
  const [params, setParams] = useSearchParams();
  const selected = devices.find((device) => device.id === params.get('device'));
  const [detailTab, setDetailTab] = useState(0);
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
          onRowClick={(device) => setParams({ device: device.id })}
        />
      </Card>
      <Dialog open={Boolean(selected)} onClose={() => setParams({})} fullWidth maxWidth="md">
        <DialogTitle>جزئیات دستگاه — {selected?.name}</DialogTitle>
        <DialogContent dividers>
          {selected && <><Tabs value={detailTab} onChange={(_, value) => setDetailTab(value)} variant="scrollable" sx={{ mb: 2 }}><Tab label="نمای کلی" /><Tab label="Telemetry" /><Tab label="پردازش‌ها" /><Tab label="شبکه" /><Tab label="جلسات" /><Tab label="Audit" /></Tabs><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {[
              ['کاربر', selected.userName], ['سیستم‌عامل', `${selected.os} ${selected.osVersion}`], ['نسخه Agent', selected.agentVersion],
              ['IP', selected.ipAddress], ['موقعیت', selected.location], ['آخرین Ping', formatRelative(selected.lastSeen)],
            ].map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 700 }}>{value}</Typography></Box>)}
            <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontWeight: 800, mb: 1 }}>{detailTab === 1 ? 'Telemetry نمونه Agent' : 'وضعیت سیستم (نمونه Agent)'}</Typography><Stack spacing={1}><Typography variant="body2">CPU: ۳۸٪</Typography><LinearProgress value={38} variant="determinate" /><Typography variant="body2">RAM: ۶۴٪</Typography><LinearProgress value={64} variant="determinate" /><Typography variant="body2">Disk: ۵۲٪</Typography><LinearProgress value={52} variant="determinate" /></Stack></Box>
            {detailTab === 2 && <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontWeight: 700 }}>پردازش‌های فعال</Typography><Typography variant="body2">chrome.exe — CPU ۱۲٪ — در حال اجرا</Typography><Typography variant="body2">TrileezAgent.exe — CPU ۴٪ — در حال اجرا</Typography></Box>}
            {detailTab === 3 && <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontWeight: 700 }}>اتصال‌های شبکه</Typography><Typography variant="body2">هسته تری‌لیز — HTTPS — برقرار</Typography><Typography variant="body2">Microsoft Update — HTTPS — برقرار</Typography></Box>}
            {detailTab === 4 && <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontWeight: 700 }}>جلسات مرتبط</Typography><Typography variant="body2">جلسه فعال و نشست‌های پایان‌یافته در ماژول جلسات قابل مشاهده است.</Typography></Box>}
            {detailTab === 5 && <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontWeight: 700 }}>Audit دستگاه</Typography><Typography variant="body2">آخرین اتصال و تغییرات Agent در تاریخچه مانیتورینگ ثبت می‌شود.</Typography></Box>}
          </Box></>}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
