import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { AuthLayout } from "./Login";

export default function StaffInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ name: "", password: "", phone: "", address: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("This invitation link is missing its token."); setLoading(false); return; }
    api(`/staff/invitations/${encodeURIComponent(token)}`)
      .then((data) => setEmail(data.email))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/staff/invitations/accept", { method: "POST", body: { ...form, email, token } });
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <AuthLayout title="Join DriveRight staff" sub="Create your instructor account using your invitation.">
    {loading ? <p className="loading-state" role="status">Checking your invitation…</p>
      : error && !email ? <p className="form-error" role="alert">{error}</p>
        : done ? <div className="form"><p className="form-note ok" role="status">Your instructor account is ready.</p><Link className="btn btn-primary" to="/staff/login">Go to Staff Portal sign in</Link></div>
          : <form className="form" onSubmit={submit}>
            <label>Full name<input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={set("name")} /></label>
            <label>Invited email<input type="email" value={email} readOnly /></label>
            <label>Password <small>(8+ characters)</small><input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} /></label>
            <label>Phone <small>(optional)</small><input type="tel" pattern="(?:0[789][0-9]{9}|\+234[789][0-9]{9})" title="Use a Nigerian number, e.g. 08012345678" autoComplete="tel" value={form.phone} onChange={set("phone")} /></label>
            <label>Address <small>(optional)</small><input maxLength={300} autoComplete="street-address" value={form.address} onChange={set("address")} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy}>{busy ? "Creating account…" : "Create instructor account"}</button>
          </form>}
  </AuthLayout>;
}
