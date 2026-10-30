import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { api, naira } from "../lib/api";
import { useAuth, homeForRole } from "../auth";
import { DashLayout } from "./DashLayout";

export default function LearnerPackages() {
  const nav = useNavigate();
  const { user, checking } = useAuth();
  const [packages, setPackages] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { api("/packages").then((d) => setPackages(d.packages)).catch((e) => setError(e.message)); }, []);

  if (!checking && user && user.role !== "learner") return <Navigate to={homeForRole(user.role)} replace />;

  const choose = async (pkg) => {
    setBusyId(pkg.id); setMsg(""); setError("");
    try {
      await api("/purchases", { method: "POST", body: { packageId: pkg.id } });
      setMsg(`"${pkg.name}" added — pay from your dashboard to activate booking.`);
      setTimeout(() => nav("/learner"), 900);
    } catch (ex) {
      setError(ex.message);
      setBusyId(null);
    }
  };

  return (
    <DashLayout user={user}>
      <div className="dash-section">
        <h2>Choose your package</h2>
        <p className="dim">Pick one now to lock in your credits — you pay on your dashboard, by instalment if you like.</p>
        {msg && <p className="form-note ok">{msg}</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="grid3 picker-grid">
          {(packages || []).map((p) => (
            <article className="pick-card" key={p.id}>
              <h3>{p.name}</h3>
              {p.description && <p className="pick-desc">{p.description}</p>}
              <div className="price">{naira(p.priceKobo)} <small>/ {p.lessonCount} lessons</small></div>
              <button className="btn btn-primary" disabled={busyId === p.id} onClick={() => choose(p)}>
                {busyId === p.id ? "Adding…" : "Choose this →"}
              </button>
            </article>
          ))}
          {packages && packages.length === 0 && <p className="dim">No packages available right now — check back soon.</p>}
          {!packages && !error && <p className="dim">Loading…</p>}
        </div>
      </div>
    </DashLayout>
  );
}
