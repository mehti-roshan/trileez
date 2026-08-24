import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { faIR } from '@mui/material/locale';

const themeOptions: ThemeOptions = {
  direction: 'rtl',
  typography: {
    fontFamily: ['Vazirmatn', 'Tahoma', 'Arial', 'sans-serif'].join(','),
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
  },
  shape: { borderRadius: 12 },
  palette: {
    primary: { main: '#1E3A8A', light: '#3B82F6', dark: '#1E40AF', contrastText: '#FFFFFF' },
    secondary: { main: '#059669', light: '#10B981', dark: '#047857', contrastText: '#FFFFFF' },
    error: { main: '#DC2626', light: '#EF4444', dark: '#B91C1C' },
    warning: { main: '#D97706', light: '#F59E0B', dark: '#B45309' },
    info: { main: '#0891B2', light: '#06B6D4', dark: '#0E7490' },
    success: { main: '#059669', light: '#10B981', dark: '#047857' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text: { primary: '#1E293B', secondary: '#64748B' },
    divider: '#E2E8F0',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { direction: 'rtl' },
        body: { direction: 'rtl', fontFamily: 'Vazirmatn, Tahoma, Arial, sans-serif' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500, padding: '8px 16px' },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
          border: '1px solid #E2E8F0',
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiInputBase: { styleOverrides: { root: { fontSize: '0.875rem' } } },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '12px 16px', fontSize: '0.875rem' },
        head: { fontWeight: 600, backgroundColor: '#F8FAFC', color: '#475569' },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiDrawer: {
      styleOverrides: { paper: { borderLeft: '1px solid #E2E8F0', borderRight: 'none' } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
          borderBottom: '1px solid #E2E8F0',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 8px',
          '&.Mui-selected': {
            backgroundColor: '#EFF6FF',
            color: '#1E3A8A',
            '&:hover': { backgroundColor: '#DBEAFE' },
            '& .MuiListItemIcon-root': { color: '#1E3A8A' },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500, fontSize: '0.875rem', minHeight: 48 },
      },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12 } } },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
          border: '1px solid #E2E8F0',
        },
      },
    },
  },
};

const theme = createTheme(themeOptions, faIR);
export default theme;
