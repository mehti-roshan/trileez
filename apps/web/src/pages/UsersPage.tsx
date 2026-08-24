import { Box, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { users } from '../mock/data.ts';
import { roleLabel } from '../utils/format.ts';

const statusText = { online: 'آنلاین', away: 'غایب', offline: 'آفلاین' };

export default function UsersPage() {
  return (
    <Box>
      <PageHeader title="کاربران" subtitle="اعضای فضای کاری جاری" crumbs={['تری‌لیز', 'کاربران']} />
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>کاربر</TableCell>
              <TableCell>نقش</TableCell>
              <TableCell>ایمیل</TableCell>
              <TableCell>وضعیت</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <UserAvatar user={user} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {user.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.title}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>{roleLabel[user.role]}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{statusText[user.status]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Box>
  );
}
