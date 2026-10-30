import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth, homeForRole } from "../auth";
import PublicFooter from "../components/PublicFooter";

export default function Login() {
  const nav = useNavigate();
  const { login, user, checking } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!checking && user) return <Navigate to={homeForRole(user.role)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await login(form.email, form.password);
      nav(homeForRole(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" sub="Sign in to your DriveRight dashboard.">
      <form className="form" onSubmit={submit}>
        <label>Email
          <input type="email" required autoComplete="email"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>Password
          <input type="password" required autoComplete="current-password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Log in →"}</button>
        <p className="form-note">New here? <Link to="/signup" className="link">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
}

export function AuthLayout({ title, sub, children }) {
  return (
    <><main className="auth-page">
      <div className="container auth-wrap">
        <div className="card auth-card">
          <span className="eyebrow">DriveRight</span>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{sub}</p>
          {children}
        </div>
        <p className="auth-foot"><Link to="/" className="link">← Back to the site</Link></p>
      </div>
    </main><PublicFooter /></>
  );
}
