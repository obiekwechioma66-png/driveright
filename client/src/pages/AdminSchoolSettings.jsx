import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";

const EMPTY = { address: "", phone: "", whatsappNumber: "", email: "", instagram: "", facebook: "", x: "", tiktok: "", youtube: "", ownerName: "", ownerBio: "", ownerPhotoUrl: "" };
export default function AdminSchoolSettings() {
  const { user } = useAuth(); const [form, setForm] = useState(EMPTY); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); setError(""); api("/admin/school-settings").then((d) => setForm({ ...EMPTY, ...d.settings })).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const d = await api("/admin/school-settings", { method: "PATCH", body: form }); setForm({ ...EMPTY, ...d.settings }); setMessage("School contact details saved."); } catch (e2) { setError(e2.message); } finally { setBusy(false); } };
  return <DashLayout user={user}><section className="dash-section settings-section"><span className="eyebrow">Public contact details</span><h1>School Settings</h1><p className="section-sub">These details appear on the public website and Contact page.</p>
    {loading ? <p className="loading-state" role="status">Loading school settings…</p> : error ? <div><p className="form-error" role="alert">{error}</p><button type="button" className="btn btn-ghost" onClick={load}>Retry</button></div> : <form className="form settings-form" onSubmit={save}><label>School address<input required minLength={5} maxLength={300} value={form.address} onChange={set("address")} /></label><div className="form-row"><label>Phone<input type="tel" required pattern="(?:0[789][0-9]{9}|\+234[789][0-9]{9})" title="Use a Nigerian number" value={form.phone} onChange={set("phone")} /></label><label>WhatsApp number<input type="tel" required pattern="(?:0[789][0-9]{9}|\+234[789][0-9]{9})" title="Use a Nigerian number" value={form.whatsappNumber} onChange={set("whatsappNumber")} /></label></div><label>School email<input type="email" required value={form.email} onChange={set("email")} /></label>
      <h2>Social media <small>(all optional; enter a handle or full profile URL)</small></h2>{[["instagram","Instagram"],["facebook","Facebook"],["x","X / Twitter"],["tiktok","TikTok"],["youtube","YouTube"]].map(([key,label]) => <label key={key}>{label}<input type="text" maxLength={200} placeholder="@driveright.ng" value={form[key] || ""} onChange={set(key)} /></label>)}
      <h2>Meet the owner <small>(optional; displayed on the public landing page)</small></h2>
      <label>Owner name<input type="text" maxLength={120} value={form.ownerName || ""} onChange={set("ownerName")} /></label>
      <label>Short introduction<textarea rows="4" maxLength={1200} value={form.ownerBio || ""} onChange={set("ownerBio")} /></label>
      <label>Owner photo URL <small>(secure https link)</small><input type="url" value={form.ownerPhotoUrl || ""} onChange={set("ownerPhotoUrl")} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-note ok" role="status">{message}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </form>}</section></DashLayout>;
}
