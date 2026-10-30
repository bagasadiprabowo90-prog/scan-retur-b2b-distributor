import { useEffect, useRef, useState } from "react";
import { useAuth, REQUIRED_DOMAIN } from "../lib/auth";

export default function LoginPage() {
  const { loginWithGoogle, loginDevMock, isSessionExpired } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    let checkTimer: ReturnType<typeof setInterval> | null = null;

    function renderGoogleButton() {
      if (!googleClientId || !googleBtnRef.current) return false;
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response) => {
              setLoading(true);
              setError("");
              try {
                const err = await loginWithGoogle(response.credential);
                if (err) setError(err);
              } catch {
                setError("Terjadi kesalahan saat memverifikasi akun Google");
              } finally {
                setLoading(false);
              }
            },
            hosted_domain: REQUIRED_DOMAIN,
            cancel_on_tap_outside: true,
          });

          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: "standard",
            theme: "filled_black",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: 280,
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    if (googleClientId) {
      const rendered = renderGoogleButton();
      if (!rendered) {
        checkTimer = setInterval(() => {
          if (renderGoogleButton() && checkTimer) {
            clearInterval(checkTimer);
          }
        }, 500);
      }
    }

    return () => {
      if (checkTimer) clearInterval(checkTimer);
    };
  }, [googleClientId, loginWithGoogle]);

  async function handleDevLogin(userOrEmail: string) {
    setError("");
    setLoading(true);
    try {
      const err = await loginDevMock(userOrEmail);
      if (err) setError(err);
    } catch {
      setError("Gagal melakukan login pengujian");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen max-w-[430px] mx-auto flex items-center justify-center px-5">
      <div className="w-full">
        {/* Logo & Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#1C1917] text-white shadow-md rounded-2xl mb-3">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
            </svg>
          </div>
          <h1 className="text-xl font-extrabold text-stone-900 tracking-tight">
            Scan Retur B2B
          </h1>
          <p className="text-xs text-stone-500 mt-0.5 font-semibold">
            BLP Beauty
          </p>
        </div>

        {/* Session Expired Alert */}
        {isSessionExpired && !error && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-xs font-semibold bg-amber-50/90 text-amber-900 border border-amber-200/80 text-center">
            Sesi Anda telah berakhir. Silakan login kembali.
          </div>
        )}

        {/* Login Card */}
        <div className="card p-5 space-y-4 text-center">
          {/* Error Alert */}
          {error && (
            <div className="rounded-xl px-3.5 py-2.5 text-xs font-semibold bg-red-50/90 text-red-900 border border-red-200 text-left leading-relaxed">
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-stone-800 py-2">
              <div className="h-4 w-4 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" />
              <span>Memverifikasi akun...</span>
            </div>
          )}

          {/* Google Sign In Area */}
          {googleClientId ? (
            <div className="flex justify-center min-h-[44px]">
              <div ref={googleBtnRef} />
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <div className="p-3 bg-white/70 border border-white/90 rounded-xl text-[11px] text-stone-700 leading-relaxed">
                <p className="font-bold text-stone-900 mb-1">Setup Google Sign-In</p>
                <p>
                  Tambahkan <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_GOOGLE_CLIENT_ID</code> di file <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-[10px]">.env</code> untuk tombol Google resmi.
                </p>
              </div>

              {/* Dev Quick Test Area */}
              <div className="pt-2 border-t border-stone-200/70 space-y-3">
                <p className="text-xs font-bold text-stone-800">
                  Pilih Akun (Dev Mode):
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {["bagas", "dimas", "nur", "irwan"].map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDevLogin(`${name}@${REQUIRED_DOMAIN}`)}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/80 hover:bg-white text-stone-800 border border-white/90 shadow-2xs transition-all capitalize text-left flex items-center justify-between"
                    >
                      <span>{name}</span>
                      <span className="text-[10px] text-stone-400">→</span>
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <input
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={`email@${REQUIRED_DOMAIN}`}
                    className="input-field text-xs mb-2"
                  />
                  <button
                    type="button"
                    disabled={loading || !devEmail}
                    onClick={() => handleDevLogin(devEmail)}
                    className="w-full btn-primary text-xs py-3 disabled:opacity-50"
                  >
                    Masuk dengan Email
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
