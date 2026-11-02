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
  const [assignmentBusy, setAssignmentBusy] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  useEffect(() => { api("/admin/dashboard").then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <DashLayout user={user}><p className="form-error">{error}</p></DashLayout>;
  if (!data) return <DashLayout user={user}><p className="dim">Loading…</p></DashLayout>;

  const assignLearner = async (learnerId, instructorId) => {
    setAssignmentBusy(learnerId); setAssignmentError("");
    try {
      await api(`/admin/learners/${encodeURIComponent(learnerId)}/instructor`, { method: "PATCH", body: { instructorId: instructorId || null } });
      const refreshed = await api("/admin/dashboard");
      setData(refreshed);
    } catch (err) { setAssignmentError(err.message); }
    finally { setAssignmentBusy(""); }
  };
  const outstanding = data.learners.flatMap((learner) => learner.purchases
    .filter((purchase) => purchase.balanceOwedKobo > 0)
    .map((purchase) => ({ learner, purchase })));

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
        <h2>Outstanding balances</h2>
        <p className="dim">Amounts are calculated from each package price and successful payments recorded.</p>
        {outstanding.length === 0 ? <p className="form-note ok">All recorded packages are fully paid.</p> : (
          <div className="table-wrap"><table className="table admin-table">
            <thead><tr><th>Learner</th><th>Instructor</th><th>Package</th><th>Paid</th><th>Package total</th><th>Balance owed</th></tr></thead>
            <tbody>{outstanding.map(({ learner, purchase }) => <tr key={purchase.id}>
              <td>{learner.name}<div className="dim small">{learner.email}</div></td><td>{learner.instructor || "Unassigned"}</td><td>{purchase.packageName}</td>
              <td>{naira(purchase.paidKobo)}</td><td>{naira(purchase.priceKobo)}</td><td className="admin-owed">{naira(purchase.balanceOwedKobo)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="dash-section">
        <h2>Learners</h2>
        <p className="dim">Assign or reassign each learner’s primary instructor here. Existing bookings keep the instructor they were booked with.</p>
        {assignmentError && <p className="form-error" role="alert">{assignmentError}</p>}
        {data.learners.length === 0 ? <p className="dim">No learners yet.</p> : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead><tr><th>Learner</th><th>Phone</th><th>Address</th><th>Primary instructor</th><th>Packages</th><th>Lessons remaining</th><th>Balance owed</th><th>Test-ready</th></tr></thead>
              <tbody>{data.learners.map((learner) => (
                <tr key={learner.id}>
                  <td>{learner.name}<div className="dim small">{learner.email}</div></td>
                  <td>{learner.phone || "—"}</td><td>{learner.address || "—"}</td>
                  <td><select className="assignment-select" aria-label={`Primary instructor for ${learner.name}`} value={learner.instructorId || ""} disabled={assignmentBusy === learner.id} onChange={(event) => assignLearner(learner.id, event.target.value)}><option value="">Unassigned</option>{data.instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select>{assignmentBusy === learner.id && <small className="dim">Saving…</small>}</td>
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
      <InstructorInvites />
      <TestimonialsManager />
      <section className="dash-section"><h2>School contact details</h2><p className="dim">Edit the address, phone, WhatsApp, email, and public social links.</p><a className="btn btn-ghost" href="/admin/settings">Open School Settings</a></section>
      <section className="dash-section"><h2>Owner introduction</h2><p className="dim">Add the owner’s name, short biography, and photo URL for the public landing page.</p><a className="btn btn-ghost" href="/admin/settings">Edit owner details</a></section>
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

function InstructorInvites() {
  const [invites, setInvites] = useState(null);
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => api("/admin/instructor-invites").then((data) => setInvites(data.invites)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const sendInvite = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setInviteUrl("");
    try {
      const data = await api("/admin/instructor-invites", { method: "POST", body: { email } });
      setEmail(""); setInviteUrl(data.inviteUrl || "");
      setMessage(data.emailSent ? `Invitation sent to ${data.invite.email}.` : `Invitation created for ${data.invite.email}.`);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const revoke = async (id) => {
    setError("");
    try { await api(`/admin/instructor-invites/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err.message); }
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage("Invitation link copied."); }
    catch { setMessage("Copy the invitation link shown below and send it to the instructor."); }
  };

  return <section className="dash-section">
    <h2>Invite instructors</h2>
    <p className="dim">Invitations create instructor-only accounts and expire after 7 days. Configure Resend to email invites; otherwise copy the one-time link.</p>
    <form className="admin-invite-form" onSubmit={sendInvite}>
      <label>Instructor email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="instructor@example.com" /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Creating invite…" : "Invite instructor"}</button>
    </form>
    {message && <p className="form-note ok" role="status">{message}</p>}
    {inviteUrl && <div className="invite-link-box"><input aria-label="Instructor invitation link" readOnly value={inviteUrl} /><button type="button" className="btn btn-ghost" onClick={copyInvite}>Copy link</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {invites === null ? <p className="loading-state" role="status">Loading invitations…</p> : invites.length === 0 ? <p className="dim">No instructor invitations yet.</p> : <div className="table-wrap"><table className="table admin-table"><thead><tr><th>Email</th><th>Created</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>{invites.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td>{new Date(invite.createdAt).toLocaleDateString("en-NG")}</td><td>{new Date(invite.expiresAt).toLocaleDateString("en-NG")}</td><td><span className={`pill ${invite.status}`}>{invite.status}</span></td><td>{invite.status === "pending" && <button type="button" className="btn-mini danger" onClick={() => revoke(invite.id)}>Revoke</button>}</td></tr>)}</tbody></table></div>}
  </section>;
}

function TestimonialsManager() {
  const EMPTY = { learnerName: "", quote: "", rating: 5, active: false };
  const [reviews, setReviews] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = () => api("/admin/testimonials").then((data) => setReviews(data.testimonials)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: key === "active" ? event.target.checked : event.target.value }));
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api(editingId ? `/admin/testimonials/${encodeURIComponent(editingId)}` : "/admin/testimonials", { method: editingId ? "PATCH" : "POST", body: { ...form, rating: Number(form.rating) } });
      setForm(EMPTY); setEditingId(null); setMessage("Review saved."); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    try { await api(`/admin/testimonials/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err.message); }
  };
  const edit = (review) => { setEditingId(review.id); setForm({ learnerName: review.learnerName, quote: review.quote, rating: review.rating, active: review.active }); };
  return <section className="dash-section">
    <h2>Reviews on the public site</h2>
    <p className="dim">Add genuine learner feedback. Only published reviews appear on the landing page.</p>
    <form className="form admin-review-form" onSubmit={save}>
      <label>Learner name<input required minLength={2} maxLength={120} value={form.learnerName} onChange={set("learnerName")} /></label>
      <label>Review<textarea required minLength={12} maxLength={700} rows="3" value={form.quote} onChange={set("quote")} /></label>
      <label>Rating<select value={form.rating} onChange={set("rating")}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={form.active} onChange={set("active")} /> Published on public site</label>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save review" : "Add review"}</button>{editingId && <button className="btn btn-ghost" type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}</div>
    </form>
    {message && <p className="form-note ok" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {reviews === null ? <p className="loading-state" role="status">Loading reviews…</p> : reviews.length === 0 ? <p className="dim">No learner reviews added yet.</p> : <div className="table-wrap"><table className="table admin-table"><thead><tr><th>Learner</th><th>Review</th><th>Rating</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>{reviews.map((review) => <tr key={review.id}><td>{review.learnerName}</td><td>{review.quote}</td><td>{review.rating}/5</td><td>{review.active ? "Published" : "Hidden"}</td><td className="cell-actions"><button type="button" className="btn-mini" onClick={() => edit(review)}>Edit</button><button type="button" className="btn-mini danger" onClick={() => remove(review.id)}>Delete</button></td></tr>)}</tbody></table></div>}
  </section>;
}
