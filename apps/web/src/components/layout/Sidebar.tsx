import {
  AccountBalanceWalletOutlined,
  AssessmentOutlined,
  AssignmentOutlined,
  BadgeOutlined,
  CalendarMonthOutlined,
  ConfirmationNumberOutlined,
  DashboardOutlined,
  DevicesOutlined,
  EventAvailableOutlined,
  ExpandLess,
  ExpandMore,
  FolderOutlined,
  GroupsOutlined,
  HandshakeOutlined,
  DescriptionOutlined,
  PaidOutlined,
  BusinessCenterOutlined,
  Inventory2Outlined,
  ManageAccountsOutlined,
  MonitorHeartOutlined,
  NotificationsNoneOutlined,
  PeopleOutlined,
  ReceiptLongOutlined,
  RequestQuoteOutlined,
  SettingsOutlined,
  TimelineOutlined,
  TodayOutlined,
  WidgetsOutlined,
  WorkHistoryOutlined,
  SyncOutlined,
  ForumOutlined,
} from '@mui/icons-material';
import { Badge, Box, Collapse, Divider, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { conversations } from '../../mock/data.ts';

const drawerWidth = 280;
type NavItem = { to: string; label: string; icon: React.ReactNode; children?: NavItem[] };
type NavGroup = { key: string; label: string; icon: React.ReactNode; children: NavItem[] };

const groups: NavGroup[] = [
  { key: 'reminders', label: 'یادآورها', icon: <NotificationsNoneOutlined />, children: [{ to: '/reminders', label: 'یادآورهای من', icon: <TodayOutlined /> }, { to: '/reminders?view=today', label: 'امروز', icon: <TodayOutlined /> }, { to: '/reminders?view=upcoming', label: 'آینده', icon: <TimelineOutlined /> }] },
  { key: 'chat', label: 'گفتگوها', icon: <ForumOutlined />, children: [{ to: '/chat', label: 'گفتگوهای داخلی', icon: <ForumOutlined /> }] },
  { key: 'sales', label: 'امور فروش', icon: <PeopleOutlined />, children: [{ to: '/leads', label: 'مشتریان احتمالی', icon: <PeopleOutlined /> }, { to: '/customers', label: 'مشتریان', icon: <GroupsOutlined /> }, { to: '/documents?section=customers', label: 'دبیرخانه مشتریان', icon: <DescriptionOutlined /> }, { to: '/resales', label: 'فروش مجدد', icon: <RequestQuoteOutlined /> }, { to: '/proposals', label: 'پیشنهادات', icon: <RequestQuoteOutlined /> }] },
  { key: 'finance', label: 'امور مالی', icon: <AccountBalanceWalletOutlined />, children: [
    { to: '/finance', label: 'داشبورد مالی', icon: <DashboardOutlined /> },
    { to: '/sales', label: 'فروش و دریافت', icon: <PaidOutlined />, children: [{ to: '/invoices?view=proforma', label: 'پیش‌فاکتورها', icon: <RequestQuoteOutlined /> }, { to: '/invoices', label: 'فاکتورها', icon: <ReceiptLongOutlined /> }, { to: '/payments', label: 'پرداخت‌ها', icon: <AccountBalanceWalletOutlined /> }, { to: '/finance/receivables', label: 'مطالبات', icon: <TimelineOutlined /> }, { to: '/installments', label: 'اقساط', icon: <ReceiptLongOutlined /> }] },
    { to: '/products', label: 'کالا و خدمات', icon: <Inventory2Outlined /> },
    { to: '/finance/suppliers', label: 'طرف حساب‌ها', icon: <GroupsOutlined />, children: [{ to: '/finance/suppliers', label: 'تأمین‌کنندگان', icon: <BusinessCenterOutlined /> }] },
    { to: '/finance/expenses', label: 'هزینه‌ها', icon: <ReceiptLongOutlined /> },
    { to: '/contracts', label: 'قراردادها', icon: <HandshakeOutlined /> },
    { to: '/finance/bank-accounts', label: 'حساب‌های بانکی', icon: <AccountBalanceWalletOutlined /> },
    { to: '/finance/reports', label: 'گزارش‌های مالی', icon: <AssessmentOutlined /> },
    { to: '/finance/hesabfa', label: 'یکپارچه‌سازی حسابفا', icon: <SyncOutlined /> },
    { to: '/documents?section=finance', label: 'دبیرخانه مالی', icon: <DescriptionOutlined /> },
  ] },
  { key: 'work', label: 'مدیریت کار', icon: <AssignmentOutlined />, children: [{ to: '/projects', label: 'پروژه‌ها', icon: <FolderOutlined /> }, { to: '/documents?section=projects', label: 'دبیرخانه پروژه‌ها', icon: <DescriptionOutlined /> }, { to: '/project-events', label: 'رویدادهای پروژه', icon: <TimelineOutlined /> }, { to: '/tasks', label: 'وظایف', icon: <AssignmentOutlined /> }, { to: '/tasks/labels', label: 'لیبل‌های وظایف', icon: <WidgetsOutlined /> }, { to: '/calendar', label: 'تقویم', icon: <CalendarMonthOutlined /> }, { to: '/goals', label: 'اهداف', icon: <TimelineOutlined /> }, { to: '/timesheets', label: 'ثبت ساعات کاری', icon: <TodayOutlined /> }, { to: '/knowledge', label: 'پایگاه دانش', icon: <WidgetsOutlined /> }] },
  { key: 'hr', label: 'منابع انسانی', icon: <BadgeOutlined />, children: [{ to: '/hr', label: 'نمای کلی', icon: <BadgeOutlined /> }, { to: '/hr/employees', label: 'کارکنان', icon: <GroupsOutlined /> }, { to: '/documents?section=hr', label: 'دبیرخانه منابع انسانی', icon: <DescriptionOutlined /> }, { to: '/hr/attendance', label: 'حضور و غیاب', icon: <TodayOutlined /> }, { to: '/hr/leaves', label: 'مرخصی‌ها', icon: <EventAvailableOutlined /> }, { to: '/hr/missions', label: 'ماموریت‌ها', icon: <WorkHistoryOutlined /> }, { to: '/hr/performance', label: 'ارزیابی عملکرد', icon: <AssessmentOutlined /> }, { to: '/hr/points', label: 'امتیاز عملکرد', icon: <TimelineOutlined /> }, { to: '/hr/documents', label: 'اسناد پرسنلی', icon: <DescriptionOutlined /> }, { to: '/hr/payroll', label: 'حقوق و مزایا', icon: <PaidOutlined /> }, { to: '/hr/recruitment', label: 'استخدام', icon: <BusinessCenterOutlined /> }] },
  { key: 'support', label: 'پشتیبانی', icon: <ConfirmationNumberOutlined />, children: [{ to: '/tickets', label: 'تیکت‌ها', icon: <ConfirmationNumberOutlined /> }] },
  { key: 'monitoring', label: 'مانیتورینگ', icon: <MonitorHeartOutlined />, children: [{ to: '/users', label: 'افراد', icon: <GroupsOutlined /> }, { to: '/devices', label: 'دستگاه‌ها', icon: <DevicesOutlined /> }, { to: '/monitoring', label: 'وضعیت لحظه‌ای', icon: <MonitorHeartOutlined /> }, { to: '/activities', label: 'فعالیت‌ها', icon: <TimelineOutlined /> }, { to: '/monitoring?view=sessions', label: 'جلسات', icon: <ManageAccountsOutlined /> }] },
  { key: 'reports', label: 'گزارش‌ها', icon: <AssessmentOutlined />, children: [{ to: '/reports?view=sales', label: 'فروش', icon: <AssessmentOutlined /> }, { to: '/reports?view=profit', label: 'هزینه‌ها در مقایسه با درآمد', icon: <AssessmentOutlined /> }, { to: '/reports?view=leads', label: 'مشتریان احتمالی', icon: <AssessmentOutlined /> }, { to: '/reports?view=timesheets', label: 'ثبت ساعات کاری', icon: <AssessmentOutlined /> }, { to: '/reports?view=knowledge', label: 'مقالات پایگاه دانش', icon: <AssessmentOutlined /> }, { to: '/reports?view=contacts', label: 'گزارش تماس‌ها', icon: <AssessmentOutlined /> }] },
  { key: 'tools', label: 'ابزارها', icon: <WidgetsOutlined />, children: [{ to: '/media', label: 'رسانه', icon: <WidgetsOutlined /> }, { to: '/documents', label: 'دبیرخانه و اسناد', icon: <DescriptionOutlined /> }, { to: '/exports', label: 'برون‌بری گروهی PDF', icon: <WidgetsOutlined /> }, { to: '/announcements', label: 'اطلاعیه‌ها', icon: <NotificationsNoneOutlined /> }] },
];

function routeMatches(target: string, pathname: string, search: string) {
  const [targetPath, targetQuery = ''] = target.split('?');
  if (targetPath !== pathname) return false;
  const targetParams = new URLSearchParams(targetQuery);
  const currentParams = new URLSearchParams(search);
  if (targetParams.size === 0) return currentParams.size === 0;
  for (const [key, value] of targetParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}
function itemMatches(item: NavItem, pathname: string, search: string): boolean {
  return routeMatches(item.to, pathname, search) || Boolean(item.children?.some((child) => itemMatches(child, pathname, search)));
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeGroup = useMemo(() => groups.find((group) => group.children.some((item) => itemMatches(item, location.pathname, location.search)))?.key, [location.pathname, location.search]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string, isOpen: boolean, parentKey?: string) => setExpanded((current) => {
    if (isOpen) return { ...current, [key]: false };
    const next: Record<string, boolean> = {};
    if (parentKey) next[parentKey] = true;
    next[key] = true;
    return next;
  });
  const [chatUnread, setChatUnread] = useState(() => {
    try { const saved = localStorage.getItem('trileez-chat-state-v1'); return saved ? (JSON.parse(saved).conversations ?? []).reduce((sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount ?? 0), 0) : conversations.reduce((sum, c) => sum + c.unreadCount, 0); } catch { return conversations.reduce((sum, c) => sum + c.unreadCount, 0); }
  });
  useEffect(() => {
    const refresh = () => { try { const saved = localStorage.getItem('trileez-chat-state-v1'); setChatUnread(saved ? (JSON.parse(saved).conversations ?? []).reduce((sum: number, c: { unreadCount?: number }) => sum + (c.unreadCount ?? 0), 0) : 0); } catch { setChatUnread(0); } };
    window.addEventListener('trileez-chat-updated', refresh);
    return () => window.removeEventListener('trileez-chat-updated', refresh);
  }, []);

  const go = (to: string) => { navigate(to); onClose(); };
  const content = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.5, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>ت</Box>
        <Box><Typography sx={{ fontWeight: 800, lineHeight: 1.2 }}>تری‌لیز</Typography><Typography variant="caption" color="text.secondary">پلتفرم سازمانی</Typography></Box>
      </Box>
      <Divider />
      <List sx={{ px: 1, py: 1.5, flex: 1, overflowY: 'auto', direction: 'rtl' }}>
        <ListItemButton selected={location.pathname === '/'} onClick={() => go('/')} sx={{ mb: .5, direction: 'rtl' }}>
          <ListItemIcon sx={{ minWidth: 38 }}><DashboardOutlined /></ListItemIcon><ListItemText primary="داشبورد" />
        </ListItemButton>
        {groups.map((group) => {
          const isActive = activeGroup === group.key;
          const isOpen = expanded[group.key] ?? isActive;
          return <Box key={group.key}>
            <ListItemButton selected={isActive} onClick={() => toggle(group.key, isOpen)} sx={{ mt: .5, direction: 'rtl', '& .MuiListItemIcon-root': { order: 0 }, '& .MuiListItemText-root': { order: 0, flex: 1 }, '& .MuiBadge-root': { order: -1, mx: 1 }, '& > .MuiSvgIcon-root': { order: 1 } }}>
              <ListItemIcon sx={{ minWidth: 38 }}>{group.icon}</ListItemIcon><ListItemText primary={group.label} secondary={group.key === 'chat' && chatUnread > 0 ? `${chatUnread.toLocaleString('fa-IR')} پیام خوانده‌نشده` : undefined} sx={{ '& .MuiListItemText-primary': { fontWeight: isActive ? 800 : 600 } }} />{group.key === 'chat' && chatUnread > 0 && <Badge badgeContent={chatUnread} color="error" sx={{ mx: 1 }} />}{isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </ListItemButton>
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding sx={{ borderRight: '1px solid', borderColor: 'divider', mr: 2.5, pr: .5 }}>
                {group.children.map((item) => {
                  const selected = routeMatches(item.to, location.pathname, location.search);
                  const hasChildren = Boolean(item.children?.length);
                  const open = expanded[item.to] ?? itemMatches(item, location.pathname, location.search);
                  return <Box key={item.to}>
                    <ListItemButton selected={selected} onClick={() => hasChildren ? toggle(item.to, open, group.key) : go(item.to)} sx={{ py: .7, minHeight: 38, mr: hasChildren ? 0 : .5, direction: 'rtl' }}><ListItemIcon sx={{ minWidth: 32, '& svg': { fontSize: 18 } }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} sx={{ '& .MuiListItemText-primary': { fontSize: '0.8rem', fontWeight: selected ? 800 : hasChildren ? 700 : 500 } }} />{hasChildren ? (open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />) : null}</ListItemButton>
                    {hasChildren && <Collapse in={open} timeout="auto" unmountOnExit><List component="div" disablePadding sx={{ mr: 2, pr: .5, direction: 'rtl' }}>{item.children?.map((child) => <ListItemButton key={child.to} selected={routeMatches(child.to, location.pathname, location.search)} onClick={() => go(child.to)} sx={{ py: .55, minHeight: 34, direction: 'rtl' }}><ListItemIcon sx={{ minWidth: 28, '& svg': { fontSize: 16 } }}>{child.icon}</ListItemIcon><ListItemText primary={child.label} sx={{ '& .MuiListItemText-primary': { fontSize: '0.74rem' } }} /></ListItemButton>)}</List></Collapse>}
                  </Box>;
                })}
              </List>
            </Collapse>
          </Box>;
        })}
        <Divider sx={{ my: 1.5 }} />
        <ListItemButton selected={location.pathname === '/settings'} onClick={() => go('/settings')} sx={{ direction: 'rtl' }}><ListItemIcon sx={{ minWidth: 38 }}><SettingsOutlined /></ListItemIcon><ListItemText primary="تنظیمات" /></ListItemButton>
      </List>
    </Box>
  );

  return <><Drawer anchor="right" variant="temporary" open={mobileOpen} onClose={onClose} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, maxWidth: '86vw', boxSizing: 'border-box' } }}>{content}</Drawer><Drawer anchor="right" variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, height: '100%', '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', position: 'relative', height: '100%' } }}>{content}</Drawer></>;
}

export { drawerWidth };
