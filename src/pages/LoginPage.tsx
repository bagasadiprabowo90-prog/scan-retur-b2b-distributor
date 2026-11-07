import { useEffect, useRef, useState } from "react";
import { ArrowRight, ScanLine } from "lucide-react";
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
    <div className="min-h-screen max-w-[430px] mx-auto flex items-center justify-center px-5 bg-slate-50 shadow-[0_0_50px_rgba(15,23,42,0.08)]">
      <div className="w-full py-8">
        {/* Logo & Branding Bento Lockup */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 text-white shadow-md rounded-2xl mb-3">
            <ScanLine className="w-7 h-7 text-emerald-400" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
            Scan Retur <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-black">B2B</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            BLP Beauty Distribution
          </p>
        </div>

        {/* Session Expired Alert */}
        {isSessionExpired && !error && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 text-center">
            Sesi Anda telah berakhir. Silakan login kembali.
          </div>
        )}

        {/* Login Bento Card */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xl space-y-4 text-center">
          {/* Error Alert */}
          {error && (
            <div className="rounded-xl px-3.5 py-2.5 text-xs font-semibold bg-red-50 text-red-900 border border-red-200 text-left leading-relaxed">
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-800 py-2">
              <div className="h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
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
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-600 leading-relaxed">
                <p className="font-extrabold text-slate-900 mb-1">Setup Google Sign-In</p>
                <p>
                  Tambahkan <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-xs font-bold text-slate-800">VITE_GOOGLE_CLIENT_ID</code> di file <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-xs font-bold text-slate-800">.env</code> untuk tombol Google resmi.
                </p>
              </div>

              {/* Dev Quick Test Area */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <p className="text-xs font-extrabold text-slate-900">
                  Pilih Akun Cepat (Dev Mode):
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {["bagas", "dimas", "nur", "irwan"].map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDevLogin(`${name}@${REQUIRED_DOMAIN}`)}
                      className="px-3.5 py-2.5 text-xs font-bold rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs transition-all capitalize text-left flex items-center justify-between cursor-pointer"
                    >
                      <span>{name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <input
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={`email@${REQUIRED_DOMAIN}`}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 mb-2"
                  />
                  <button
                    type="button"
                    disabled={loading || !devEmail}
                    onClick={() => handleDevLogin(devEmail)}
                    className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
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
