import { Card, CardContent, Stack, Typography } from '@mui/material';
import { users } from '../../services/repositories.ts';
import type { Task } from '../../types/index.ts';
import { formatDate } from '../../utils/format.ts';
import { PriorityChip, TaskStatusChip } from './StatusChip.tsx';
import UserAvatar from './UserAvatar.tsx';

export default function TaskCard({ task, onClick }: { task: Task; onClick?: () => void }) {
  const assignee = users.find((user) => user.id === task.assigneeId);

  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { borderColor: 'primary.light' } : undefined,
      }}
    >
      <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between',  mb: 1 }}>
          <TaskStatusChip value={task.status} />
          <PriorityChip value={task.priority} />
        </Stack>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
          {task.title}
        </Typography>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            موعد: {formatDate(task.dueDate)}
          </Typography>
          <UserAvatar user={assignee} size={28} />
        </Stack>
      </CardContent>
    </Card>
  );
}
