import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { verifyUserWithBackend } from "./api";

export type AppUser = {
  username: string; // misal "bagas"
  displayName: string; // misal "Bagas Adi"
  email: string; // misal "bagas@blpbeauty.com"
  picture?: string; // foto profil Google
  role?: string;
};

export interface AuthSession {
  user: AppUser;
  loginAt: number;
  expiresAt: number;
  sessionToken: string;
}

type AuthContextType = {
  user: AppUser | null;
  session: AuthSession | null;
  loginWithGoogle: (credential: string) => Promise<string | null>;
  loginDevMock: (usernameOrEmail: string) => Promise<string | null>;
  logout: () => void;
  isSessionExpired: boolean;
};

export const REQUIRED_DOMAIN = "blpbeauty.com";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam (1 shift kerja)
export const STORAGE_KEY = "scan-retur-auth-session-v2";
const LEGACY_STORAGE_KEY = "scan-retur-auth-user";

export interface GoogleJwtPayload {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string; // Hosted Domain di Google Workspace (harus blpbeauty.com)
  sub?: string;
  exp?: number;
}

/**
 * Decode JWT token dari Google Identity Services tanpa library eksternal
 */
export function parseGoogleJwt(token: string): GoogleJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload) as GoogleJwtPayload;
  } catch {
    return null;
  }
}

function createSessionToken(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function loadValidSession(): AuthSession | null {
  try {
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AuthSession;
    if (
      parsed &&
      parsed.user &&
      parsed.user.email &&
      parsed.user.displayName &&
      typeof parsed.expiresAt === "number"
    ) {
      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

export function saveSession(session: AuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {}
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadValidSession);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  // Sync session across tabs & check periodic expiration
  useEffect(() => {
    function checkExpiration() {
      const current = loadValidSession();
      if (!current && session) {
        setSession(null);
        setIsSessionExpired(true);
      }
    }

    const interval = setInterval(checkExpiration, 30000); // 30 detik

    function onStorageChange(e: StorageEvent) {
      if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
        setSession(loadValidSession());
      }
    }

    window.addEventListener("storage", onStorageChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", onStorageChange);
    };
  }, [session]);

  /**
   * Login resmi menggunakan Google Identity Services credential (JWT)
   */
  const loginWithGoogle = useCallback(
    async (credential: string): Promise<string | null> => {
      const payload = parseGoogleJwt(credential);
      if (!payload || !payload.email) {
        return "Gagal membaca token Google. Silakan coba lagi.";
      }

      const email = payload.email.trim().toLowerCase();
      const expectedDomain = `@${REQUIRED_DOMAIN.toLowerCase()}`;

      // 1. Kunci Domain Wajib @blpbeauty.com
      if (!email.endsWith(expectedDomain)) {
        return `Akses ditolak: Akun ${email} bukan email resmi @${REQUIRED_DOMAIN}. Gunakan email Google Workspace BLP Beauty Anda.`;
      }

      // 2. Verifikasi ke backend Google Sheets (Tab Users Whitelist)
      let officialName = payload.name || email.split("@")[0];
      let role = "User";

      try {
        const verifyRes = await verifyUserWithBackend(email, payload.name);
        if (!verifyRes.ok) {
          return verifyRes.error;
        }
        if (verifyRes.displayName) {
          officialName = verifyRes.displayName;
        }
        if (verifyRes.role) {
          role = verifyRes.role;
        }
      } catch (err: unknown) {
        // Jika backend offline/error jaringan sementara, tampilkan pesan informatif
        const msg = err instanceof Error ? err.message : "Gagal memverifikasi ke server";
        return `Gagal verifikasi sistem: ${msg}`;
      }

      const now = Date.now();
      const newSession: AuthSession = {
        user: {
          username: email.split("@")[0],
          displayName: officialName,
          email: email,
          picture: payload.picture,
          role: role,
        },
        loginAt: now,
        expiresAt: now + SESSION_TTL_MS,
        sessionToken: createSessionToken(),
      };

      setSession(newSession);
      saveSession(newSession);
      setIsSessionExpired(false);
      return null;
    },
    []
  );

  /**
   * Helper login simulasi untuk lingkungan development jika Google Client ID belum diset di .env
   */
  const loginDevMock = useCallback(
    async (usernameOrEmail: string): Promise<string | null> => {
      const raw = usernameOrEmail.trim().toLowerCase();
      if (!raw) return "Email atau username wajib diisi";

      const email = raw.includes("@") ? raw : `${raw}@${REQUIRED_DOMAIN}`;
      if (!email.endsWith(`@${REQUIRED_DOMAIN}`)) {
        return `Hanya email domain @${REQUIRED_DOMAIN} yang diizinkan`;
      }

      const defaultNames: Record<string, string> = {
        bagas: "Bagas",
        dimas: "Dimas",
        nur: "Nur",
        irwan: "Irwan",
      };

      const userPart = email.split("@")[0];
      const displayName = defaultNames[userPart] || userPart.charAt(0).toUpperCase() + userPart.slice(1);

      // Coba verifikasi dengan backend jika online
      try {
        const check = await verifyUserWithBackend(email, displayName);
        if (!check.ok) return check.error;
      } catch {}

      const now = Date.now();
      const newSession: AuthSession = {
        user: {
          username: userPart,
          displayName: displayName,
          email: email,
          role: "User",
        },
        loginAt: now,
        expiresAt: now + SESSION_TTL_MS,
        sessionToken: createSessionToken(),
      };

      setSession(newSession);
      saveSession(newSession);
      setIsSessionExpired(false);
      return null;
    },
    []
  );

  const logout = useCallback(() => {
    setSession(null);
    saveSession(null);
    setIsSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loginWithGoogle,
        loginDevMock,
        logout,
        isSessionExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
