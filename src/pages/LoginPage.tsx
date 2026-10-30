import { useEffect, useRef, useState } from "react";
import { Package, AlertTriangle, Settings, Loader2 } from "lucide-react";
import { useAuth, REQUIRED_DOMAIN } from "../lib/auth";
import Button from "../components/ui/Button";
import Toast from "../components/ui/Toast";

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
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 text-white rounded-2xl shadow-lg mb-3">
            <Package className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Scan Retur</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium tracking-wide">
            B2B Distributor — BLP Beauty
          </p>
        </div>

        {/* Session Expired Alert */}
        {isSessionExpired && !error && (
          <div className="mb-4 rounded-xl px-3.5 py-2.5 text-xs bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>Sesi Anda telah berakhir demi keamanan. Silakan login kembali.</span>
          </div>
        )}

        {/* Login Card */}
        <div className="card p-6 space-y-6 text-center">
          {/* Error Alert */}
          {error && <Toast type="error" message={error} onClose={() => setError("")} />}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 py-2">
              <Loader2 className="animate-spin h-5 w-5 text-gray-800" aria-hidden="true" />
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
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  <span>Setup Google Sign-In</span>
                </p>
                <p>
                  Tambahkan{" "}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">
                    VITE_GOOGLE_CLIENT_ID
                  </code>{" "}
                  di file{" "}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env</code>{" "}
                  untuk mengaktifkan tombol Google resmi.
                </p>
              </div>

              {/* Dev Quick Test Area */}
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Uji Coba Cepat (Dev Mode):</p>
                <div className="grid grid-cols-2 gap-2">
                  {["bagas", "dimas", "nur", "irwan"].map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={loading}
                      onClick={() => void handleDevLogin(`${name}@${REQUIRED_DOMAIN}`)}
                      className="min-h-[42px] px-3 py-2 text-xs font-semibold rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors capitalize text-left flex items-center justify-between"
                    >
                      <span>{name}</span>
                      <span className="text-xs text-gray-500">
                        @{REQUIRED_DOMAIN.split(".")[0]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 space-y-2">
                  <input
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={`email@${REQUIRED_DOMAIN}`}
                    className="input-field text-sm py-2.5"
                  />
                  <Button
                    variant="primary"
                    block
                    disabled={loading || !devEmail}
                    onClick={() => void handleDevLogin(devEmail)}
                  >
                    Masuk dengan Email Di Atas
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
