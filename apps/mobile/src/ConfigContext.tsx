import { createContext, useContext } from 'react';

export interface AppConfig {
  apiUrl: string;
  tenantId: string;
  apiToken: string;
  enableNfc: boolean;
  requireNfc: boolean;
  requireFaceMatch: boolean;
  minFaceMatchScore: number;
}

const ConfigContext = createContext<AppConfig | null>(null);

export const ConfigProvider = ConfigContext.Provider;

export function useAppConfig(): AppConfig {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within ConfigProvider');
  return ctx;
}
