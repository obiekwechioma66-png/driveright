import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";

export default function Profile() {
  const { user } = useAuth(); const [form, setForm] = useState({ phone: "", address: "" }); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); setError(""); api("/profile").then((d) => setForm(d.profile)).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const d = await api("/profile", { method: "PATCH", body: form }); setForm(d.profile); setMessage("Profile saved."); } catch (e2) { setError(e2.message); } finally { setBusy(false); } };
  return <DashLayout user={user}><section className="dash-section settings-section"><span className="eyebrow">Your details</span><h1>Profile</h1>{loading ? <p className="loading-state" role="status">Loading profile…</p> : error ? <div><p className="form-error" role="alert">{error}</p><button type="button" className="btn btn-ghost" onClick={load}>Retry</button></div> : <><p className="section-sub">{form.name} · {form.email}</p><form className="form settings-form" onSubmit={save}><label>Phone {user?.role === "learner" ? <small>(required for lesson reminders)</small> : <small>(optional)</small>}<input type="tel" required={user?.role === "learner"} pattern="(?:0[789][0-9]{9}|\+234[789][0-9]{9})" title="Use a Nigerian number, e.g. 08012345678" value={form.phone || ""} onChange={set("phone")} /></label><label>Address <small>(optional)</small><input maxLength={300} autoComplete="street-address" value={form.address || ""} onChange={set("address")} /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-note ok">{message}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form></>}</section></DashLayout>;
}
