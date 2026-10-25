import { Add, AssignmentOutlined, BusinessOutlined, EventOutlined, GroupsOutlined, HandshakeOutlined, PersonAddOutlined, ReceiptLongOutlined, RequestQuoteOutlined, SupportAgentOutlined, TaskAltOutlined } from '@mui/icons-material';
import { Button, ListItemIcon, Menu, MenuItem } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Item = { key: string; label: string; route: string; icon: React.ReactNode };
const items: Item[] = [
  { key: 'invoice', label: 'فاکتور', route: '/invoices?create=1', icon: <ReceiptLongOutlined /> },
  { key: 'proforma', label: 'پیش‌فاکتور', route: '/invoices?view=proforma&create=1', icon: <RequestQuoteOutlined /> },
  { key: 'customer', label: 'مشتری', route: '/customers?create=1', icon: <GroupsOutlined /> },
  { key: 'project', label: 'پروژه', route: '/projects?create=1', icon: <BusinessOutlined /> },
  { key: 'task', label: 'وظیفه', route: '/tasks?create=1', icon: <TaskAltOutlined /> },
  { key: 'lead', label: 'مشتری احتمالی', route: '/leads?create=1', icon: <PersonAddOutlined /> },
  { key: 'contract', label: 'قرارداد', route: '/contracts?create=1', icon: <HandshakeOutlined /> },
  { key: 'goal', label: 'هدف', route: '/goals?create=1', icon: <AssignmentOutlined /> },
  { key: 'ticket', label: 'تیکت', route: '/tickets?create=1', icon: <SupportAgentOutlined /> },
  { key: 'user', label: 'کارمند / کاربر', route: '/hr/employees?create=1', icon: <GroupsOutlined /> },
  { key: 'event', label: 'رویداد', route: '/project-events?create=1', icon: <EventOutlined /> },
];

export default function QuickCreateMenu() {
  const navigate = useNavigate(); const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openItem = (item: Item) => {
    setAnchor(null);
    navigate(item.route);
  };
  return <><Button variant="contained" startIcon={<Add />} onClick={(event) => setAnchor(event.currentTarget)}>ایجاد سریع</Button><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)' } } }}>{items.map((item) => <MenuItem key={item.key} onClick={() => openItem(item)} sx={{ whiteSpace: 'normal' }}><ListItemIcon>{item.icon}</ListItemIcon>{item.label}</MenuItem>)}</Menu></>;
}
