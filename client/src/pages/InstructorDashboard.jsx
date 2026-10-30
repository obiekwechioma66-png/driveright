import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";
import ProgressTracker from "../components/ProgressTracker";

const LESSON_MS = 60 * 60 * 1000;

const lagos = (utc) =>
  new Date(utc).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

export default function InstructorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyLessonId, setBusyLessonId] = useState(null);
  const [openRatingKey, setOpenRatingKey] = useState(null);
  const [savingRatingLessonId, setSavingRatingLessonId] = useState(null);
  const [markingLearnerId, setMarkingLearnerId] = useState(null);

  const load = () => api("/instructor/dashboard")
    .then((dashboard) => { setData(dashboard); setError(""); })
    .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const completeLesson = async (lessonId) => {
    setBusyLessonId(lessonId);
    setActionError("");
    try {
      await api(`/lessons/${lessonId}/complete`, { method: "POST" });
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyLessonId(null);
    }
  };

  const saveRatings = async (lessonId, ratings) => {
    setSavingRatingLessonId(lessonId);
    setActionError("");
    try {
      await api(`/lessons/${lessonId}/ratings`, { method: "POST", body: { ratings } });
      setOpenRatingKey(null);
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setSavingRatingLessonId(null);
    }
  };

  const markTestReady = async (learnerId) => {
    setMarkingLearnerId(learnerId);
    setActionError("");
    try {
      await api(`/learners/${learnerId}/test-ready`, { method: "POST" });
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setMarkingLearnerId(null);
    }
  };

  if (error) return <DashLayout user={user}><p className="form-error">{error}</p></DashLayout>;
  if (!data) return <DashLayout user={user}><p className="dim">Loading…</p></DashLayout>;

  const todayBooked = data.todayLessons.filter((lesson) => lesson.status === "booked").length;
  const weekBooked = data.weekLessons.filter((lesson) => lesson.status === "booked").length;

  return (
    <DashLayout user={user}>
      <div className="summary">
        <div className="sum-card">
          <span className="sum-label">Today’s lessons</span>
          <span className="sum-value">{data.todayLessons.length}</span>
          <span className="sum-note">{todayBooked} still booked</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">This week</span>
          <span className="sum-value">{data.weekLessons.length}</span>
          <span className="sum-note">{weekBooked} still booked · Lagos time</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">Your learners</span>
          <span className="sum-value">{data.learners.length}</span>
          <span className="sum-note">assigned to you</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">Lessons completed</span>
          <span className="sum-value">{data.completedLessons}</span>
          <span className="sum-note">all time</span>
        </div>
      </div>

      {actionError && <p className="form-error lesson-action-error" role="alert">{actionError}</p>}

      <section className="dash-section">
        <h2>Today · Lagos time</h2>
        <LessonTable
          scope="today"
          lessons={data.todayLessons}
          emptyMessage="No lessons scheduled for today."
          busyLessonId={busyLessonId}
          onComplete={completeLesson}
          openRatingKey={openRatingKey}
          setOpenRatingKey={setOpenRatingKey}
          savingRatingLessonId={savingRatingLessonId}
          onSaveRatings={saveRatings}
        />
      </section>

      <section className="dash-section">
        <h2>This week · Monday–Sunday</h2>
        <LessonTable
          scope="week"
          lessons={data.weekLessons}
          emptyMessage="No lessons scheduled for this week."
          busyLessonId={busyLessonId}
          onComplete={completeLesson}
          openRatingKey={openRatingKey}
          setOpenRatingKey={setOpenRatingKey}
          savingRatingLessonId={savingRatingLessonId}
          onSaveRatings={saveRatings}
        />
      </section>

      <section className="dash-section">
        <h2>Assigned learners</h2>
        {data.learners.length === 0 && <p className="dim">No learners assigned yet.</p>}
        {data.learners.length > 0 && (
          <div className="instructor-learner-grid">
            {data.learners.map((learner) => (
              <article className="card instructor-learner-card" key={learner.email}>
                <div className="instructor-learner-heading">
                  <div><h3>{learner.name}</h3><p className="dim">{learner.email}</p></div>
                  <span className="pill neutral">{learner.upcomingLessons} upcoming</span>
                </div>
                <ProgressTracker
                  progress={learner.progress}
                  showSkills={false}
                  marking={markingLearnerId === learner.id}
                  onMarkTestReady={() => markTestReady(learner.id)}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </DashLayout>
  );
}

function LessonTable({
  scope, lessons, emptyMessage, busyLessonId, onComplete,
  openRatingKey, setOpenRatingKey, savingRatingLessonId, onSaveRatings,
}) {
  if (lessons.length === 0) return <p className="dim">{emptyMessage}</p>;

  return (
    <div className="table-wrap">
      <table className="table lesson-table">
        <thead><tr><th>When</th><th>Learner</th><th>Length</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {lessons.map((lesson) => {
            const eligible = new Date(lesson.startsAtUTC).getTime() + LESSON_MS <= Date.now();
            const ratingKey = `${scope}:${lesson.id}`;
            const ratingOpen = openRatingKey === ratingKey;
            const hasStageRatings = lesson.ratingSkills.some((skill) => lesson.ratings?.some((rating) => rating.skillId === skill.id));
            return (
              <Fragment key={lesson.id}>
                <tr>
                  <td>{lagos(lesson.startsAtUTC)}</td>
                  <td>{lesson.learner}</td>
                  <td>60 min</td>
                  <td><span className="lesson-status">{lesson.status === "completed" ? "Completed" : "Booked"}</span></td>
                  <td>
                    {lesson.status === "completed" ? lesson.ratingStage ? (
                      <button className="btn-mini lesson-rate-btn" type="button"
                        onClick={() => setOpenRatingKey(ratingOpen ? null : ratingKey)}>
                        {ratingOpen ? "Close ratings" : hasStageRatings ? "Review skill ratings" : "Rate skills"}
                      </button>
                    ) : <span className="dim">Skills complete</span> : eligible ? (
                      <button
                        className="btn-mini lesson-complete-btn"
                        type="button"
                        disabled={busyLessonId !== null}
                        onClick={() => onComplete(lesson.id)}
                      >
                        {busyLessonId === lesson.id ? "Saving…" : "Mark complete"}
                      </button>
                    ) : <span className="dim small">After lesson ends</span>}
                  </td>
                </tr>
                {ratingOpen && (
                  <tr key={`${lesson.id}-ratings`}>
                    <td colSpan="5" className="rating-cell">
                      <RatingForm
                        lesson={lesson}
                        busy={savingRatingLessonId === lesson.id}
                        onCancel={() => setOpenRatingKey(null)}
                        onSave={(ratings) => onSaveRatings(lesson.id, ratings)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RatingForm({ lesson, busy, onCancel, onSave }) {
  const existing = new Map((lesson.ratings || []).map((rating) => [rating.skillId, rating]));
  const [values, setValues] = useState(() => Object.fromEntries(lesson.ratingSkills.map((skill) => {
    const saved = existing.get(skill.id);
    return [skill.id, { rating: saved?.rating || "", note: saved?.note || "" }];
  })));

  const update = (skillId, key, value) => setValues((current) => ({
    ...current,
    [skillId]: { ...current[skillId], [key]: value },
  }));

  const submit = (event) => {
    event.preventDefault();
    onSave(lesson.ratingSkills.map((skill) => ({ skillId: skill.id, ...values[skill.id] })));
  };

  return (
    <form className="rating-form" onSubmit={submit}>
      <h3>Rate {lesson.ratingStage === "parking" ? "Parking" : "Highway"} skills · {lesson.learner}</h3>
      <p className="dim">These ratings are saved to this lesson’s history. Notes are optional.</p>
      <div className="rating-skill-list">
        {lesson.ratingSkills.map((skill) => (
          <div className="rating-item" key={skill.id}>
            <label>{skill.name}
              <select required value={values[skill.id]?.rating || ""} onChange={(event) => update(skill.id, "rating", event.target.value)}>
                <option value="" disabled>Choose a rating…</option>
                <option value="not_yet">Not yet</option>
                <option value="improving">Improving</option>
                <option value="confident">Confident</option>
              </select>
            </label>
            <label className="rating-note">Note <small>optional</small>
              <textarea maxLength="500" rows="2" value={values[skill.id]?.note || ""}
                onChange={(event) => update(skill.id, "note", event.target.value)} />
            </label>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving ratings…" : "Save skill ratings"}</button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
