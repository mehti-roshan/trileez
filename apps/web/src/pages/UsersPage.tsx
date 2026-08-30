import { Box, Card, Stack, Typography } from '@mui/material';
import PageHeader from '../components/common/PageHeader.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import DataTable from '../components/common/DataTable.tsx';
import { users } from '../mock/data.ts';
import { roleLabel } from '../utils/format.ts';

const statusText = { online: 'آنلاین', away: 'غایب', offline: 'آفلاین' };

export default function UsersPage() {
  return (
    <Box>
      <PageHeader title="کاربران" subtitle="اعضای فضای کاری جاری" crumbs={['تری‌لیز', 'کاربران']} />
      <Card sx={{ p: 1 }}>
        <DataTable rows={users} columns={[
          { key: 'user', label: 'کاربر', value: (user) => `${user.name} ${user.title}`, render: (user) => <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}><UserAvatar user={user} /><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.title}</Typography></Box></Stack> },
          { key: 'role', label: 'نقش', value: (user) => roleLabel[user.role], render: (user) => roleLabel[user.role] },
          { key: 'email', label: 'ایمیل', value: (user) => user.email },
          { key: 'status', label: 'وضعیت', value: (user) => statusText[user.status], render: (user) => statusText[user.status] },
        ]} searchPlaceholder="جستجوی نام، ایمیل یا سمت کاربر..." getRowId={(user) => user.id} />
      </Card>
    </Box>
  );
}
