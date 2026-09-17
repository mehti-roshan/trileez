import { Add } from '@mui/icons-material';
import { Box, Button, Card, Chip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.tsx';
import ProjectFormDialog, { type ProjectFormValues } from '../components/common/ProjectFormDialog.tsx';
import { ProjectStatusChip } from '../components/common/StatusChip.tsx';
import { chatGroups, customers, users } from '../mock/data.ts';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.ts';
import { customerDisplayName } from '../utils/customer.ts';
import CsvToolbar from '../components/common/CsvToolbar.tsx';
import type { Project } from '../types/index.ts';
import { projectPhaseRepository, projectRepository, taskRepository } from '../services/repositories.ts';
import DataTable from '../components/common/DataTable.tsx';
import { derivedProjectProgress } from '../services/projectManagement.ts';
import { provisionProjectExecution } from '../services/projectProvisioning.ts';
import { normalizeProjectGrade, normalizeProjectTags, projectGrade, projectGradeLabel, projectStatusLabels } from '../utils/project.ts';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams(); const [rows, setRows] = useState(() => projectRepository.list()); const [taskRows, setTaskRows] = useState(() => taskRepository.list()); const [phaseRows, setPhaseRows] = useState(() => projectPhaseRepository.list()); const [localOpen, setLocalOpen] = useState(false); const open = localOpen || params.get('create') === '1';
  useEffect(() => projectRepository.subscribe(setRows), []);
  useEffect(() => taskRepository.subscribe(setTaskRows), []);
  useEffect(() => projectPhaseRepository.subscribe(setPhaseRows), []);
  const closeForm = () => { setLocalOpen(false); setParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true }); };
  const save = (values: ProjectFormValues) => {
    const id = `p-new-${Date.now()}`; const groupId = `chat-project-${id}`;
    const project: Project = { ...values, id, code: values.code || `P-${700100 + rows.length}`, progress: 0, members: [values.managerId], tasksCount: 0, completedTasksCount: 0, description: values.description || 'پروژه جدید سازمانی', defaultChatGroupId: groupId };
    chatGroups.push({ id: groupId, name: `پروژه ${project.name}`, projectId: id, memberIds: project.members, isDefault: true, createdAt: new Date().toISOString() });
    projectRepository.create(project); provisionProjectExecution(project); closeForm();
  };
  const importProjects = (records: Record<string, string>[]) => {
    const errors: string[] = []; const created: Project[] = [];
    records.forEach((row, index) => {
      const name = row['نام پروژه'] || row['نام']; const customer = customers.find((item) => item.company === row['مشتری'] || item.name === row['مشتری'] || item.id === row['شناسه مشتری']);
      if (!name || !customer) { errors.push(`ردیف ${index + 2}: نام پروژه و مشتری معتبر الزامی است.`); return; }
      const id = `p-import-${Date.now()}-${index}`; const groupId = `chat-project-${id}`;
      const project: Project = { id, code: row['کد'] || `P-${700200 + rows.length + index}`, name, customerId: customer.id, managerId: 'u2', budget: Number(row['بودجه'] || 0), grade: normalizeProjectGrade(row['درجه اهمیت'] || row['امتیاز اهمیت']), tags: normalizeProjectTags((row['برچسب‌ها'] || row['تگ‌ها'] || '').split(/[،,]/)), status: 'active', progress: 0, startDate: row['تاریخ شروع'] || new Date().toISOString().slice(0, 10), endDate: row['تاریخ پایان'] || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), members: ['u2'], tasksCount: 0, completedTasksCount: 0, color: '#1E3A8A', description: row['توضیحات'] || 'پروژه واردشده', defaultChatGroupId: groupId };
      chatGroups.push({ id: groupId, name: `پروژه ${name}`, projectId: id, memberIds: ['u2'], isDefault: true, createdAt: new Date().toISOString() }); created.push(project);
    });
    created.forEach((project) => {
      projectRepository.create(project);
      provisionProjectExecution(project);
    }); return { created: created.length, errors };
  };

  return (
    <Box>
      <PageHeader
        title="پروژه‌ها"
        subtitle="فضای کاری پروژه‌های جاری سازمان"
        crumbs={['تری‌لیز', 'پروژه‌ها']}
        actions={<Button variant="contained" startIcon={<Add />} onClick={() => setLocalOpen(true)}>پروژه جدید</Button>}
      />
      <Card sx={{ p: 1 }}><DataTable rows={rows} getRowId={(project) => project.id} onRowClick={(project) => navigate(`/projects/${project.id}`)} toolbar={<CsvToolbar rows={rows} entityLabel="پروژه‌ها" filename="projects.csv" columns={[{ key: 'code', label: 'کد', value: (project) => project.code }, { key: 'name', label: 'نام پروژه', value: (project) => project.name }, { key: 'customer', label: 'مشتری', value: (project) => customerDisplayName(customers.find((customer) => customer.id === project.customerId) ?? {}) }, { key: 'grade', label: 'درجه اهمیت', value: (project) => projectGrade(project) }, { key: 'tags', label: 'برچسب‌ها', value: (project) => (project.tags ?? []).join('، ') }, { key: 'status', label: 'وضعیت', value: (project) => projectStatusLabels[project.status] }]} onImport={importProjects} />} searchPlaceholder="جستجوی کد، نام پروژه، مشتری یا مدیر..." filters={[{ key: 'status', label: 'وضعیت', options: [...new Set(rows.map((row) => row.status))].map((value) => ({ value, label: projectStatusLabels[value] })), value: (row) => row.status }, { key: 'customer', label: 'مشتری', options: customers.map((customer) => ({ value: customer.id, label: customerDisplayName(customer) })), value: (row) => row.customerId }]} columns={[{ key: 'code', label: 'کد پروژه', value: (row) => row.code ?? row.id }, { key: 'name', label: 'نام پروژه', value: (row) => row.name, render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography> }, { key: 'customer', label: 'مشتری', value: (row) => customerDisplayName(customers.find((customer) => customer.id === row.customerId) ?? {}), groupable: true }, { key: 'manager', label: 'مدیر پروژه', value: (row) => users.find((user) => user.id === row.managerId)?.name ?? '—' }, { key: 'tags', label: 'برچسب‌ها', value: (row) => (row.tags ?? []).join(' '), render: (row) => <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap' }}>{(row.tags ?? []).length ? row.tags.map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />) : <Typography color="text.secondary">—</Typography>}</Box> }, { key: 'grade', label: 'درجه اهمیت', value: (row) => projectGrade(row), render: (row) => <Chip size="small" color={projectGrade(row) >= 85 ? 'error' : projectGrade(row) >= 65 ? 'warning' : 'default'} label={`${projectGrade(row).toLocaleString('fa-IR')} • ${projectGradeLabel(projectGrade(row))}`} /> }, { key: 'status', label: 'وضعیت', value: (row) => row.status, filterLabel: (value) => projectStatusLabels[value as keyof typeof projectStatusLabels] ?? value, render: (row) => <ProjectStatusChip value={row.status} /> }, { key: 'startDate', label: 'تاریخ شروع', value: (row) => row.startDate, render: (row) => formatDate(row.startDate) }, { key: 'endDate', label: 'تاریخ پایان', value: (row) => row.endDate, render: (row) => formatDate(row.endDate) }, { key: 'progress', label: 'پیشرفت', value: (row) => derivedProjectProgress(row.id, phaseRows, taskRows), aggregate: 'average', render: (row) => `${formatNumber(derivedProjectProgress(row.id, phaseRows, taskRows))}٪` }, { key: 'tasks', label: 'وظایف', value: (row) => taskRows.filter((task) => task.projectId === row.id).length, aggregate: 'sum', render: (row) => `${taskRows.filter((task) => task.projectId === row.id && task.status === 'done').length} از ${taskRows.filter((task) => task.projectId === row.id).length}` }, { key: 'budget', label: 'بودجه', value: (row) => row.budget, aggregate: 'sum', render: (row) => formatCurrency(row.budget) }]} /></Card>
      <ProjectFormDialog open={open} onClose={closeForm} onSubmit={save} suggestedTags={rows.flatMap((project) => project.tags ?? [])} />
    </Box>
  );
}
