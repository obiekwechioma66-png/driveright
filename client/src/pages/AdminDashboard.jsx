import { useEffect, useState } from "react";
import { api, naira } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";

const dt = (utc) =>
  new Date(utc).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

const EMPTY_FORM = { id: null, name: "", priceNaira: "", lessonCount: "", description: "", active: true };

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api("/admin/dashboard").then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <DashLayout user={user}><p className="form-error">{error}</p></DashLayout>;
  if (!data) return <DashLayout user={user}><p className="dim">Loading…</p></DashLayout>;

  return (
    <DashLayout user={user}>
      <div className="summary">
        {[
          ["Learners", data.stats.learners],
          ["Instructors", data.stats.instructors],
          ["Active purchases", data.stats.activePurchases],
          ["Upcoming lessons", data.stats.upcomingLessons],
          ["Outstanding balance", naira(data.stats.totalOutstandingBalanceKobo)],
          ["Test-ready learners", data.stats.testReadyLearners],
        ].map(([label, value]) => (
          <div className="sum-card" key={label}>
            <span className="sum-label">{label}</span>
            <span className="sum-value">{value}</span>
          </div>
        ))}
      </div>

      <section className="dash-section">
        <h2>Revenue (all time)</h2>
        <p className="big-number">{naira(data.stats.revenueAllTimeKobo)} <span className="dim">successful payments</span></p>
      </section>

      <section className="dash-section">
        <h2>Test-ready learners</h2>
        {data.testReadyLearners.length === 0 ? <p className="dim">No learners have been marked Test-ready.</p> : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead><tr><th>Learner</th><th>Email</th><th>Instructor</th><th>Badge</th></tr></thead>
              <tbody>{data.testReadyLearners.map((learner) => (
                <tr key={learner.id}>
                  <td>{learner.name}</td><td>{learner.email}</td><td>{learner.instructor || "—"}</td>
                  <td><span className="admin-badge">✓ Test-ready</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-section">
        <h2>Learners</h2>
        {data.learners.length === 0 ? <p className="dim">No learners yet.</p> : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead><tr><th>Learner</th><th>Phone</th><th>Address</th><th>Instructor</th><th>Packages</th><th>Lessons remaining</th><th>Balance owed</th><th>Test-ready</th></tr></thead>
              <tbody>{data.learners.map((learner) => (
                <tr key={learner.id}>
                  <td>{learner.name}<div className="dim small">{learner.email}</div></td>
                  <td>{learner.phone || "—"}</td><td>{learner.address || "—"}</td>
                  <td>{learner.instructor || "—"}</td>
                  <td>{learner.purchases.length ? learner.purchases.map((p) => `${p.packageName} (${p.status})`).join(", ") : "—"}</td>
                  <td>{learner.lessonsRemaining}</td>
                  <td className={learner.balanceOwedKobo > 0 ? "admin-owed" : ""}>{naira(learner.balanceOwedKobo)}</td>
                  <td>{learner.testReady ? <span className="admin-badge">✓ Yes</span> : "No"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-section">
        <h2>Instructors</h2>
        {data.instructors.length === 0 ? <p className="dim">No instructors yet.</p> : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead><tr><th>Instructor</th><th>Phone</th><th>Address</th><th>Assigned learners</th><th>Upcoming lessons</th></tr></thead>
              <tbody>{data.instructors.map((instructor) => (
                <tr key={instructor.id}>
                  <td>{instructor.name}<div className="dim small">{instructor.email}</div></td>
                  <td>{instructor.phone || "—"}</td><td>{instructor.address || "—"}</td><td>{instructor.learners}</td><td>{instructor.upcomingLessons}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-section">
        <h2>All payments</h2>
        {data.payments.length === 0 ? <p className="dim">No payments recorded yet.</p> : (
          <div className="table-wrap">
            <table className="table admin-table payments-table">
              <thead><tr><th>Learner</th><th>Package</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{data.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.learner}<div className="dim small">{payment.learnerEmail}</div></td>
                  <td>{payment.packageName}</td><td>{payment.method}</td><td className="payment-reference">{payment.reference}</td>
                  <td>{naira(payment.amountKobo)}</td>
                  <td><span className={`pill ${payment.status}`}>{payment.status}</span></td>
                  <td>{dt(payment.at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <PackagesManager />
      <section className="dash-section"><h2>School contact details</h2><p className="dim">Edit the address, phone, WhatsApp, email, and public social links.</p><a className="btn btn-ghost" href="/admin/settings">Open School Settings</a></section>
    </DashLayout>
  );
}

function PackagesManager() {
  const [packages, setPackages] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => api("/packages/all").then((d) => setPackages(d.packages)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const startEdit = (p) => {
    setForm({ id: p.id, name: p.name, priceNaira: p.priceKobo / 100, lessonCount: p.lessonCount, description: p.description || "", active: p.active });
    setMsg(""); setErr("");
    document.querySelector("#package-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(""); setErr("");
    const body = {
      name: form.name,
      priceKobo: Number(form.priceNaira) * 100,
      lessonCount: Number(form.lessonCount),
      description: form.description,
    };
    try {
      if (form.id) {
        const d = await api(`/packages/${form.id}`, { method: "PATCH", body: { ...body, active: form.active } });
        setMsg(`Updated "${d.package.name}".`);
      } else {
        const d = await api("/packages", { method: "POST", body });
        setMsg(`Created "${d.package.name}".`);
      }
      setForm(EMPTY_FORM);
      load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    setBusy(true); setMsg(""); setErr("");
    try {
      const d = await api(`/packages/${p.id}`, { method: "DELETE" });
      setMsg(d.message || `Deleted "${d.package.name}".`);
      load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p) => {
    setErr(""); setMsg("");
    try {
      await api(`/packages/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      load();
    } catch (ex) { setErr(ex.message); }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <section className="dash-section" id="packages-manager">
      <h2>Course packages</h2>

      <form className="form pkg-form" id="package-form" onSubmit={save}>
        <div className="form-row">
          <label>Name
            <input type="text" required value={form.name} onChange={set("name")} placeholder="Evening Saver" />
          </label>
          <label>Price (₦)
            <input type="number" required min="100" step="100" value={form.priceNaira} onChange={set("priceNaira")} placeholder="80000" />
          </label>
          <label>Lessons
            <input type="number" required min="1" step="1" value={form.lessonCount} onChange={set("lessonCount")} placeholder="6" />
          </label>
        </div>
        <label>Description <small>(optional)</small>
          <input type="text" value={form.description} onChange={set("description")} placeholder="What's inside this package" />
        </label>
        {form.id && (
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={set("active")} />
            Active (visible to learners)
          </label>
        )}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy}>{form.id ? "Save changes" : "Create package"}</button>
          {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY_FORM)}>Cancel edit</button>}
        </div>
        {msg && <p className="form-note ok">{msg}</p>}
        {err && <p className="form-error">{err}</p>}
      </form>

      {packages && (
        <table className="table">
          <thead><tr><th>Name</th><th>Price</th><th>Lessons</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.description ? <div className="dim small">{p.description}</div> : null}</td>
                <td>{naira(p.priceKobo)}</td>
                <td>{p.lessonCount}</td>
                <td><span className={`pill ${p.active ? "success" : "cancelled"}`}>{p.active ? "active" : "hidden"}</span></td>
                <td className="cell-actions">
                  <button type="button" className="btn-mini" onClick={() => startEdit(p)}>Edit</button>
                  <button type="button" className="btn-mini ghost" onClick={() => toggleActive(p)}>{p.active ? "Hide" : "Show"}</button>
                  <button type="button" className="btn-mini danger" disabled={busy} onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
