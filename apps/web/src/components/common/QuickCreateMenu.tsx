import { Add, AssignmentOutlined, BusinessOutlined, DescriptionOutlined, EventOutlined, GroupsOutlined, HandshakeOutlined, PersonAddOutlined, ReceiptLongOutlined, RequestQuoteOutlined, SupportAgentOutlined, TaskAltOutlined } from '@mui/icons-material';
import { Alert, Button, ListItemIcon, Menu, MenuItem, Snackbar } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EntityFormDialog, { type EntityField } from './EntityFormDialog.tsx';

type Item = { key: string; label: string; route: string; icon: React.ReactNode; fields: EntityField[] };
const items: Item[] = [
  { key: 'invoice', label: 'فاکتور', route: '/invoices?create=1', icon: <ReceiptLongOutlined />, fields: [{ name: 'number', label: 'شماره فاکتور', required: true }, { name: 'customer', label: 'مشتری', required: true }, { name: 'amount', label: 'مبلغ', type: 'number', required: true }, { name: 'dueDate', label: 'سررسید', type: 'date' }] },
  { key: 'proforma', label: 'پیش‌فاکتور', route: '/invoices?view=proforma&create=1', icon: <RequestQuoteOutlined />, fields: [{ name: 'customer', label: 'مشتری', required: true }, { name: 'amount', label: 'مبلغ', type: 'number', required: true }, { name: 'validUntil', label: 'اعتبار تا', type: 'date' }] },
  { key: 'proposal', label: 'پیشنهاد', route: '/proposals?create=1', icon: <DescriptionOutlined />, fields: [{ name: 'title', label: 'عنوان پیشنهاد', required: true }, { name: 'customer', label: 'مشتری', required: true }, { name: 'amount', label: 'مبلغ', type: 'number' }] },
  { key: 'customer', label: 'مشتری', route: '/customers?create=1', icon: <GroupsOutlined />, fields: [{ name: 'name', label: 'نام شخص تماس', required: true }, { name: 'company', label: 'نام شرکت', required: true }, { name: 'phone', label: 'شماره تماس' }] },
  { key: 'project', label: 'پروژه', route: '/projects?create=1', icon: <BusinessOutlined />, fields: [{ name: 'name', label: 'نام پروژه', required: true }, { name: 'customer', label: 'مشتری', required: true }] },
  { key: 'task', label: 'وظیفه', route: '/tasks?create=1', icon: <TaskAltOutlined />, fields: [{ name: 'title', label: 'عنوان وظیفه', required: true }, { name: 'project', label: 'پروژه', required: true }] },
  { key: 'lead', label: 'مشتری احتمالی', route: '/leads?create=1', icon: <PersonAddOutlined />, fields: [{ name: 'name', label: 'نام', required: true }, { name: 'company', label: 'شرکت' }, { name: 'phone', label: 'تلفن' }] },
  { key: 'contract', label: 'قرارداد', route: '/contracts?create=1', icon: <HandshakeOutlined />, fields: [{ name: 'title', label: 'عنوان قرارداد', required: true }, { name: 'customer', label: 'مشتری', required: true }, { name: 'amount', label: 'مبلغ', type: 'number' }] },
  { key: 'goal', label: 'هدف', route: '/goals?create=1', icon: <AssignmentOutlined />, fields: [{ name: 'title', label: 'عنوان هدف', required: true }, { name: 'target', label: 'مقدار هدف', type: 'number' }, { name: 'dueDate', label: 'موعد', type: 'date' }] },
  { key: 'ticket', label: 'تیکت', route: '/tickets?create=1', icon: <SupportAgentOutlined />, fields: [{ name: 'title', label: 'عنوان تیکت', required: true }, { name: 'description', label: 'شرح', type: 'textarea' }] },
  { key: 'user', label: 'کاربر', route: '/users?create=1', icon: <GroupsOutlined />, fields: [{ name: 'name', label: 'نام کاربر', required: true }, { name: 'email', label: 'ایمیل' }, { name: 'title', label: 'سمت' }] },
  { key: 'event', label: 'رویداد', route: '/project-events?create=1', icon: <EventOutlined />, fields: [{ name: 'title', label: 'عنوان رویداد', required: true }, { name: 'date', label: 'تاریخ', type: 'date' }, { name: 'description', label: 'شرح', type: 'textarea' }] },
];

export default function QuickCreateMenu() {
  const navigate = useNavigate(); const [anchor, setAnchor] = useState<HTMLElement | null>(null); const [selected, setSelected] = useState<Item | null>(null); const [saved, setSaved] = useState(false);
  const openItem = (item: Item) => {
    setAnchor(null);
    // Core entities already expose richer, relationship-aware forms on their pages.
    if (['customer', 'project', 'task', 'ticket'].includes(item.key)) { navigate(item.route); return; }
    setSelected(item);
  };
  return <><Button variant="contained" startIcon={<Add />} onClick={(event) => setAnchor(event.currentTarget)}>ایجاد سریع</Button><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)' } } }}>{items.map((item) => <MenuItem key={item.key} onClick={() => openItem(item)} sx={{ whiteSpace: 'normal' }}><ListItemIcon>{item.icon}</ListItemIcon>{item.label}</MenuItem>)}</Menu>{selected && <EntityFormDialog open title={`ایجاد ${selected.label}`} fields={selected.fields} onClose={() => setSelected(null)} onSubmit={() => { setSelected(null); setSaved(true); navigate(selected.route); }} submitLabel="ایجاد" />}<Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)}><Alert severity="success">مورد جدید ایجاد شد و در فهرست مربوطه قابل مشاهده است.</Alert></Snackbar></>;
}
