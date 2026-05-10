import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AppUser = {
  username: string;
  displayName: string;
};

type AuthContextType = {
  user: AppUser | null;
  login: (username: string, password: string) => string | null;
  logout: () => void;
};

const USERS: { username: string; password: string; displayName: string }[] = [
  { username: "nur", password: "Blp123", displayName: "Nur" },
  { username: "dimas", password: "Blp123", displayName: "Dimas" },
  { username: "bagas", password: "Blp123", displayName: "Bagas" },
  { username: "irwan", password: "Blp123", displayName: "Irwan" },
];

const STORAGE_KEY = "scan-retur-auth-user";

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.username && parsed.displayName) return parsed as AppUser;
  } catch {}
  return null;
}

function saveUser(user: AppUser | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(loadUser);

  const login = useCallback((username: string, password: string): string | null => {
    const found = USERS.find(
      (u) => u.username === username.trim().toLowerCase()
    );
    if (!found) return "Username tidak ditemukan";
    if (found.password !== password) return "Password salah";
    const appUser: AppUser = { username: found.username, displayName: found.displayName };
    setUser(appUser);
    saveUser(appUser);
    return null;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    saveUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
