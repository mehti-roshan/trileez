/* eslint-disable react-hooks/purity, react-hooks/rules-of-hooks */
import { Add, ChatBubbleOutlined, DeleteOutlined, EditOutlined, Security, Stop, ViewKanbanOutlined } from '@mui/icons-material';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DataTable from '../components/common/DataTable.tsx';
import PageHeader from '../components/common/PageHeader.tsx';
import ProjectFormDialog, { type ProjectFormValues } from '../components/common/ProjectFormDialog.tsx';
import { PriorityChip, ProjectStatusChip, TaskStatusChip } from '../components/common/StatusChip.tsx';
import UserAvatar from '../components/common/UserAvatar.tsx';
import CustomerVisibilityBadge from '../components/common/CustomerVisibilityBadge.tsx';
import JalaliDatePicker from '../components/common/JalaliDatePicker.tsx';
import { activities, businessDocuments, contracts, customers, invoices, payments, projectNotes, projectPhases, projectSales, tasks, tickets, users } from '../services/repositories.ts';
import { documentRepository, projectAccessRepository, projectActivityRepository, projectEventRepository, projectMemberRepository, projectPhaseRepository, projectRepository, projectRoleRepository, projectRoleTemplateRepository, taskRepository, timesheetRepository, ticketRepository } from '../services/repositories.ts';
import type { ProjectAccess, ProjectMember, ProjectPhase, ProjectRole, TaskStatus, User } from '../types/index.ts';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatRelative, getTimesheetStatusLabel, normalizeTimesheetStatus, priorityLabel, taskStatusLabel, timesheetBillingStatusLabel } from '../utils/format.ts';
import { documentStatusColor, documentStatusLabels, documentTypeLabels } from '../utils/document.ts';
import { actualTaskHours, derivedPhaseProgress, derivedProjectProgress, effectiveProjectAccesses } from '../services/projectManagement.ts';
import { projectGrade, projectGradeLabel } from '../utils/project.ts';

const keys = ['overview', 'phases', 'tasks', 'members', 'roles', 'accesses', 'files', 'events', 'chat', 'tickets', 'contracts', 'sales', 'notes'];
const labels = ['بررسی اجمالی', 'فازها', 'وظایف', 'اعضای پروژه', 'نقش‌ها و فعالیت‌ها', 'دسترسی‌ها', 'فایل و اسناد', 'رویدادها', 'گفتگوها', 'تیکت‌ها', 'قراردادها', 'فروش‌ها', 'یادداشت‌ها'];

export default function ProjectDetailPage() {
  const { id } = useParams(); const navigate = useNavigate(); const [query, setQuery] = useSearchParams();
  const [project, setProject] = useState(() => projectRepository.get(id ?? ''));
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const requestedView = query.get('view');
  const selected = requestedView === 'team' ? 'roles' : keys.includes(requestedView ?? '') ? requestedView! : requestedView === 'gantt' || requestedView === 'board' ? 'tasks' : 'overview';
  const [rows, setRows] = useState(() => tasks.filter((task) => task.projectId === id));
  const [phases, setPhases] = useState(() => projectPhases.filter((phase) => phase.projectId === id));
  const [projectTimes, setProjectTimes] = useState(() => timesheetRepository.list().filter((item) => item.projectId === id));
  const [projectTickets, setProjectTickets] = useState(() => ticketRepository.list().filter((item) => item.projectId === id));
  const [projectDocuments, setProjectDocuments] = useState(() => documentRepository.list().filter((item) => item.projectId === id));
  const [memberRows, setMemberRows] = useState(() => projectMemberRepository.list().filter((item) => item.projectId === id && item.status === 'active'));
  const [roleRows, setRoleRows] = useState(() => projectRoleRepository.list().filter((item) => item.projectId === id));
  const [activityRows, setActivityRows] = useState(() => projectActivityRepository.list().filter((item) => item.projectId === id));
  const [projectEventRows, setProjectEventRows] = useState(() => projectEventRepository.list().filter((item) => item.projectId === id));
  const [accessRows, setAccessRows] = useState(() => projectAccessRepository.list().filter((item) => item.projectId === id));
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ personId: '', roleIds: [] as string[], responsibilities: '' });
  const [memberError, setMemberError] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ templateId: '', name: '', description: '', responsibilities: '', activities: '', objectives: '', requiredSkills: '', expectedHours: '40', customerVisible: false });
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessForm, setAccessForm] = useState({ content: '', scope: 'project' as ProjectAccess['scope'], status: 'granted' as ProjectAccess['status'], roleId: '', projectMemberId: '', startDate: '', expiryDate: '', notes: '' });
  const [deletingAccess, setDeletingAccess] = useState<ProjectAccess | null>(null);
  const [phaseOpen, setPhaseOpen] = useState(false); const [editingPhase, setEditingPhase] = useState<ProjectPhase | null>(null);
  const [phaseForm, setPhaseForm] = useState({ title: '', status: 'planned' as ProjectPhase['status'], startDate: '', endDate: '', progress: '0', description: '', customerVisible: false });
  const [timer, setTimer] = useState<string | null>(null); const [elapsed, setElapsed] = useState(0);
  const [taskView, setTaskView] = useState<'table' | 'gantt' | 'board'>(requestedView === 'gantt' ? 'gantt' : requestedView === 'board' ? 'board' : 'table');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [boardDropStatus, setBoardDropStatus] = useState<TaskStatus | null>(null);
  const [ganttDrag, setGanttDrag] = useState<{ taskId: string; mode: 'move' | 'start' | 'end'; originX: number; start: number; end: number } | null>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!timer) return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);
  useEffect(() => taskRepository.subscribe((items) => setRows(items.filter((task) => task.projectId === id))), [id]);
  useEffect(() => projectRepository.subscribe((items) => setProject(items.find((item) => item.id === id))), [id]);
  useEffect(() => projectPhaseRepository.subscribe((items) => setPhases(items.filter((phase) => phase.projectId === id))), [id]);
  useEffect(() => projectMemberRepository.subscribe((items) => setMemberRows(items.filter((item) => item.projectId === id && item.status === 'active'))), [id]);
  useEffect(() => projectRoleRepository.subscribe((items) => setRoleRows(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => projectActivityRepository.subscribe((items) => setActivityRows(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => { setProjectEventRows(projectEventRepository.list().filter((item) => item.projectId === id)); return projectEventRepository.subscribe((items) => setProjectEventRows(items.filter((item) => item.projectId === id))); }, [id]);
  useEffect(() => projectAccessRepository.subscribe((items) => setAccessRows(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => timesheetRepository.subscribe((items) => setProjectTimes(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => ticketRepository.subscribe((items) => setProjectTickets(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => documentRepository.subscribe((items) => setProjectDocuments(items.filter((item) => item.projectId === id))), [id]);
  useEffect(() => {
    setTaskView(requestedView === 'gantt' ? 'gantt' : requestedView === 'board' ? 'board' : 'table');
  }, [requestedView]);
  if (!project) return <Box><PageHeader title="پروژه یافت نشد" crumbs={['تری‌لیز', 'پروژه‌ها']} /></Box>;
  const customer = customers.find((item) => item.id === project.customerId);
  const activeMemberIds = new Set(memberRows.map((item) => item.personId));
  const members = users.filter((user) => activeMemberIds.has(user.id));
  const availableUsers = users.filter((user) => !activeMemberIds.has(user.id));
  const hours = projectTimes.reduce((sum, item) => sum + item.hours, 0);
  const labor = projectTimes.reduce((sum, item) => sum + (item.calculatedCost ?? item.hours * (item.hourlyRate ?? 200000)), 0);
  const projectProgress = derivedProjectProgress(project.id, phases, rows);
  const gotoTab = (index: number) => { const next = new URLSearchParams(query); next.set('view', keys[index]); if (keys[index] === 'tasks') setTaskView('table'); setQuery(next); };
  const setTaskDisplay = (view: 'table' | 'gantt' | 'board') => { setTaskView(view); const next = new URLSearchParams(query); next.set('view', view === 'table' ? 'tasks' : view); setQuery(next, { replace: true }); };
  const updateProject = async (values: ProjectFormValues) => { await projectRepository.update(project.id, values); };
  const openPhase = (phase?: ProjectPhase) => { setEditingPhase(phase ?? null); setPhaseForm(phase ? { title: phase.title, status: phase.status, startDate: phase.startDate, endDate: phase.endDate, progress: String(phase.progress), description: phase.description, customerVisible: Boolean(phase.customerVisible) } : { title: '', status: 'planned', startDate: project.startDate, endDate: project.endDate, progress: '0', description: '', customerVisible: false }); setPhaseOpen(true); };
  const savePhase = async () => {
    if (!phaseForm.title.trim() || !phaseForm.startDate || !phaseForm.endDate || phaseForm.endDate < phaseForm.startDate) return;
    const value: ProjectPhase = { id: editingPhase?.id ?? `phase-${Date.now()}`, projectId: project.id, title: phaseForm.title.trim(), status: phaseForm.status, startDate: phaseForm.startDate, endDate: phaseForm.endDate, progress: Math.max(0, Math.min(100, Number(phaseForm.progress) || 0)), managerId: project.managerId, description: phaseForm.description.trim(), customerVisible: phaseForm.customerVisible };
    if (editingPhase) await projectPhaseRepository.update(value.id, value);
    else await projectPhaseRepository.create(value);
    setPhaseOpen(false);
  };
  const openMemberDialog = () => {
    setMemberForm({ personId: availableUsers[0]?.id ?? '', roleIds: roleRows[0] ? [roleRows[0].id] : [], responsibilities: '' });
    setMemberError('');
    setMemberOpen(true);
  };
  const addProjectMember = async () => {
    if (!memberForm.personId || !memberForm.roleIds.length) { setMemberError('انتخاب کاربر و حداقل یک نقش پروژه الزامی است.'); return; }
    if (activeMemberIds.has(memberForm.personId)) { setMemberError('این کاربر در حال حاضر عضو پروژه است.'); return; }
    const previous = projectMemberRepository.list().find((item) => item.projectId === project.id && item.personId === memberForm.personId);
    const roleNames = roleRows.filter((role) => memberForm.roleIds.includes(role.id)).map((role) => role.name);
    const value: Omit<ProjectMember, 'id'> = { projectId: project.id, personId: memberForm.personId, roleIds: memberForm.roleIds, role: roleNames.join('، '), status: 'active', joinedAt: new Date().toISOString(), responsibilities: memberForm.responsibilities.trim() };
    if (previous) await projectMemberRepository.update(previous.id, { ...value, leftAt: undefined });
    else await projectMemberRepository.create(value);
    await projectRepository.update(project.id, { members: [...new Set([...project.members, memberForm.personId])] });
    setMemberOpen(false);
  };
  const applyRoleTemplate = (templateId: string) => {
    const template = projectRoleTemplateRepository.get(templateId);
    setRoleForm((current) => template ? { templateId, name: current.name.trim() || template.name, description: template.description, responsibilities: template.responsibilities.join('\n'), activities: template.responsibilities.join('\n'), objectives: template.objectives.join('\n'), requiredSkills: template.requiredSkills.join('، '), expectedHours: String(template.expectedHours), customerVisible: template.customerVisible } : { ...current, templateId: '' });
  };
  const saveRole = async () => {
    if (!roleForm.name.trim()) return;
    const role: ProjectRole = { id: `pr-${project.id}-${Date.now()}`, projectId: project.id, templateId: roleForm.templateId || undefined, name: roleForm.name.trim(), description: roleForm.description.trim(), responsibilities: roleForm.responsibilities.split(/\n|،/).map((item) => item.trim()).filter(Boolean), objectives: roleForm.objectives.split(/\n|،/).map((item) => item.trim()).filter(Boolean), requiredSkills: roleForm.requiredSkills.split(/\n|،|,/).map((item) => item.trim()).filter(Boolean), expectedHours: Math.max(0, Number(roleForm.expectedHours) || 0), customerVisible: roleForm.customerVisible };
    const createdRole = await projectRoleRepository.create(role);
    await Promise.all(roleForm.activities.split(/\n/).map((item) => item.trim()).filter(Boolean).map((title, index) => projectActivityRepository.create({ id: `pa-${createdRole.id}-${index + 1}`, projectId: project.id, roleId: createdRole.id, title, description: `فعالیت تعریف‌شده برای نقش ${createdRole.name}`, objective: createdRole.objectives[0], expectedHours: createdRole.responsibilities.length ? Math.round(createdRole.expectedHours / createdRole.responsibilities.length) : createdRole.expectedHours, customerVisible: createdRole.customerVisible })));
    setRoleOpen(false);
  };
  const saveAccess = async () => {
    if (!accessForm.content.trim()) return;
    if (accessForm.scope === 'role' && !accessForm.roleId) return;
    if (accessForm.scope === 'person' && !accessForm.projectMemberId) return;
    await projectAccessRepository.create({ id: `pac-${project.id}-${Date.now()}`, projectId: project.id, content: accessForm.content.trim(), scope: accessForm.scope, status: accessForm.status, roleId: accessForm.scope === 'role' ? accessForm.roleId : undefined, projectMemberId: accessForm.scope === 'person' ? accessForm.projectMemberId : undefined, startDate: accessForm.startDate || undefined, expiryDate: accessForm.expiryDate || undefined, notes: accessForm.notes.trim(), grantedBy: project.managerId, createdAt: new Date().toISOString() });
    setAccessOpen(false);
  };
  const ganttTasks = rows.filter((task) => task.dueDate).map((task) => ({ task, start: new Date(task.startDate ?? task.createdAt).getTime(), end: new Date(task.dueDate).getTime() }));
  const ganttMin = ganttTasks.length ? Math.min(...ganttTasks.map((item) => item.start)) : Date.now();
  const ganttMax = ganttTasks.length ? Math.max(...ganttTasks.map((item) => item.end)) : ganttMin + 7 * 86400000;
  const dayMs = 86400000; const timelineStart = new Date(ganttMin - 2 * dayMs); timelineStart.setHours(0, 0, 0, 0); const totalDays = Math.max(7, Math.ceil((ganttMax - timelineStart.getTime()) / dayMs) + 3);
  useEffect(() => {
    if (!ganttDrag) return;
    const move = (event: PointerEvent) => {
      const width = ganttRef.current?.clientWidth ?? 900;
      // The timeline itself is explicitly LTR, so pointer movement maps
      // directly to chronological movement (left = earlier, right = later).
      const deltaDays = Math.round((event.clientX - ganttDrag.originX) / Math.max(1, width / totalDays));
      let start = ganttDrag.start; let end = ganttDrag.end;
      if (ganttDrag.mode === 'move') { start += deltaDays * dayMs; end += deltaDays * dayMs; }
      if (ganttDrag.mode === 'start') start = Math.min(end - dayMs, start + deltaDays * dayMs);
      if (ganttDrag.mode === 'end') end = Math.max(start + dayMs, end + deltaDays * dayMs);
      const next = { startDate: new Date(start).toISOString(), dueDate: new Date(end).toISOString(), updatedAt: new Date().toISOString() };
      setRows((current) => current.map((item) => item.id === ganttDrag.taskId ? { ...item, ...next } : item));
    };
    const up = async () => {
      const task = rows.find((item) => item.id === ganttDrag.taskId);
      try {
        if (task) await taskRepository.update(task.id, { startDate: task.startDate, dueDate: task.dueDate, updatedAt: task.updatedAt });
      } catch {
        setRows(taskRepository.list().filter((item) => item.projectId === project.id));
      } finally { setGanttDrag(null); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [ganttDrag, project.id, rows, totalDays]);
  const renderOverview = () => <Stack spacing={2}>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>{[['وظایف', rows.length], ['تکمیل‌شده', rows.filter((task) => task.status === 'done').length], ['ساعات ثبت‌شده', hours], ['تیکت‌های باز', tickets.filter((ticket) => ticket.projectId === project.id && ticket.status !== 'closed').length]].map(([title, value]) => <Card key={String(title)}><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{formatNumber(Number(value))}</Typography></CardContent></Card>)}</Box>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><Card sx={{ flex: 1 }}><CardContent><Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}><ProjectStatusChip value={project.status} /><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Chip size="small" color={projectGrade(project) >= 85 ? 'error' : projectGrade(project) >= 65 ? 'warning' : 'default'} label={`اهمیت ${projectGrade(project).toLocaleString('fa-IR')} / ۱۰۰ • ${projectGradeLabel(projectGrade(project))}`} /><Typography variant="caption">پایان: {formatDate(project.endDate)}</Typography></Stack></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>پیشرفت مشتق‌شده از فازها و وظایف</Typography><LinearProgress variant="determinate" value={projectProgress} sx={{ my: 1, height: 9, borderRadius: 5 }} /><Typography variant="caption" color="text.secondary">{projectProgress.toLocaleString('fa-IR')}٪ تکمیل</Typography><Typography variant="body2">مشتری: <strong>{customer?.code ? `${customer.code} — ` : ''}{customer?.company}</strong></Typography><Typography variant="body2">مدیر پروژه: <strong>{users.find((user) => user.id === project.managerId)?.name}</strong></Typography><Typography variant="body2">بودجه: <strong>{formatCurrency(project.budget)}</strong></Typography></CardContent></Card><Card sx={{ flex: 1 }}><CardContent><Typography sx={{ fontWeight: 700, mb: 1 }}>اعضای پروژه</Typography>{members.map((member) => { const membership = memberRows.find((item) => item.personId === member.id); const memberRoles = roleRows.filter((role) => membership?.roleIds?.includes(role.id)); return <Stack key={member.id} direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}><UserAvatar user={member} size={30} /><Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{member.name}</Typography><Typography variant="caption" color="text.secondary">{memberRoles.map((role) => role.name).join('، ') || membership?.role || 'عضو پروژه'}</Typography></Box></Stack>; })}{!members.length && <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>هنوز عضوی به پروژه اضافه نشده است.</Typography>}<Typography variant="caption" color="text.secondary">هزینه نیروی انسانی: {formatCurrency(labor)} • {hours} ساعت</Typography></CardContent></Card></Stack>
    <Card><CardContent><Typography sx={{ fontWeight: 700, mb: 1 }}>فعالیت‌های اخیر</Typography>{activities.filter((activity) => activity.entityId === project.id || rows.some((task) => task.id === activity.entityId)).slice(0, 6).map((activity) => <Box key={activity.id} sx={{ borderRight: '3px solid #2563EB', pr: 1, mb: 1 }}><Typography variant="body2">{activity.userName} — {activity.description}</Typography><Typography variant="caption">{formatRelative(activity.createdAt)}</Typography></Box>)}</CardContent></Card>
    <Card><CardContent><Typography sx={{ fontWeight: 700, mb: 1.5 }}>خلاصه مالی پروژه</Typography><Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>{[['ارزش قرارداد', project.budget], ['فاکتور شده', invoices.filter((item) => item.projectId === project.id).reduce((sum, item) => sum + item.amount, 0)], ['دریافت شده', payments.filter((item) => item.projectId === project.id && item.status === 'تایید شده').reduce((sum, item) => sum + item.amount, 0)], ['هزینه نیروی انسانی', labor]].map(([label, value]) => <Box key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 800 }}>{formatCurrency(Number(value))}</Typography></Box>)}</Box></CardContent></Card>
  </Stack>;
  const renderTaskTable = () => <DataTable rows={rows} getRowId={(task) => task.id} onRowClick={(task) => navigate(`/tasks/${task.id}`)} searchPlaceholder="جستجوی وظیفه، فاز، فعالیت یا مسئول..." filters={[{ key: 'phase', label: 'فاز', options: phases.map((phase) => ({ value: phase.id, label: phase.title })), value: (task) => task.phaseId ?? '' }, { key: 'customerVisible', label: 'نمایش به مشتری', options: [{ value: 'visible', label: 'قابل مشاهده برای مشتری' }, { value: 'internal', label: 'داخلی' }], value: (task) => task.customerVisible ? 'visible' : 'internal' }]} columns={[{ key: 'title', label: 'عنوان', value: (task) => task.title }, { key: 'phase', label: 'فاز', value: (task) => phases.find((phase) => phase.id === task.phaseId)?.title ?? 'بدون فاز' }, { key: 'activity', label: 'فعالیت', value: (task) => activityRows.find((activity) => activity.id === task.activityId)?.title ?? '—' }, { key: 'assignee', label: 'مسئول', value: (task) => (task.assigneeIds ?? [task.assigneeId]).map((id) => users.find((user) => user.id === id)?.name).filter(Boolean).join('، ') }, { key: 'status', label: 'وضعیت', value: (task) => taskStatusLabel[task.status], render: (task) => <TaskStatusChip value={task.status} /> }, { key: 'priority', label: 'اولویت', value: (task) => priorityLabel[task.priority], render: (task) => <PriorityChip value={task.priority} /> }, { key: 'estimated', label: 'ساعت تخمینی', value: (task) => task.estimatedHours ?? 0, aggregate: 'sum' }, { key: 'actual', label: 'ساعت واقعی', value: (task) => actualTaskHours(task.id, projectTimes), aggregate: 'sum' }, { key: 'schedule', label: 'برنامه زمانی', value: (task) => `${task.startDate ?? ''} ${task.dueDate}`, render: (task) => `${formatDate(task.startDate ?? task.createdAt)} تا ${formatDate(task.dueDate)}` }, { key: 'visible', label: 'نمایش مشتری', value: (task) => task.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (task) => <CustomerVisibilityBadge visible={task.customerVisible} /> }]} />;
  const moveTaskToStatus = (taskId: string, status: TaskStatus) => {
    const task = taskRepository.get(taskId);
    if (!task || task.projectId !== project.id || task.status === status) return;
    taskRepository.update(taskId, { status, updatedAt: new Date().toISOString() });
  };
  const boardColumns: Array<{ status: TaskStatus; color: string }> = [
    { status: 'todo', color: '#64748B' },
    { status: 'in_progress', color: '#2563EB' },
    { status: 'review', color: '#D97706' },
    { status: 'done', color: '#059669' },
  ];
  const renderTaskBoard = () => <Box sx={{ overflowX: 'auto', pb: 1 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))', gap: 1.5, minWidth: 1180, alignItems: 'start' }}>
      {boardColumns.map(({ status, color }) => {
        const statusTasks = rows.filter((task) => task.status === status);
        const isDropTarget = boardDropStatus === status && Boolean(draggedTaskId);
        return <Box
          key={status}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setBoardDropStatus(status); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBoardDropStatus(null); }}
          onDrop={(event) => {
            event.preventDefault();
            const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
            if (taskId) moveTaskToStatus(taskId, status);
            setDraggedTaskId(null);
            setBoardDropStatus(null);
          }}
          sx={{
            bgcolor: isDropTarget ? 'action.selected' : 'action.hover',
            border: '1px solid',
            borderColor: isDropTarget ? color : 'divider',
            borderRadius: 2,
            p: 1.25,
            minHeight: 420,
            transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
            boxShadow: isDropTarget ? `0 0 0 2px ${color}22` : 'none',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color }} />
              <Typography sx={{ fontWeight: 800 }}>{taskStatusLabel[status]}</Typography>
            </Stack>
            <Chip size="small" label={statusTasks.length.toLocaleString('fa-IR')} sx={{ fontWeight: 700 }} />
          </Stack>
          <Stack spacing={1}>
            {statusTasks.map((task) => {
              const assignees = (task.assigneeIds ?? [task.assigneeId]).map((userId) => users.find((user) => user.id === userId)).filter((user): user is User => Boolean(user));
              const phase = phases.find((item) => item.id === task.phaseId);
              return <Card
                key={task.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', task.id);
                  setDraggedTaskId(task.id);
                }}
                onDragEnd={() => { setDraggedTaskId(null); setBoardDropStatus(null); }}
                onClick={() => navigate(`/tasks/${task.id}`)}
                sx={{
                  cursor: draggedTaskId === task.id ? 'grabbing' : 'grab',
                  opacity: draggedTaskId === task.id ? .55 : 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: '0 1px 2px rgb(15 23 42 / 0.06)',
                  transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
                  '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 5px 14px rgb(15 23 42 / 0.10)' },
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography sx={{ fontWeight: 800, mb: 1 }}>{task.title}</Typography>
                  <Stack direction="row" spacing={.75} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.25 }}>
                    <PriorityChip value={task.priority} />
                    {phase && <Chip size="small" variant="outlined" label={phase.title} />}
                    {task.tags.slice(0, 2).map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}
                  </Stack>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Stack direction="row" spacing={-.35} sx={{ alignItems: 'center' }}>
                      {assignees.slice(0, 3).map((assignee) => <UserAvatar key={assignee.id} user={assignee} size={28} />)}
                      {!assignees.length && <Typography variant="caption" color="text.secondary">بدون مسئول</Typography>}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>مهلت: {formatDate(task.dueDate)}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">تخمین: {(task.estimatedHours ?? 0).toLocaleString('fa-IR')} ساعت</Typography>
                    <Typography variant="caption" color="text.secondary">ثبت‌شده: {actualTaskHours(task.id, projectTimes).toLocaleString('fa-IR')} ساعت</Typography>
                  </Stack>
                </CardContent>
              </Card>;
            })}
            {!statusTasks.length && <Box sx={{ py: 5, px: 2, textAlign: 'center', border: '1px dashed', borderColor: isDropTarget ? color : 'divider', borderRadius: 1.5 }}><Typography variant="body2" color="text.secondary">وظیفه‌ای در این وضعیت نیست.</Typography><Typography variant="caption" color="text.secondary">وظیفه را اینجا رها کنید.</Typography></Box>}
          </Stack>
        </Box>;
      })}
    </Box>
  </Box>;
  const renderTimes = () => <DataTable rows={projectTimes} getRowId={(row) => row.id} searchPlaceholder="جستجوی کاربر یا وظیفه..." columns={[{ key: 'employee', label: 'کاربر', value: (row) => users.find((user) => user.id === row.employeeId)?.name }, { key: 'task', label: 'وظیفه', value: (row) => rows.find((task) => task.id === row.taskId)?.title }, { key: 'date', label: 'تاریخ', value: (row) => row.date }, { key: 'hours', label: 'مدت', value: (row) => row.hours, aggregate: 'sum' }, { key: 'cost', label: 'هزینه', value: (row) => row.calculatedCost ?? 0, aggregate: 'sum', render: (row) => formatCurrency(row.calculatedCost ?? 0) }, { key: 'status', label: 'وضعیت کار', value: (row) => getTimesheetStatusLabel(row.status), render: (row) => <Typography variant="caption" color={normalizeTimesheetStatus(row.status) === 'approved' ? 'success.main' : normalizeTimesheetStatus(row.status) === 'rejected' ? 'error.main' : 'warning.main'}>{getTimesheetStatusLabel(row.status)}</Typography> }, { key: 'billing', label: 'وضعیت مالی', value: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'], render: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'] }, { key: 'visible', label: 'قابل مشاهده برای مشتری', value: (row) => row.customerVisible ? 'بله' : 'خیر', render: (row) => <Checkbox checked={Boolean(row.customerVisible)} disabled /> }]} />;
  const renderBillableWork = () => {
    const billableRows = projectTimes.filter((row) => row.billable);
    const costOf = (row: typeof projectTimes[number]) => row.calculatedCost ?? row.hours * (row.hourlyRate ?? 0);
    const total = billableRows.reduce((sum, row) => sum + costOf(row), 0);
    const paid = billableRows.filter((row) => row.billingStatus === 'paid').reduce((sum, row) => sum + costOf(row), 0);
    return <Stack spacing={2}>
      <Alert severity="info">ساعات کاری قابل صورتحساب پروژه و وضعیت پرداخت آن‌ها.</Alert>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
        {[[ 'کل هزینه', total ], [ 'پرداخت شده', paid ], [ 'مانده', total - paid ]].map(([title, value]) => <Card key={String(title)}><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{formatCurrency(Number(value))}</Typography></CardContent></Card>)}
      </Box>
      <Card sx={{ p: 1 }}><DataTable rows={billableRows} getRowId={(row) => row.id} searchPlaceholder="جستجوی کارمند یا وظیفه..." csvFilename={`billable-work-${project.id}.csv`} columns={[
        { key: 'task', label: 'وظیفه', value: (row) => rows.find((task) => task.id === row.taskId)?.title ?? '—', groupable: true },
        { key: 'employee', label: 'کارمند', value: (row) => users.find((user) => user.id === row.employeeId)?.name ?? '—' },
        { key: 'date', label: 'تاریخ', value: (row) => row.date, render: (row) => formatDate(row.date) },
        { key: 'hours', label: 'ساعت', value: (row) => row.hours, render: (row) => `${row.hours} ساعت`, aggregate: 'sum' },
        { key: 'cost', label: 'هزینه', value: costOf, render: (row) => formatCurrency(costOf(row)), aggregate: 'sum' },
        { key: 'billing', label: 'وضعیت مالی', value: (row) => timesheetBillingStatusLabel[row.billingStatus ?? 'suspended'], render: (row) => <Chip size="small" color={row.billingStatus === 'paid' ? 'success' : row.billingStatus === 'suspended' ? 'default' : 'warning'} label={timesheetBillingStatusLabel[row.billingStatus ?? 'suspended']} /> },
      ]} /></Card>
    </Stack>;
  };
  const renderPhases = () => <Stack spacing={2}><Alert severity="info">پیشرفت فاز و پروژه از وضعیت وظایف محاسبه می‌شود و مقدار دستی ندارد.</Alert><Button variant="contained" startIcon={<Add />} onClick={() => openPhase()} sx={{ alignSelf: 'flex-start' }}>فاز جدید</Button><DataTable rows={phases} getRowId={(row) => row.id} onRowClick={openPhase} searchPlaceholder="جستجوی فاز..." columns={[{ key: 'title', label: 'عنوان', value: (row) => row.title }, { key: 'status', label: 'وضعیت', value: (row) => row.status }, { key: 'dates', label: 'بازه برنامه‌ریزی', value: (row) => `${row.startDate} تا ${row.endDate}`, render: (row) => `${formatDate(row.startDate)} تا ${formatDate(row.endDate)}` }, { key: 'tasks', label: 'وظایف', value: (row) => rows.filter((task) => task.phaseId === row.id).length }, { key: 'progress', label: 'پیشرفت مشتق‌شده', value: (row) => derivedPhaseProgress(row.id, rows, row.progress), aggregate: 'average', render: (row) => { const progress = derivedPhaseProgress(row.id, rows, row.progress); return <Box sx={{ minWidth: 110 }}><LinearProgress variant="determinate" value={progress} /><Typography variant="caption">{progress.toLocaleString('fa-IR')}٪</Typography></Box>; } }, { key: 'manager', label: 'مسئول', value: (row) => users.find((user) => user.id === row.managerId)?.name }, { key: 'visibility', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> }]} /></Stack>;
  const renderMembers = () => <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Alert severity="info" sx={{ flex: 1 }}>اعضای فعال پروژه، نقش‌های تخصیص‌یافته، حجم وظایف و ساعات واقعی آن‌ها در این بخش مدیریت می‌شود.</Alert><Button variant="contained" startIcon={<Add />} onClick={openMemberDialog} disabled={!availableUsers.length || !roleRows.length}>افزودن عضو</Button></Stack>
    <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>اعضای پروژه</Typography><DataTable rows={memberRows} getRowId={(member) => member.id} searchPlaceholder="جستجوی عضو یا نقش..." columns={[{ key: 'member', label: 'عضو', value: (member) => users.find((user) => user.id === member.personId)?.name ?? '—' }, { key: 'roles', label: 'نقش‌ها', value: (member) => roleRows.filter((role) => member.roleIds?.includes(role.id)).map((role) => role.name).join('، ') || member.role }, { key: 'responsibilities', label: 'مسئولیت اختصاصی', value: (member) => member.responsibilities || '—' }, { key: 'tasks', label: 'وظایف', value: (member) => rows.filter((task) => task.assigneeMemberIds?.includes(member.id) || (task.assigneeIds ?? [task.assigneeId]).includes(member.personId)).length }, { key: 'hours', label: 'ساعت واقعی', value: (member) => projectTimes.filter((entry) => entry.employeeId === member.personId).reduce((sum, entry) => sum + entry.hours, 0), aggregate: 'sum' }, { key: 'expected', label: 'ساعت مورد انتظار نقش‌ها', value: (member) => roleRows.filter((role) => member.roleIds?.includes(role.id)).reduce((sum, role) => sum + role.expectedHours, 0), aggregate: 'sum' }, { key: 'joined', label: 'شروع عضویت', value: (member) => member.joinedAt, render: (member) => formatDate(member.joinedAt) }]} /></Card>
  </Stack>;
  const renderRoles = () => <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Alert severity="info" sx={{ flex: 1 }}>نقش‌ها قالب‌های مسئولیت و فعالیت پروژه هستند و مستقل از فهرست اعضا مدیریت می‌شوند.</Alert><Button variant="contained" startIcon={<Add />} onClick={() => { applyRoleTemplate(''); setRoleOpen(true); }}>ایجاد نقش پروژه</Button></Stack>
    <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>نقش‌های قابل استفاده در این پروژه</Typography><DataTable rows={roleRows} getRowId={(role) => role.id} searchPlaceholder="جستجوی نقش، هدف یا مهارت..." columns={[{ key: 'name', label: 'نقش', value: (role) => role.name }, { key: 'responsibilities', label: 'مسئولیت‌ها', value: (role) => role.responsibilities.join('، ') }, { key: 'objectives', label: 'اهداف', value: (role) => role.objectives.join('، ') }, { key: 'skills', label: 'مهارت‌های لازم', value: (role) => role.requiredSkills.join('، ') }, { key: 'expected', label: 'ساعت مورد انتظار', value: (role) => role.expectedHours, aggregate: 'sum' }, { key: 'visibility', label: 'نمایش به مشتری', value: (role) => role.customerVisible ? 'بله' : 'خیر', render: (role) => <CustomerVisibilityBadge visible={role.customerVisible} /> }]} /></Card>
    <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>فعالیت‌های نقش‌ها</Typography><DataTable rows={activityRows} getRowId={(activity) => activity.id} searchPlaceholder="جستجوی فعالیت..." columns={[{ key: 'title', label: 'فعالیت', value: (activity) => activity.title }, { key: 'role', label: 'نقش', value: (activity) => roleRows.find((role) => role.id === activity.roleId)?.name ?? '—' }, { key: 'objective', label: 'هدف', value: (activity) => activity.objective ?? '—' }, { key: 'tasks', label: 'وظایف مرتبط', value: (activity) => rows.filter((task) => task.activityId === activity.id).length }, { key: 'expected', label: 'ساعت مورد انتظار', value: (activity) => activity.expectedHours, aggregate: 'sum' }, { key: 'visibility', label: 'نمایش به مشتری', value: (activity) => activity.customerVisible ? 'بله' : 'خیر', render: (activity) => <CustomerVisibilityBadge visible={activity.customerVisible} /> }]} /></Card>
  </Stack>;
  const renderAccesses = () => {
    const effectiveRows = memberRows.flatMap((member) => effectiveProjectAccesses(member, roleRows, accessRows).map((access) => ({ ...access, effectiveId: `${member.id}-${access.id}`, memberId: member.id })));
    return <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Alert severity="info" icon={<Security />} sx={{ flex: 1 }}>اطلاعات دسترسی را به همان شکلی که دریافت کرده‌اید ثبت کنید و تعیین کنید برای همه اعضا، یک نقش یا یک عضو قابل استفاده باشد.</Alert><Button variant="contained" startIcon={<Add />} onClick={() => { setAccessForm({ content: '', scope: 'project', status: 'granted', roleId: '', projectMemberId: '', startDate: new Date().toISOString().slice(0, 10), expiryDate: '', notes: '' }); setAccessOpen(true); }}>افزودن دسترسی</Button></Stack>
      <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>دسترسی مؤثر اعضا</Typography><Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>برای لغو یا اعطای مستقیم همان اطلاعات، روی ردیف کلیک کنید.</Typography><DataTable rows={effectiveRows} getRowId={(row) => row.effectiveId} onRowClick={(row) => { setAccessForm({ content: row.content, scope: 'person', status: row.status === 'granted' ? 'revoked' : 'granted', roleId: '', projectMemberId: row.memberId, startDate: new Date().toISOString().slice(0, 10), expiryDate: row.expiryDate ?? '', notes: row.status === 'granted' ? `لغو مستقیم دسترسی ارث‌رسیده از ${row.source}` : 'اعطای مستقیم مجدد' }); setAccessOpen(true); }} searchPlaceholder="جستجوی عضو یا اطلاعات دسترسی..." filters={[{ key: 'status', label: 'وضعیت', options: [{ value: 'granted', label: 'اعطا شده' }, { value: 'revoked', label: 'لغو شده' }], value: (row) => row.status }]} columns={[{ key: 'member', label: 'عضو', value: (row) => users.find((user) => user.id === memberRows.find((member) => member.id === row.memberId)?.personId)?.name ?? '—' }, { key: 'content', label: 'اطلاعات دسترسی', value: (row) => row.content, render: (row) => <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', minWidth: 260 }}>{row.content}</Typography> }, { key: 'status', label: 'وضعیت', value: (row) => row.status === 'granted' ? 'اعطا شده' : 'لغو شده', render: (row) => <Chip size="small" color={row.status === 'granted' ? 'success' : 'error'} label={row.status === 'granted' ? 'اعطا شده' : 'لغو شده'} /> }, { key: 'reason', label: 'چرا این دسترسی را دارد؟', value: (row) => `${row.source}: ${row.sourceName}`, render: (row) => <Stack spacing={0.25}><Typography variant="body2">{row.source}</Typography><Typography variant="caption" color="text.secondary">{row.sourceName}</Typography></Stack> }, { key: 'expiry', label: 'انقضا', value: (row) => row.expiryDate ?? '', render: (row) => row.expiryDate ? formatDate(row.expiryDate) : 'بدون انقضا' }]} /></Card>
      <Card sx={{ p: 1 }}><Typography sx={{ px: 1, pt: 1, fontWeight: 800 }}>دسترسی‌های تعریف‌شده</Typography><DataTable rows={accessRows} getRowId={(row) => row.id} searchPlaceholder="جستجوی دسترسی‌ها..." columns={[{ key: 'content', label: 'اطلاعات دسترسی', value: (row) => row.content, render: (row) => <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', minWidth: 260 }}>{row.content}</Typography> }, { key: 'scope', label: 'برای چه کسانی؟', value: (row) => row.scope === 'project' ? 'همه اعضای پروژه' : row.scope === 'role' ? `اعضای نقش ${roleRows.find((role) => role.id === row.roleId)?.name ?? '—'}` : `فقط ${users.find((user) => user.id === memberRows.find((member) => member.id === row.projectMemberId)?.personId)?.name ?? '—'}` }, { key: 'status', label: 'وضعیت', value: (row) => row.status === 'granted' ? 'اعطا' : 'لغو', render: (row) => <Chip size="small" color={row.status === 'granted' ? 'success' : 'error'} label={row.status === 'granted' ? 'اعطا' : 'لغو'} /> }, { key: 'document', label: 'سند مرتبط', value: (row) => businessDocuments.find((document) => document.id === row.documentId)?.title ?? '—' }, { key: 'notes', label: 'یادداشت', value: (row) => row.notes }, { key: 'actions', label: 'عملیات', sortable: false, value: () => '', render: (row) => <Button size="small" color="error" startIcon={<DeleteOutlined />} onClick={(event) => { event.stopPropagation(); setDeletingAccess(row); }}>حذف</Button> }]} /></Card>
    </Stack>;
  };
  const renderSimple = (kind: string) => {
    if (kind === 'events') {
      const eventRows = [...projectEventRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return <Stack spacing={2}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Alert severity="info" sx={{ flex: 1 }}>رویدادهای مهم چرخه عمر پروژه، از عضویت اعضا و تغییر وضعیت تا نقاط عطف، تأیید مشتری، اختلال سرویس و رخدادهای قراردادی.</Alert><Button variant="contained" startIcon={<Add />} onClick={() => navigate(`/projects/${project.id}/events?create=1`)}>ثبت رویداد</Button></Stack><Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>تایم‌لاین رویدادهای پروژه</Typography>{eventRows.length ? <Stack spacing={0}>{eventRows.map((event) => <Box key={event.id} sx={{ position: 'relative', pr: 3, pb: 2.5, mb: 2, borderRight: '2px solid', borderColor: event.status === 'completed' ? 'success.main' : 'warning.main' }}><Box sx={{ position: 'absolute', right: -7, top: 0, width: 12, height: 12, borderRadius: '50%', bgcolor: event.status === 'completed' ? 'success.main' : 'warning.main' }} /><Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 1 }}><Box><Typography sx={{ fontWeight: 800 }}>{event.title ?? event.eventType}</Typography><Typography variant="body2" color="text.secondary">{event.eventType}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(event.date)} • ثبت‌کننده: {users.find((user) => user.id === event.registeredBy)?.name ?? '—'}</Typography></Box><Stack direction="row" spacing={1}><Chip size="small" label={event.stage} /><Chip size="small" label={event.priority} color={event.priority === 'بسیار بالا' ? 'error' : event.priority === 'بالا' ? 'warning' : 'default'} /><CustomerVisibilityBadge visible={event.customerVisible} /></Stack></Stack><Typography variant="body2" sx={{ mt: 1 }}>{event.description}</Typography><Typography variant="caption" color="text.secondary">عضو: {users.find((user) => user.id === event.personId)?.name ?? '—'}{event.phaseId ? ` • فاز: ${phases.find((phase) => phase.id === event.phaseId)?.title ?? '—'}` : ''}{event.taskId ? ` • وظیفه: ${rows.find((task) => task.id === event.taskId)?.title ?? '—'}` : ''}</Typography>{event.attachments?.length ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5 }}>پیوست / سند: {event.attachments.join('، ')}</Typography> : null}</Box>)}</Stack> : <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>هنوز رویدادی برای این پروژه ثبت نشده است.</Typography>}</CardContent></Card></Stack>;
    }
    if (kind === 'files') return <><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 1.5 }}><Alert severity="info" sx={{ flex: 1 }}>اسناد این پروژه از سامانه یکپارچه اسناد خوانده می‌شوند و فایل‌ها در فایل منیجر باقی می‌مانند.</Alert><Stack direction="row" spacing={1}><Button variant="contained" onClick={() => navigate(`/documents?project=${project.id}&section=projects`)}>ایجاد / مدیریت سند</Button><Button variant="outlined" onClick={() => navigate(`/media?project=${project.id}`)}>فایل منیجر پروژه</Button></Stack></Stack><DataTable rows={projectDocuments} getRowId={(row) => row.id} onRowClick={() => navigate(`/documents?project=${project.id}&section=projects`)} searchPlaceholder="جستجوی سند..." columns={[{ key: 'title', label: 'عنوان', value: (row) => row.title }, { key: 'type', label: 'نوع', value: (row) => documentTypeLabels[row.documentType] }, { key: 'number', label: 'شماره سند', value: (row) => row.documentNumber }, { key: 'date', label: 'آخرین تغییر', value: (row) => row.updatedAt, render: (row) => formatDate(row.updatedAt) }, { key: 'status', label: 'وضعیت', value: (row) => documentStatusLabels[row.status], render: (row) => <Chip size="small" color={documentStatusColor(row.status)} label={documentStatusLabels[row.status]} /> }, { key: 'visibility', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> }, { key: 'files', label: 'پیوست', value: (row) => row.attachments.length, render: (row) => `${row.attachments.length.toLocaleString('fa-IR')} فایل` }]} /></>;
    if (kind === 'chat') return <Card><CardContent><Typography sx={{ fontWeight: 700 }}>گفتگوی پروژه {project.name}</Typography><Typography variant="body2" color="text.secondary">اعضا: {members.map((member) => member.name).join('، ')}</Typography><Button sx={{ mt: 2 }} variant="contained" startIcon={<ChatBubbleOutlined />} onClick={() => navigate(`/chat?project=${project.id}`)}>باز کردن گفتگو</Button></CardContent></Card>;
    if (kind === 'tickets') return <Stack spacing={2}><Button variant="contained" startIcon={<Add />} sx={{ alignSelf: 'flex-start' }} onClick={() => navigate(`/tickets?create=1&project=${project.id}`)}>تیکت جدید</Button><DataTable rows={projectTickets} getRowId={(row) => row.id} onRowClick={(row) => navigate(`/tickets/${row.id}`)} searchPlaceholder="جستجوی تیکت..." columns={[{ key: 'title', label: 'موضوع', value: (row) => row.title }, { key: 'status', label: 'وضعیت', value: (row) => row.status }, { key: 'priority', label: 'اولویت', value: (row) => row.priority }, { key: 'assignee', label: 'مسئول', value: (row) => users.find((user) => user.id === row.assigneeId)?.name }, { key: 'visible', label: 'قابل مشاهده برای مشتری', value: (row) => row.customerVisible ? 'بله' : 'خیر' }]} /></Stack>;
    if (kind === 'contracts') return <DataTable rows={contracts.filter((item) => item.projectId === project.id)} getRowId={(row) => row.id} searchPlaceholder="جستجوی قرارداد..." columns={[{ key: 'title', label: 'موضوع', value: (row) => row.title }, { key: 'customer', label: 'مشتری', value: () => customer?.company }, { key: 'amount', label: 'ارزش', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) }, { key: 'start', label: 'شروع', value: (row) => row.startDate }, { key: 'end', label: 'خاتمه', value: (row) => row.endDate }, { key: 'status', label: 'وضعیت', value: (row) => row.status }, { key: 'visibility', label: 'نمایش به مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> }]} />;
    if (kind === 'sales') return <DataTable rows={projectSales.filter((item) => item.projectId === project.id)} getRowId={(row) => row.id} searchPlaceholder="جستجوی فروش..." columns={[{ key: 'title', label: 'عنوان', value: (row) => row.title }, { key: 'amount', label: 'مبلغ', value: (row) => row.amount, aggregate: 'sum', render: (row) => formatCurrency(row.amount) }, { key: 'status', label: 'وضعیت', value: (row) => row.status }, { key: 'date', label: 'تاریخ', value: (row) => row.date }]} />;
    if (kind === 'notes') return <DataTable rows={projectNotes.filter((item) => item.projectId === project.id)} getRowId={(row) => row.id} searchPlaceholder="جستجوی یادداشت..." columns={[{ key: 'title', label: 'عنوان', value: (row) => row.title }, { key: 'body', label: 'متن', value: (row) => row.body }, { key: 'author', label: 'نویسنده', value: (row) => users.find((user) => user.id === row.authorId)?.name }, { key: 'visible', label: 'نمایش مشتری', value: (row) => row.customerVisible ? 'قابل مشاهده برای مشتری' : 'داخلی', render: (row) => <CustomerVisibilityBadge visible={row.customerVisible} /> }]} />;
    if (kind === 'gantt') return <Card><CardContent><Typography sx={{ fontWeight: 800, mb: 1 }}>گانت برنامه‌ریزی پروژه</Typography><Typography variant="caption" color="text.secondary">نوارها را جابه‌جا کنید و لبه‌های آن‌ها را بکشید تا زمان شروع یا پایان تغییر کند.</Typography><Box ref={ganttRef} sx={{ mt: 2, overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, minWidth: 760, direction: 'ltr', bgcolor: 'background.paper' }}><Box sx={{ display: 'grid', gridTemplateColumns: '220px 1fr', bgcolor: 'action.hover', color: 'text.primary', position: 'sticky', top: 0, zIndex: 1 }}><Typography sx={{ p: 1, fontWeight: 700, color: 'text.primary', direction: 'rtl', textAlign: 'right' }}>وظیفه</Typography><Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${totalDays}, minmax(38px, 1fr))` }}>{Array.from({ length: totalDays }, (_, index) => <Typography key={index} variant="caption" sx={{ p: .75, textAlign: 'center', color: 'text.primary', borderRight: '1px solid', borderColor: 'divider' }}>{new Date(timelineStart.getTime() + index * dayMs).toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' })}</Typography>)}</Box></Box>{ganttTasks.map(({ task, start, end }) => { const left = Math.max(0, (start - timelineStart.getTime()) / dayMs); const width = Math.max(1, (end - start) / dayMs + 1); return <Box key={task.id} sx={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 48, borderTop: '1px solid', borderColor: 'divider' }}><Box sx={{ p: 1, overflow: 'hidden', bgcolor: 'background.paper', direction: 'rtl', textAlign: 'right' }}><Typography noWrap sx={{ fontWeight: 700, color: 'text.primary' }}>{task.title}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{users.find((user) => user.id === task.assigneeId)?.name ?? '—'} • {taskStatusLabel[task.status]}</Typography></Box><Box sx={{ position: 'relative', backgroundImage: `linear-gradient(to right, rgba(148,163,184,.22) 1px, transparent 1px)`, backgroundSize: `${100 / totalDays}% 100%` }}><Box onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setGanttDrag({ taskId: task.id, mode: 'move', originX: event.clientX, start, end }); }} sx={{ position: 'absolute', left: `${left * (100 / totalDays)}%`, width: `${width * (100 / totalDays)}%`, top: 10, height: 27, borderRadius: 1, bgcolor: task.status === 'done' ? '#047857' : task.status === 'review' ? '#B45309' : '#1E40AF', color: '#fff', direction: 'ltr', cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: .5, boxShadow: '0 1px 2px rgb(15 23 42 / 0.2)' }}><Box onPointerDown={(event) => { event.stopPropagation(); setGanttDrag({ taskId: task.id, mode: 'start', originX: event.clientX, start, end }); }} sx={{ width: 8, height: '100%', flexShrink: 0, cursor: 'ew-resize' }} /><Typography variant="caption" sx={{ color: '#fff', direction: 'rtl', textShadow: '0 1px 2px rgb(0 0 0 / 0.45)', fontWeight: 700, px: .5 }} noWrap>{formatDate(task.startDate ?? task.createdAt)} تا {formatDate(task.dueDate)}</Typography><Box onPointerDown={(event) => { event.stopPropagation(); setGanttDrag({ taskId: task.id, mode: 'end', originX: event.clientX, start, end }); }} sx={{ width: 8, height: '100%', flexShrink: 0, cursor: 'ew-resize' }} /></Box></Box></Box>; })}</Box></CardContent></Card>;
    return <Card><CardContent><Typography sx={{ fontWeight: 700 }}>تایم‌لاین رویدادهای پروژه</Typography>{projectEventRows.map((event) => <Box key={event.id} sx={{ p: 1.5, mt: 1, bgcolor: '#F8FAFC', borderRight: '3px solid #2563EB' }}><Typography sx={{ fontWeight: 600 }}>{event.title ?? event.eventType}</Typography><Typography variant="caption">{formatDate(event.date)} • {event.description}</Typography></Box>)}</CardContent></Card>;
  };
  const renderTaskViews = () => <Stack spacing={2}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="contained" startIcon={<Add />} onClick={() => navigate(`/tasks?create=1&project=${project.id}`)}>وظیفه جدید</Button>
      <Button variant={taskView === 'board' ? 'contained' : 'outlined'} startIcon={<ViewKanbanOutlined />} onClick={() => setTaskDisplay('board')}>نمای برد</Button>
      <Button variant={taskView === 'gantt' ? 'contained' : 'outlined'} onClick={() => setTaskDisplay('gantt')}>نمای گانت</Button>
      <Button variant={taskView === 'table' ? 'contained' : 'outlined'} onClick={() => setTaskDisplay('table')}>نمای جدول</Button>
    </Stack>
    {taskView === 'gantt' ? renderSimple('gantt') : taskView === 'board' ? renderTaskBoard() : renderTaskTable()}
  </Stack>;
  let content = renderOverview();
  if (selected === 'tasks') content = renderTaskViews();
  else if (selected === 'timesheets') content = renderTimes();
  else if (selected === 'billable-work') content = renderBillableWork();
  else if (selected === 'phases') content = renderPhases();
  else if (selected === 'members') content = renderMembers();
  else if (selected === 'roles') content = renderRoles();
  else if (selected === 'accesses') content = renderAccesses();
  else if (selected !== 'overview') content = renderSimple(selected);
  return <Box>
    <PageHeader title={project.name} subtitle={`${project.code ?? project.id} • مشتری: ${customer?.company ?? '—'} • پیشرفت ${projectProgress.toLocaleString('fa-IR')}٪`} crumbs={['تری‌لیز', 'پروژه‌ها', project.name]} actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditProjectOpen(true)}>ویرایش پروژه</Button><Button variant="outlined" startIcon={<ChatBubbleOutlined />} onClick={() => setQuery(new URLSearchParams({ view: 'chat' }))}>گفتگوی پروژه</Button></Stack>} />
    {(project.tags ?? []).length > 0 && <Stack direction="row" spacing={.75} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>{project.tags.map((tag) => <Chip key={tag} size="small" variant="outlined" label={tag} />)}</Stack>}
    <Tabs value={keys.indexOf(selected)} onChange={(_, value) => gotoTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>{labels.map((label) => <Tab key={label} label={label} />)}</Tabs>
    {content}
    <ProjectFormDialog key={`${project.id}-${editProjectOpen ? 'open' : 'closed'}`} open={editProjectOpen} onClose={() => setEditProjectOpen(false)} onSubmit={updateProject} project={project} suggestedTags={projectRepository.list().flatMap((item) => item.tags ?? [])} />
    <Dialog open={memberOpen} onClose={() => setMemberOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { direction: 'rtl' } } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>افزودن کاربر به پروژه</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{memberError && <Alert severity="error">{memberError}</Alert>}<FormControl fullWidth required><InputLabel>کاربر</InputLabel><Select label="کاربر" value={memberForm.personId} onChange={(event) => setMemberForm({ ...memberForm, personId: event.target.value })}>{availableUsers.map((user) => <MenuItem key={user.id} value={user.id}>{user.name} — {user.title}</MenuItem>)}</Select></FormControl><FormControl fullWidth required><InputLabel>نقش‌های پروژه</InputLabel><Select multiple label="نقش‌های پروژه" value={memberForm.roleIds} onChange={(event) => setMemberForm({ ...memberForm, roleIds: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value })} renderValue={(selectedRoles) => roleRows.filter((role) => selectedRoles.includes(role.id)).map((role) => role.name).join('، ')}>{roleRows.map((role) => <MenuItem key={role.id} value={role.id}><Checkbox checked={memberForm.roleIds.includes(role.id)} />{role.name}</MenuItem>)}</Select></FormControl><TextField multiline minRows={3} label="مسئولیت اختصاصی عضو" value={memberForm.responsibilities} onChange={(event) => setMemberForm({ ...memberForm, responsibilities: event.target.value })} /></Stack></DialogContent><DialogActions><Button onClick={() => setMemberOpen(false)}>انصراف</Button><Button variant="contained" onClick={addProjectMember} disabled={!memberForm.personId || !memberForm.roleIds.length}>افزودن به پروژه</Button></DialogActions>
    </Dialog>
    <Dialog open={roleOpen} onClose={() => setRoleOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>ایجاد نقش قابل سفارشی‌سازی برای پروژه</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Autocomplete freeSolo options={[...new Set([...projectRoleTemplateRepository.list().map((template) => template.name), ...roleRows.map((role) => role.name)])]} inputValue={roleForm.name} onInputChange={(_, value) => setRoleForm((current) => ({ ...current, name: value }))} renderInput={(params) => <TextField {...params} required autoFocus label="نام دلخواه نقش" placeholder="مثلاً متخصص سئو یا مدیر اینستاگرام" helperText="نام پیشنهادی را انتخاب کنید یا نام جدید خودتان را بنویسید." />} /><FormControl fullWidth><InputLabel>الگوی نقش (اختیاری)</InputLabel><Select label="الگوی نقش (اختیاری)" value={roleForm.templateId} onChange={(event) => applyRoleTemplate(event.target.value)}><MenuItem value="">بدون الگو؛ تعریف کاملاً سفارشی</MenuItem>{projectRoleTemplateRepository.list().map((template) => <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>)}</Select></FormControl><TextField label="شرح نقش" value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} /><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><TextField fullWidth multiline minRows={4} label="مسئولیت‌ها (هر مورد یک خط)" value={roleForm.responsibilities} onChange={(event) => setRoleForm({ ...roleForm, responsibilities: event.target.value })} /><TextField fullWidth multiline minRows={4} label="فعالیت‌ها (هر مورد یک خط)" value={roleForm.activities} onChange={(event) => setRoleForm({ ...roleForm, activities: event.target.value })} /></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><TextField fullWidth multiline minRows={3} label="اهداف" value={roleForm.objectives} onChange={(event) => setRoleForm({ ...roleForm, objectives: event.target.value })} /><TextField fullWidth multiline minRows={3} label="مهارت‌های لازم" value={roleForm.requiredSkills} onChange={(event) => setRoleForm({ ...roleForm, requiredSkills: event.target.value })} /></Stack><TextField type="number" label="ساعت مورد انتظار" value={roleForm.expectedHours} onChange={(event) => setRoleForm({ ...roleForm, expectedHours: event.target.value })} /><Stack direction="row" sx={{ alignItems: 'center' }}><Checkbox checked={roleForm.customerVisible} onChange={(event) => setRoleForm({ ...roleForm, customerVisible: event.target.checked })} /><Typography variant="body2">نقش و فعالیت‌های آن برای مشتری قابل مشاهده باشند</Typography></Stack></Stack></DialogContent><DialogActions><Button onClick={() => setRoleOpen(false)}>انصراف</Button><Button variant="contained" onClick={saveRole} disabled={!roleForm.name.trim()}>ایجاد نقش</Button></DialogActions>
    </Dialog>
    <Dialog open={accessOpen} onClose={() => setAccessOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>افزودن دسترسی پروژه</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField required fullWidth multiline minRows={5} autoFocus label="اطلاعات دسترسی" placeholder="مثال: Y platform, username: X, password: Y" value={accessForm.content} onChange={(event) => setAccessForm({ ...accessForm, content: event.target.value })} />
        <FormControl fullWidth><InputLabel>این دسترسی برای چه کسانی است؟</InputLabel><Select label="این دسترسی برای چه کسانی است؟" value={accessForm.scope} onChange={(event) => setAccessForm({ ...accessForm, scope: event.target.value as ProjectAccess['scope'], roleId: '', projectMemberId: '' })}><MenuItem value="project">همه اعضای پروژه</MenuItem><MenuItem value="role">همه اعضای یک نقش مشخص</MenuItem><MenuItem value="person">فقط یک عضو مشخص</MenuItem></Select></FormControl>
        {accessForm.scope === 'role' && <FormControl required fullWidth><InputLabel>نقش پروژه</InputLabel><Select label="نقش پروژه" value={accessForm.roleId} onChange={(event) => setAccessForm({ ...accessForm, roleId: event.target.value })}>{roleRows.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}</Select></FormControl>}
        {accessForm.scope === 'person' && <FormControl required fullWidth><InputLabel>عضو پروژه</InputLabel><Select label="عضو پروژه" value={accessForm.projectMemberId} onChange={(event) => setAccessForm({ ...accessForm, projectMemberId: event.target.value })}>{memberRows.map((member) => <MenuItem key={member.id} value={member.id}>{users.find((user) => user.id === member.personId)?.name}</MenuItem>)}</Select></FormControl>}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><FormControl fullWidth><InputLabel>عملیات</InputLabel><Select label="عملیات" value={accessForm.status} onChange={(event) => setAccessForm({ ...accessForm, status: event.target.value as ProjectAccess['status'] })}><MenuItem value="granted">اعطای دسترسی</MenuItem><MenuItem value="revoked">لغو دسترسی</MenuItem></Select></FormControl><JalaliDatePicker fullWidth label="شروع دسترسی" value={accessForm.startDate} onChange={(value) => setAccessForm({ ...accessForm, startDate: value })} /><JalaliDatePicker fullWidth label="تاریخ انقضا (اختیاری)" value={accessForm.expiryDate} onChange={(value) => setAccessForm({ ...accessForm, expiryDate: value })} /></Stack>
        <TextField multiline minRows={2} label="یادداشت" value={accessForm.notes} onChange={(event) => setAccessForm({ ...accessForm, notes: event.target.value })} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setAccessOpen(false)}>انصراف</Button><Button variant="contained" onClick={saveAccess} disabled={!accessForm.content.trim() || (accessForm.scope === 'role' && !accessForm.roleId) || (accessForm.scope === 'person' && !accessForm.projectMemberId)}>ثبت دسترسی</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(deletingAccess)} onClose={() => setDeletingAccess(null)} fullWidth maxWidth="xs">
      <DialogTitle>حذف دسترسی</DialogTitle>
      <DialogContent><Typography variant="body2">این دسترسی از پروژه و فهرست دسترسی مؤثر اعضا حذف می‌شود:</Typography><Typography sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, whiteSpace: 'pre-wrap' }}>{deletingAccess?.content}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setDeletingAccess(null)}>انصراف</Button><Button color="error" variant="contained" startIcon={<DeleteOutlined />} onClick={async () => { if (deletingAccess) await projectAccessRepository.remove(deletingAccess.id); setDeletingAccess(null); }}>حذف دسترسی</Button></DialogActions>
    </Dialog>
    <Dialog open={phaseOpen} onClose={() => setPhaseOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editingPhase ? 'ویرایش فاز' : 'ایجاد فاز جدید'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField required label="عنوان فاز" value={phaseForm.title} onChange={(e) => setPhaseForm({ ...phaseForm, title: e.target.value })} /><FormControl fullWidth><InputLabel>وضعیت</InputLabel><Select label="وضعیت" value={phaseForm.status} onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value as ProjectPhase['status'] })}><MenuItem value="planned">برنامه‌ریزی‌شده</MenuItem><MenuItem value="in_progress">در حال اجرا</MenuItem><MenuItem value="completed">تکمیل‌شده</MenuItem><MenuItem value="on_hold">متوقف</MenuItem></Select></FormControl><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><JalaliDatePicker label="تاریخ شروع" value={phaseForm.startDate} onChange={(value) => setPhaseForm({ ...phaseForm, startDate: value })} /><JalaliDatePicker label="تاریخ پایان" value={phaseForm.endDate} onChange={(value) => setPhaseForm({ ...phaseForm, endDate: value })} /></Stack><Alert severity="info">پیشرفت این فاز از وضعیت وظایف آن محاسبه می‌شود.</Alert><TextField multiline minRows={3} label="توضیحات" value={phaseForm.description} onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })} /><Stack direction="row" sx={{ alignItems: 'center' }}><Checkbox checked={phaseForm.customerVisible} onChange={(e) => setPhaseForm({ ...phaseForm, customerVisible: e.target.checked })} /><Typography variant="body2">قابل مشاهده برای مشتری</Typography></Stack></Stack></DialogContent><DialogActions><Button onClick={() => setPhaseOpen(false)}>انصراف</Button><Button variant="contained" onClick={savePhase}>ذخیره</Button></DialogActions></Dialog>
    {timer && <Box sx={{ position: 'fixed', bottom: 20, left: 20, zIndex: 1200, bgcolor: 'primary.main', color: 'white', px: 2, py: 1, borderRadius: 2 }}><Typography variant="body2">تایمر فعال: {rows.find((task) => task.id === timer)?.title} — {elapsed} ثانیه</Typography><Button color="inherit" size="small" startIcon={<Stop />} onClick={() => setTimer(null)}>توقف</Button></Box>}
  </Box>;
}
