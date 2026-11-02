import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth, homeForRole } from "../auth";
import { AuthLayout } from "./Login";

export default function Signup() {
  const nav = useNavigate();
  const { register, user, checking } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!checking && user) return <Navigate to={homeForRole(user.role)} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await register(form);
      nav(homeForRole(u.role), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" sub="Join DriveRight — learn to drive, the right way.">
      <form className="form" onSubmit={submit}>
        <label>Full name
          <input type="text" required autoComplete="name" value={form.name} onChange={set("name")} />
        </label>
        <label>Email
          <input type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <div className="form-row">
          <label>Password <small>(8+ characters)</small>
            <input type="password" required minLength={8} autoComplete="new-password"
              value={form.password} onChange={set("password")} />
          </label>
          <label>Phone <small>(required for lesson reminders)</small>
            <input type="tel" required pattern="(?:0[789][0-9]{9}|\+234[789][0-9]{9})" title="Use a Nigerian number, e.g. 08012345678" autoComplete="tel" value={form.phone} onChange={set("phone")} />
          </label>
        </div>
        <label>Address <small>(optional)</small>
          <input type="text" maxLength={300} autoComplete="street-address" value={form.address} onChange={set("address")} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account →"}</button>
        <p className="form-note">Already registered? <Link to="/login" className="link">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
