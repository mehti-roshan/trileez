import { Box, Card, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import { CustomerStatusChip } from '../components/common/StatusChip.tsx';
import { customers, users } from '../mock/data.ts';
import { formatCurrency, formatRelative } from '../utils/format.ts';

export default function CustomersPage() {
  return (
    <Box>
      <PageHeader title="مشتریان" subtitle="نمای ساده CRM برای حساب‌های سازمانی" crumbs={['تری‌لیز', 'مشتریان']} />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>نام</TableCell>
              <TableCell>شرکت</TableCell>
              <TableCell>ایمیل</TableCell>
              <TableCell>تلفن</TableCell>
              <TableCell>وضعیت</TableCell>
              <TableCell>ارزش</TableCell>
              <TableCell>آخرین تماس</TableCell>
              <TableCell>مسئول</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{customer.name}</TableCell>
                <TableCell>{customer.company}</TableCell>
                <TableCell>{customer.email}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell>
                  <CustomerStatusChip value={customer.status} />
                </TableCell>
                <TableCell>{formatCurrency(customer.value)}</TableCell>
                <TableCell>{formatRelative(customer.lastContact)}</TableCell>
                <TableCell>{users.find((user) => user.id === customer.assignedTo)?.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Box>
  );
}
