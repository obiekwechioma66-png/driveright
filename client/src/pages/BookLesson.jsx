import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, homeForRole } from "../auth";
import { DashLayout } from "./DashLayout";

const todayStr = () => {
  const wall = new Date(Date.now() + 60 * 60 * 1000); // Lagos "today"
  return wall.toISOString().slice(0, 10);
};
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00+01:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (s) =>
  new Date(s + "T12:00:00+01:00").toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" });

export default function BookLesson() {
  const { user, checking } = useAuth();
  const [instructors, setInstructors] = useState([]);
  const [instructorId, setInstructorId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/instructors").then((d) => setInstructors(d.instructors)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!instructorId) { setSlots(null); return; }
    setLoadingSlots(true); setSelected(null);
    api(`/instructors/${instructorId}/availability?date=${date}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => { setError(e.message); setSlots(null); })
      .finally(() => setLoadingSlots(false));
  }, [instructorId, date]);

  if (!checking && user && user.role !== "learner") return <Navigate to={homeForRole(user.role)} replace />;

  const book = async () => {
    setBusy(true); setError("");
    try {
      await api("/lessons", { method: "POST", body: { instructorId, startsAtUTC: selected } });
      window.location.assign("/learner"); // simple + reliable after booking
    } catch (ex) {
      setError(ex.message);
      setBusy(false);
      // slot may be stale — refresh
      api(`/instructors/${instructorId}/availability?date=${date}`)
        .then((d) => setSlots(d.slots))
        .catch(() => {});
    }
  };

  return (
    <DashLayout user={user}>
      <div className="dash-section">
        <h2>Book a lesson</h2>
        <p className="dim">60-minute lessons. Pick an instructor, a day, then a free slot.</p>

        <div className="book-grid">
          <label>Instructor
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">Choose…</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" required value={date} min={todayStr()}
              onChange={(e) => setDate(e.target.value || todayStr())} />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="slots-wrap">
          {!instructorId && <p className="dim">Choose an instructor to see their free slots.</p>}
          {instructorId && loadingSlots && <p className="dim">Checking the diary…</p>}
          {instructorId && !loadingSlots && slots && slots.length === 0 && (
            <p className="dim">No free slots on {fmtDate(date)} — try another day.</p>
          )}
          {instructorId && !loadingSlots && slots && slots.length > 0 && (
            <>
              <p className="slots-title">Free slots · {fmtDate(date)} (Lagos time)</p>
              <div className="slots">
                {slots.map((s) => (
                  <button key={s.startsAtUTC} type="button"
                    className={`slot${selected === s.startsAtUTC ? " on" : ""}`}
                    onClick={() => setSelected(s.startsAtUTC)}>
                    {s.lagos}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" disabled={!selected || busy} onClick={book}>
            {busy ? "Booking…" : "Book lesson →"}
          </button>
        </div>
      </div>
    </DashLayout>
  );
}
