import { Box, Card, Chip, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { PriorityChip, TicketStatusChip } from '../components/common/StatusChip.tsx';
import { tickets, users } from '../mock/data.ts';
import { formatRelative, ticketCategoryLabel } from '../utils/format.ts';

export default function TicketsPage() {
  return (
    <Box>
      <PageHeader title="تیکت‌ها" subtitle="صف پشتیبانی و درخواست‌های داخلی" crumbs={['تری‌لیز', 'تیکت‌ها']} />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>عنوان</TableCell>
              <TableCell>وضعیت</TableCell>
              <TableCell>اولویت</TableCell>
              <TableCell>دسته</TableCell>
              <TableCell>مسئول</TableCell>
              <TableCell>گزارش‌دهنده</TableCell>
              <TableCell>به‌روزرسانی</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id} hover>
                <TableCell>
                  <Box sx={{ fontWeight: 600 }}>{ticket.title}</Box>
                  <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{ticket.description}</Box>
                </TableCell>
                <TableCell>
                  <TicketStatusChip value={ticket.status} />
                </TableCell>
                <TableCell>
                  <PriorityChip value={ticket.priority} />
                </TableCell>
                <TableCell>
                  <Chip size="small" label={ticketCategoryLabel[ticket.category]} />
                </TableCell>
                <TableCell>{users.find((user) => user.id === ticket.assigneeId)?.name}</TableCell>
                <TableCell>{users.find((user) => user.id === ticket.reporterId)?.name}</TableCell>
                <TableCell>{formatRelative(ticket.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Box>
  );
}
