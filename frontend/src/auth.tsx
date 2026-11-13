import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, getTokens, post, setTokens, User } from './api';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getTokens()) return setReady(true);
    api<{ user: User }>('/auth/me').then((d) => setUser(d.user)).catch(() => setTokens(null)).finally(() => setReady(true));
  }, []);

  const finish = (d: { user: User; accessToken: string; refreshToken: string }) => {
    setTokens({ accessToken: d.accessToken, refreshToken: d.refreshToken });
    setUser(d.user);
  };

  return (
    <Ctx.Provider value={{
      user, ready,
      login: async (email, password) => finish(await post('/auth/login', { email, password })),
      register: async (name, email, password) => finish(await post('/auth/register', { name, email, password })),
      logout: async () => {
        const t = getTokens();
        if (t) await post('/auth/logout', { refreshToken: t.refreshToken }).catch(() => undefined);
        setTokens(null);
        setUser(null);
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}
