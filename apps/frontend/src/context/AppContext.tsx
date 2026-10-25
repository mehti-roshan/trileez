/* eslint-disable react-refresh/only-export-components */
import { Alert, Box, Button, CircularProgress, Snackbar, Stack, Typography } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Organization, User } from '../types/index.ts';
import { ApiError, apiClient, hasApiToken, requiresPasswordChange, userMustChangePassword, type ApiUser } from '../services/apiClient.ts';
import LoginPage from '../components/auth/LoginPage.tsx';
import ChangePasswordPage from '../components/auth/ChangePasswordPage.tsx';
import { hydrateApiRepositories, resetApiRepositoryHydration } from '../services/apiRepository.ts';
import { subscribeApiFailures } from '../services/apiEvents.ts';
import { hydrateFiles } from '../services/fileService.ts';

interface AppContextValue {
  user: User;
  organization: Organization;
  organizations: Organization[];
  setOrganizationId: (id: string) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [passwordChange, setPasswordChange] = useState<{ user: ApiUser; currentPassword?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [operationError, setOperationError] = useState('');

  const enterWorkspace = async (sessionUser: ApiUser) => {
    resetApiRepositoryHydration();
    await Promise.all([hydrateApiRepositories(), hydrateFiles()]);
    setPasswordChange(null);
    setBootError('');
    setUser(sessionUser);
  };

  const bootstrap = async () => {
    if (!hasApiToken()) { setUser(null); setPasswordChange(null); setLoading(false); return; }
    setLoading(true);
    setBootError('');
    let sessionUser: ApiUser | undefined;
    try {
      const result = await apiClient.me();
      sessionUser = result.user;
      if (userMustChangePassword(result.user)) {
        setPasswordChange({ user: result.user });
        setUser(null);
        return;
      }
      await enterWorkspace(result.user);
    } catch (error) {
      resetApiRepositoryHydration();
      if (error instanceof ApiError && error.status === 401) {
        await apiClient.logout().catch(() => undefined);
        setPasswordChange(null);
        setUser(null);
      } else if (requiresPasswordChange(error) && sessionUser) {
        setPasswordChange({ user: sessionUser });
        setUser(null);
      } else {
        setBootError(error instanceof Error ? error.message : 'دریافت اطلاعات از سرور ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => subscribeApiFailures((event) => setOperationError(event.message)), []);

  const login = async (email: string, password: string) => {
    const result = await apiClient.login(email, password);
    if (userMustChangePassword(result.user)) {
      setPasswordChange({ user: result.user, currentPassword: password });
      setUser(null);
      return;
    }
    try {
      await enterWorkspace(result.user);
    } catch (error) {
      resetApiRepositoryHydration();
      if (requiresPasswordChange(error)) {
        setPasswordChange({ user: result.user, currentPassword: password });
        setUser(null);
        return;
      }
      await apiClient.logout().catch(() => undefined);
      throw error;
    }
  };

  const submitPasswordChange = async (currentPassword: string, newPassword: string) => {
    const result = await apiClient.changePassword(currentPassword, newPassword);
    await enterWorkspace(result.user);
  };

  const logout = () => {
    void apiClient.logout().catch(() => undefined);
    resetApiRepositoryHydration();
    setPasswordChange(null);
    setUser(null);
    setBootError('');
  };

  const value = useMemo(() => {
    const organization: Organization = {
      id: user?.organizationId ?? 'workspace',
      name: user?.organizationName ?? 'فضای کاری سازمان',
      slug: user?.organizationId ?? 'workspace',
    };
    return {
      user: user!,
      organization,
      organizations: [organization],
      setOrganizationId: () => undefined,
      logout,
    };
  }, [user]);

  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (bootError) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, direction: 'rtl' }}><Stack spacing={2} sx={{ maxWidth: 560, textAlign: 'center' }}><Typography variant="h5" sx={{ fontWeight: 900 }}>ارتباط با داده‌های سامانه برقرار نشد</Typography><Alert severity="error">{bootError}</Alert><Typography color="text.secondary">داده نمایشی جایگزین نشده است. برای ادامه باید API و MongoDB در دسترس باشند.</Typography><Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}><Button variant="contained" onClick={() => void bootstrap()}>تلاش دوباره</Button><Button color="inherit" onClick={logout}>خروج</Button></Stack></Stack></Box>;
  if (passwordChange) return <ChangePasswordPage email={passwordChange.user.email} initialCurrentPassword={passwordChange.currentPassword} onSubmit={submitPasswordChange} onCancel={logout} />;
  if (!user) return <LoginPage onLogin={login} />;

  return <AppContext.Provider value={value}>{children}<Snackbar open={Boolean(operationError)} autoHideDuration={6000} onClose={() => setOperationError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}><Alert severity="error" variant="filled" onClose={() => setOperationError('')}>{operationError}</Alert></Snackbar></AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
