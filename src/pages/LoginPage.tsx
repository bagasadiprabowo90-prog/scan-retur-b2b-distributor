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
    <div className="min-h-screen bg-[#F4F3EE] flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#16C784] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_4px_0_#0B0E14] rounded-2xl mb-3">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M7 12h10" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-[#0B0E14] uppercase tracking-tight">
            SCAN RETUR B2B
          </h1>
          <p className="font-mono text-xs text-gray-600 mt-1 font-bold uppercase tracking-wider">
            WAREHOUSE UTILITY • BLP BEAUTY
          </p>
        </div>

        {/* Session Expired Alert */}
        {isSessionExpired && !error && (
          <div className="mb-4 rounded-2xl px-3.5 py-2.5 font-mono text-xs font-bold bg-[#FEF0C7] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_3px_0_#0B0E14] text-center">
            ⚠️ SESI BERAKHIR. SILAKAN LOGIN KEMBALI.
          </div>
        )}

        {/* Login Card */}
        <div className="card p-6 space-y-5 text-center">
          <div className="pb-2 border-b-2 border-[#0B0E14] flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#0B0E14] uppercase">
              OTENTIKASI OPERATOR
            </span>
            <span className="bg-[#0B0E14] text-[#FDE047] font-mono text-[10px] font-bold px-2 py-0.5 rounded">
              JKT-WH
            </span>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="rounded-xl px-3.5 py-2.5 font-mono text-xs font-bold bg-red-100 text-red-900 border-2 border-[#0B0E14] text-left leading-relaxed">
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 font-mono text-xs font-bold text-[#0B0E14] py-2">
              <div className="h-4 w-4 border-2 border-[#0B0E14] border-t-transparent rounded-full animate-spin" />
              <span>MEMVERIFIKASI AKUN...</span>
            </div>
          )}

          {/* Google Sign In Area */}
          {googleClientId ? (
            <div className="flex justify-center min-h-[44px]">
              <div ref={googleBtnRef} />
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <div className="p-3 bg-[#FEF0C7] border-2 border-[#0B0E14] rounded-xl font-mono text-[11px] text-[#0B0E14] leading-relaxed">
                <p className="font-bold mb-1">⚙️ SETUP GOOGLE SIGN-IN</p>
                <p>
                  Tambahkan <code className="bg-white border border-[#0B0E14] px-1 py-0.5 rounded font-mono text-[10px]">VITE_GOOGLE_CLIENT_ID</code> di file <code className="bg-white border border-[#0B0E14] px-1 py-0.5 rounded font-mono text-[10px]">.env</code> untuk tombol Google resmi.
                </p>
              </div>

              {/* Dev Quick Test Area */}
              <div className="pt-2 border-t-2 border-[#0B0E14] space-y-3">
                <p className="font-mono text-xs font-bold text-[#0B0E14] uppercase">
                  PILIH OPERATOR (DEV MODE):
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {["bagas", "dimas", "nur", "irwan"].map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDevLogin(`${name}@${REQUIRED_DOMAIN}`)}
                      className="px-3 py-2 font-mono text-xs font-bold rounded-xl bg-[#F4F3EE] hover:bg-[#FEF0C7] text-[#0B0E14] border-2 border-[#0B0E14] shadow-[0_2px_0_#0B0E14] active:translate-y-[1px] active:shadow-none transition-all uppercase text-left flex items-center justify-between"
                    >
                      <span>{name}</span>
                      <span className="text-[10px] text-gray-500">→</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <input
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={`email@${REQUIRED_DOMAIN}`}
                    className="input-field font-mono text-xs mb-2"
                  />
                  <button
                    type="button"
                    disabled={loading || !devEmail}
                    onClick={() => handleDevLogin(devEmail)}
                    className="w-full btn-primary text-xs py-2.5 disabled:opacity-50"
                  >
                    MASUK DENGAN EMAIL →
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
