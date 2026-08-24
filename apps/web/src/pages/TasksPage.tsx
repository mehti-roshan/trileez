import {
  Box,
  Card,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader.tsx';
import { PriorityChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { projects, tasks, users } from '../mock/data.ts';
import type { Priority, TaskStatus } from '../types/index.ts';
import { formatDate, priorityLabel, taskStatusLabel } from '../utils/format.ts';

export default function TasksPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [priority, setPriority] = useState<'all' | Priority>('all');

  const rows = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesQuery = task.title.includes(query.trim());
        const matchesStatus = status === 'all' || task.status === status;
        const matchesPriority = priority === 'all' || task.priority === priority;
        return matchesQuery && matchesStatus && matchesPriority;
      }),
    [query, status, priority],
  );

  return (
    <Box>
      <PageHeader title="کارها" subtitle="فهرست کارها با وضعیت، اولویت و مسئول" crumbs={['تری‌لیز', 'کارها']} />
      <Card sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' } }}>
          <TextField label="جستجو" value={query} onChange={(event) => setQuery(event.target.value)} />
          <FormControl>
            <InputLabel>وضعیت</InputLabel>
            <Select label="وضعیت" value={status} onChange={(event) => setStatus(event.target.value as 'all' | TaskStatus)}>
              <MenuItem value="all">همه</MenuItem>
              {Object.entries(taskStatusLabel).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel>اولویت</InputLabel>
            <Select label="اولویت" value={priority} onChange={(event) => setPriority(event.target.value as 'all' | Priority)}>
              <MenuItem value="all">همه</MenuItem>
              {Object.entries(priorityLabel).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Card>
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>عنوان</TableCell>
              <TableCell>پروژه</TableCell>
              <TableCell>وضعیت</TableCell>
              <TableCell>اولویت</TableCell>
              <TableCell>مسئول</TableCell>
              <TableCell>موعد</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((task) => {
              const assignee = users.find((user) => user.id === task.assigneeId);
              const project = projects.find((item) => item.id === task.projectId);
              return (
                <TableRow key={task.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{task.title}</TableCell>
                  <TableCell>{project?.name}</TableCell>
                  <TableCell>
                    <TaskStatusChip value={task.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityChip value={task.priority} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <UserAvatar user={assignee} size={28} />
                      {assignee?.name ?? 'بدون مسئول'}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(task.dueDate)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </Box>
  );
}
