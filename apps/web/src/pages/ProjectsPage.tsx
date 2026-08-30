import { FolderOutlined } from '@mui/icons-material';
import { Add } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import { chatGroups, customers, projectMembers, projects, users } from '../mock/data.ts';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import type { Project } from '../types/index.ts';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams(); const [rows, setRows] = useState(projects); const [open, setOpen] = useState(() => params.get('create') === '1'); const [form, setForm] = useState({ name: '', customerId: '', managerId: 'u2', startDate: '2026-08-26', endDate: '2026-12-30', budget: '0', description: '' });
  const save = () => { if (!form.name.trim() || !form.customerId) return; const id = `p-new-${Date.now()}`; const groupId = `chat-project-${id}`; const project = { id, code: `P-${700100 + rows.length}`, name: form.name, customerId: form.customerId, managerId: form.managerId, budget: Number(form.budget) || 0, status: 'active' as const, progress: 0, startDate: form.startDate, endDate: form.endDate, members: [form.managerId], tasksCount: 0, completedTasksCount: 0, color: '#1E3A8A', description: form.description || 'پروژه جدید سازمانی', defaultChatGroupId: groupId }; chatGroups.push({ id: groupId, name: `پروژه ${project.name}`, projectId: id, memberIds: project.members, isDefault: true, createdAt: new Date().toISOString() }); setRows((items) => [project, ...items]); setOpen(false); };
  const importProjects = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Project[] = [];
    records.forEach((row, index) => {
      const name = row['نام پروژه'] || row['نام']; const customer = customers.find((item) => item.company === row['مشتری'] || item.name === row['مشتری'] || item.id === row['شناسه مشتری']);
      if (!name || !customer) { errors.push(`ردیف ${index + 2}: نام پروژه و مشتری معتبر الزامی است.`); return; }
      const id = `p-import-${Date.now()}-${index}`; const groupId = `chat-project-${id}`;
      const project = { id, code: row['کد'] || `P-${700200 + rows.length + index}`, name, customerId: customer.id, managerId: 'u2', budget: Number(row['بودجه'] || 0), status: 'active' as const, progress: 0, startDate: row['تاریخ شروع'] || '2026-08-26', endDate: row['تاریخ پایان'] || '2026-12-30', members: ['u2'], tasksCount: 0, completedTasksCount: 0, color: '#1E3A8A', description: row['توضیحات'] || 'پروژه واردشده', defaultChatGroupId: groupId };
      chatGroups.push({ id: groupId, name: `پروژه ${name}`, projectId: id, memberIds: ['u2'], isDefault: true, createdAt: new Date().toISOString() }); created.push(project);
    });
    projects.unshift(...created); setRows((items) => [...created, ...items]); return { created: created.length, errors };
  };

  return (
    <Box>
      <PageHeader
        title="پروژه‌ها"
        subtitle="فضای کاری پروژه‌های جاری سازمان"
        crumbs={['تری‌لیز', 'پروژه‌ها']}
        actions={<Stack direction="row" spacing={1}><CsvToolbar rows={rows} entityLabel="پروژه‌ها" filename="projects.csv" columns={[{ key: 'code', label: 'کد', value: (project) => project.code }, { key: 'name', label: 'نام پروژه', value: (project) => project.name }, { key: 'customer', label: 'مشتری', value: (project) => customers.find((customer) => customer.id === project.customerId)?.company }, { key: 'status', label: 'وضعیت', value: (project) => project.status }]} onImport={importProjects} /><Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>پروژه جدید</Button></Stack>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {rows.map((project) => {
          const members = users.filter((user) => project.members.includes(user.id));
          return (
            <Card key={project.id}>
              <CardActionArea onClick={() => navigate(`/projects/${project.id}`)}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start',  mb: 1.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: project.color, mt: 1 }} />
                    <ProjectStatusChip value={project.status} />
                  </Stack>
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{project.code ?? `P-${700000 + Number(project.id.slice(1))}`} — {project.name}</Typography>
                  <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700, mb: 0.75 }}>
                    مشتری: {customers.find((customer) => customer.id === project.customerId)?.company ?? '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 44 }}>
                    {project.description}
                  </Typography>
                  <Stack direction="row" sx={{ justifyContent: 'space-between',  mb: 1 }}>
                    <Typography variant="caption">پیشرفت</Typography>
                    <Typography variant="caption">{formatNumber(project.progress)}٪</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={project.progress} sx={{ height: 8, borderRadius: 99, mb: 2 }} />
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Stack direction="row">
                      {members.slice(0, 4).map((member) => (
                        <Box key={member.id} sx={{ ml: -0.75 }}>
                          <UserAvatar user={member} size={28} />
                        </Box>
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(project.completedTasksCount)} از {formatNumber(project.tasksCount)} کار • {formatDate(project.endDate)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    اعضای فعال: {projectMembers.filter((member) => member.projectId === project.id && member.status === 'active').length} نفر
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    مدیر پروژه: {users.find((user) => user.id === project.managerId)?.name ?? '—'} • بودجه: {formatCurrency(project.budget)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
      {projects.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
          <FolderOutlined />
          <Typography>پروژه‌ای ثبت نشده است.</Typography>
        </Box>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>ایجاد پروژه جدید</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField required label="نام پروژه" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><FormControl required><InputLabel>مشتری</InputLabel><Select label="مشتری" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><MenuItem value="">انتخاب مشتری</MenuItem>{customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.company}</MenuItem>)}</Select></FormControl><FormControl><InputLabel>مدیر پروژه</InputLabel><Select label="مدیر پروژه" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>{users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}</Select></FormControl><TextField label="بودجه (تومان)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /><TextField label="توضیحات" multiline minRows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>انصراف</Button><Button variant="contained" disabled={!form.name.trim() || !form.customerId} onClick={save}>ذخیره پروژه</Button></DialogActions></Dialog>
    </Box>
  );
}
