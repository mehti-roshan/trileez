import { Box } from '@mui/material';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header.tsx';
import Sidebar, { drawerWidth } from './Sidebar.tsx';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', direction: 'rtl', minHeight: '100vh', width: '100%', bgcolor: 'background.default' }}>
      <Box sx={{ width: { xs: 0, md: drawerWidth }, flexShrink: 0, position: { xs: 'static', md: 'sticky' }, top: 0, height: { xs: 'auto', md: '100vh' }, alignSelf: { md: 'flex-start' }, zIndex: 1200 }}>
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </Box>
      <Box sx={{ flex: '1 1 auto', minWidth: 0, width: 'auto', maxWidth: '100%', display: 'flex', flexDirection: 'column', direction: 'rtl', overflowX: 'hidden' }}>
        <Header onMenu={() => setMobileOpen(true)} />
        <Box component="main" sx={{ p: { xs: 1.5, sm: 2.5, md: 3.5 }, flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', '& > *': { minWidth: 0 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
