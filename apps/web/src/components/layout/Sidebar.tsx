import {
  AssignmentOutlined,
  CalendarMonthOutlined,
  ConfirmationNumberOutlined,
  DashboardOutlined,
  DevicesOutlined,
  FolderOutlined,
  GroupsOutlined,
  MonitorHeartOutlined,
  PeopleOutlined,
  SettingsOutlined,
  AssessmentOutlined,
  ReceiptLongOutlined,
  RequestQuoteOutlined,
  AccountBalanceWalletOutlined,
  Inventory2Outlined,
  HandshakeOutlined,
  ContactPageOutlined,
} from '@mui/icons-material';
import { Box, Divider, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

const drawerWidth = 260;

const items = [
  { to: '/', label: 'داشبورد', icon: <DashboardOutlined /> },
  { to: '/tasks', label: 'کارها', icon: <AssignmentOutlined /> },
  { to: '/projects', label: 'پروژه‌ها', icon: <FolderOutlined /> },
  { to: '/customers', label: 'مشتریان', icon: <PeopleOutlined /> },
  { to: '/leads', label: 'مشتریان احتمالی', icon: <ContactPageOutlined /> },
  { to: '/sales', label: 'فروش و مالی', icon: <AccountBalanceWalletOutlined /> },
  { to: '/proposals', label: 'پیشنهادها', icon: <RequestQuoteOutlined /> },
  { to: '/invoices', label: 'فاکتورها', icon: <ReceiptLongOutlined /> },
  { to: '/payments', label: 'پرداخت‌ها', icon: <AccountBalanceWalletOutlined /> },
  { to: '/products', label: 'محصولات', icon: <Inventory2Outlined /> },
  { to: '/contracts', label: 'قراردادها', icon: <HandshakeOutlined /> },
  { to: '/installments', label: 'اقساط', icon: <ReceiptLongOutlined /> },
  { to: '/tickets', label: 'تیکت‌ها', icon: <ConfirmationNumberOutlined /> },
  { to: '/calendar', label: 'تقویم', icon: <CalendarMonthOutlined /> },
  { to: '/reports', label: 'گزارش‌ها', icon: <AssessmentOutlined /> },
  { to: '/monitoring', label: 'مانیتورینگ', icon: <MonitorHeartOutlined /> },
  { to: '/users', label: 'کاربران', icon: <GroupsOutlined /> },
  { to: '/devices', label: 'دستگاه‌ها', icon: <DevicesOutlined /> },
  { to: '/settings', label: 'تنظیمات', icon: <SettingsOutlined /> },
];

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const content = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.5, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: 'primary.main',
            color: 'white',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
          }}
        >
          ت
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.2 }}>تری‌لیز</Typography>
          <Typography variant="caption" color="text.secondary">
            پلتفرم سازمانی
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ px: 0.5, py: 1.5, flex: 1 }}>
        {items.map((item) => {
          const selected = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <ListItemButton
              key={item.to}
              selected={selected}
              onClick={() => {
                navigate(item.to);
                onClose();
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: drawerWidth },
        }}
      >
        {content}
      </Drawer>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', position: 'relative' },
        }}
      >
        {content}
      </Drawer>
    </>
  );
}

export { drawerWidth };
