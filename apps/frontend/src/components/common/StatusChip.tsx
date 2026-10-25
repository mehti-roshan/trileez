import { Chip } from '@mui/material';
import {
  customerStatusLabel,
  deviceStatusLabel,
  priorityLabel,
  projectStatusLabel,
  sessionStatusLabel,
  taskStatusLabel,
  ticketStatusLabel,
} from '../../utils/format.ts';
import type {
  CustomerStatus,
  DeviceStatus,
  Priority,
  ProjectStatus,
  SessionStatus,
  TaskStatus,
  TicketStatus,
} from '../../types/index.ts';

const colorMap = {
  success: { bg: '#ECFDF5', color: '#047857' },
  warning: { bg: '#FFFBEB', color: '#B45309' },
  info: { bg: '#EFF6FF', color: '#1D4ED8' },
  error: { bg: '#FEF2F2', color: '#B91C1C' },
  neutral: { bg: '#F1F5F9', color: '#475569' },
} as const;

function chip(label: string, tone: keyof typeof colorMap) {
  const colors = colorMap[tone];
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: colors.bg, color: colors.color, fontWeight: 600, borderRadius: '8px' }}
    />
  );
}

export function TaskStatusChip({ value }: { value: TaskStatus }) {
  const tone = { todo: 'neutral', in_progress: 'info', review: 'warning', done: 'success' }[value] as keyof typeof colorMap;
  return chip(taskStatusLabel[value], tone);
}

export function PriorityChip({ value }: { value: Priority }) {
  const tone = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'error' }[value] as keyof typeof colorMap;
  return chip(priorityLabel[value], tone);
}

export function ProjectStatusChip({ value }: { value: ProjectStatus }) {
  const tone = { active: 'success', on_hold: 'warning', completed: 'info', archived: 'neutral' }[value] as keyof typeof colorMap;
  return chip(projectStatusLabel[value], tone);
}

export function CustomerStatusChip({ value }: { value: CustomerStatus }) {
  const tone = { active: 'success', inactive: 'neutral', lead: 'warning' }[value] as keyof typeof colorMap;
  return chip(customerStatusLabel[value], tone);
}

export function TicketStatusChip({ value }: { value: TicketStatus }) {
  const tone = { open: 'error', in_progress: 'info', waiting: 'warning', closed: 'neutral' }[value] as keyof typeof colorMap;
  return chip(ticketStatusLabel[value], tone);
}

export function DeviceStatusChip({ value }: { value: DeviceStatus }) {
  const tone = { online: 'success', offline: 'neutral', busy: 'warning' }[value] as keyof typeof colorMap;
  return chip(deviceStatusLabel[value], tone);
}

export function SessionStatusChip({ value }: { value: SessionStatus }) {
  const tone = { pending: 'warning', active: 'success', ended: 'neutral', rejected: 'error' }[value] as keyof typeof colorMap;
  return chip(sessionStatusLabel[value], tone);
}
