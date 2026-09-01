/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { organizations } from '../mock/data.ts';
import { getCurrentUser } from '../services/session.ts';
import type { Organization, User } from '../types/index.ts';

interface AppContextValue {
  user: User;
  organization: Organization;
  organizations: Organization[];
  setOrganizationId: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [organizationId, setOrganizationId] = useState(organizations[0].id);

  const value = useMemo(() => {
    const organization = organizations.find((item) => item.id === organizationId) ?? organizations[0];
    return {
      user: getCurrentUser(),
      organization,
      organizations,
      setOrganizationId,
    };
  }, [organizationId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
