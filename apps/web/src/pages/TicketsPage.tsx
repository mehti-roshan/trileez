import { Box, Card, Chip } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { PriorityChip, TicketStatusChip } from '../components/common/StatusChip.tsx';
import { tickets, users } from '../mock/data.ts';
import { formatRelative, ticketCategoryLabel } from '../utils/format.ts';
import DataTable from '../components/common/DataTable.tsx';
import CsvToolbar from '../components/common/CsvToolbar.tsx';

export default function TicketsPage() {
  return (
    <Box>
      <PageHeader title="تیکت‌ها" subtitle="صف پشتیبانی و درخواست‌های داخلی" crumbs={['تری‌لیز', 'تیکت‌ها']} />
      <Card sx={{ p: 1 }}>
        <DataTable rows={tickets} getRowId={(ticket) => ticket.id} searchPlaceholder="جستجوی عنوان، شرح یا مسئول..." toolbar={<CsvToolbar rows={tickets} entityLabel="تیکت‌ها" filename="tickets.csv" columns={[{ key: 'title', label: 'عنوان', value: (ticket) => ticket.title }, { key: 'status', label: 'وضعیت', value: (ticket) => ticket.status }, { key: 'priority', label: 'اولویت', value: (ticket) => ticket.priority }, { key: 'category', label: 'دسته', value: (ticket) => ticketCategoryLabel[ticket.category] }, { key: 'assignee', label: 'مسئول', value: (ticket) => users.find((user) => user.id === ticket.assigneeId)?.name }]} />} columns={[
          { key: 'title', label: 'عنوان', value: (ticket) => `${ticket.title} ${ticket.description}`, render: (ticket) => <Box><Box sx={{ fontWeight: 600 }}>{ticket.title}</Box><Box sx={{ color: 'text.secondary', fontSize: 12 }}>{ticket.description}</Box></Box> },
          { key: 'status', label: 'وضعیت', value: (ticket) => ticket.status, render: (ticket) => <TicketStatusChip value={ticket.status} /> },
          { key: 'priority', label: 'اولویت', value: (ticket) => ticket.priority, render: (ticket) => <PriorityChip value={ticket.priority} /> },
          { key: 'category', label: 'دسته', value: (ticket) => ticketCategoryLabel[ticket.category], render: (ticket) => <Chip size="small" label={ticketCategoryLabel[ticket.category]} /> },
          { key: 'assignee', label: 'مسئول', value: (ticket) => users.find((user) => user.id === ticket.assigneeId)?.name ?? '—' },
          { key: 'reporter', label: 'گزارش‌دهنده', value: (ticket) => users.find((user) => user.id === ticket.reporterId)?.name ?? '—' },
          { key: 'updatedAt', label: 'به‌روزرسانی', value: (ticket) => ticket.updatedAt, render: (ticket) => formatRelative(ticket.updatedAt) },
        ]} />
      </Card>
    </Box>
  );
}
