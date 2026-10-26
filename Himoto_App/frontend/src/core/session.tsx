import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { apiGet, onSessionExpired, restoreTokens, signIn, signOut, type User } from './api';

type Session = { ready: boolean; user: User | null; login(email: string, password: string): Promise<void>; logout(): Promise<void> };
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = onSessionExpired(() => { if (active) setUser(null); });
    void (async () => {
      try { if (await restoreTokens()) { const current = await apiGet<User>('/me'); if (active) setUser(current); } }
      catch { /* Sign-in screen handles an expired or unreachable session. */ }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; unsubscribe(); };
  }, []);
  return <Context.Provider value={{ ready, user,
    login: async (email, password) => setUser(await signIn(email, password)),
    logout: async () => { await signOut(); setUser(null); },
  }}>{children}</Context.Provider>;
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider is missing.');
  return context;
}

export function can(user: User | null, permission: string) {
  return Boolean(user && (permission === 'vehicles.read' || user.access_role === 'admin' || user.permissions?.includes(permission)));
}
