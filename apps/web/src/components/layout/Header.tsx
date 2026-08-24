import { KeyboardArrowDown, Menu as MenuIcon, NotificationsNoneOutlined, Search } from '@mui/icons-material';
import {
  AppBar,
  Badge,
  Box,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { notifications } from '../../mock/data.ts';
import { formatRelative } from '../../utils/format.ts';
import { useApp } from '../../context/AppContext.tsx';
import UserAvatar from '../common/UserAvatar.tsx';

export default function Header({ onMenu }: { onMenu: () => void }) {
  const { user, organization, organizations, setOrganizationId } = useApp();
  const [orgAnchor, setOrgAnchor] = useState<null | HTMLElement>(null);
  const [noteAnchor, setNoteAnchor] = useState<null | HTMLElement>(null);
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <AppBar position="sticky" color="inherit" elevation={0}>
      <Toolbar sx={{ gap: 2, minHeight: 72 }}>
        <IconButton onClick={onMenu} sx={{ display: { md: 'none' } }}>
          <MenuIcon />
        </IconButton>
        <Box
          onClick={(event) => setOrgAnchor(event.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.75,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            cursor: 'pointer',
            minWidth: 180,
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              فضای کاری
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {organization.name}
            </Typography>
          </Box>
          <KeyboardArrowDown fontSize="small" />
        </Box>
        <TextField
          placeholder="جستجو در کارها، پروژه‌ها و دستگاه‌ها"
          sx={{ flex: 1, maxWidth: 520, display: { xs: 'none', sm: 'block' } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={(event) => setNoteAnchor(event.currentTarget)}>
            <Badge color="error" badgeContent={unread}>
              <NotificationsNoneOutlined />
            </Badge>
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <UserAvatar user={user} />
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user.title}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Toolbar>
      <Menu anchorEl={orgAnchor} open={Boolean(orgAnchor)} onClose={() => setOrgAnchor(null)}>
        {organizations.map((item) => (
          <MenuItem
            key={item.id}
            selected={item.id === organization.id}
            onClick={() => {
              setOrganizationId(item.id);
              setOrgAnchor(null);
            }}
          >
            {item.name}
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={noteAnchor} open={Boolean(noteAnchor)} onClose={() => setNoteAnchor(null)} slotProps={{ paper: { sx: { width: 320 } } }}>
        {notifications.map((item) => (
          <MenuItem key={item.id} sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: item.read ? 500 : 700 }}>
                {item.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.body}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {formatRelative(item.createdAt)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </AppBar>
  );
}
