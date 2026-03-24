export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'COMPLIANCE_OFFICER'
  | 'TRADE_MANAGER'
  | 'OPERATIONS'
  | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  agentId?: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ requiresTOTP: boolean }>;
  loginWithTOTP: (email: string, password: string, totpCode: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, user: AuthUser) => void;
}
