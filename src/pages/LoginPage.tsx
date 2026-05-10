import { useState } from "react";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi");
      return;
    }
    setLoading(true);
    // Simulate slight delay for UX
    setTimeout(() => {
      const err = login(username, password);
      if (err) {
        setError(err);
      }
      setLoading(false);
    }, 300);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-50 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 rounded-2xl shadow-lg mb-3">
            <span className="text-3xl">📦</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Scan Retur</h1>
          <p className="text-xs text-gray-400 mt-0.5">B2B Distributor — BLP</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="card p-5 space-y-5">
          {/* Error */}
          {error && (
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-red-50 text-red-600 border border-red-100">
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Masukkan username"
              autoComplete="username"
              autoFocus
              className="input-field"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                className="input-field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors text-sm select-none"
                tabIndex={-1}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3"
          >
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>

        <p className="text-center text-[11px] text-gray-300 mt-8">
          © 2026 BLP — Scan Retur System
        </p>
      </div>
    </div>
  );
}
