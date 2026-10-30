import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, naira } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";
import ProgressTracker from "../components/ProgressTracker";

const lagos = (utc) =>
  new Date(utc).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

export default function LearnerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [payingId, setPayingId] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState({});
  const [simulationReference, setSimulationReference] = useState(null);

  const load = () => api("/learner/dashboard").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const payBalance = async (purchase) => {
    setPayingId(purchase.id);
    setPaymentError("");
    setSimulationReference(null);
    try {
      const amountNaira = paymentAmounts[purchase.id];
      const body = { purchaseId: purchase.id };
      if (amountNaira !== undefined && amountNaira !== "") {
        const amountKobo = Math.round(Number(amountNaira) * 100);
        if (!Number.isFinite(amountKobo) || amountKobo < 10_000 || amountKobo > purchase.balanceOwedKobo) {
          throw new Error(`Enter an amount from ₦100 up to ${naira(purchase.balanceOwedKobo)}.`);
        }
        body.amountKobo = amountKobo;
      }
      const result = await api("/payments/init", {
        method: "POST",
        body,
      });
      if (!result.authorization_url) throw new Error("Paystack did not return a checkout link.");
      window.location.assign(result.authorization_url);
    } catch (e) {
      setPaymentError(e.message);
      setSimulationReference(e.data?.devSimulate?.reference || null);
      setPayingId(null);
    }
  };

  const simulatePayment = async () => {
    if (!simulationReference) return;
    setPayingId("simulation");
    setPaymentError("");
    try {
      await api("/payments/simulate", { method: "POST", body: { reference: simulationReference } });
      window.location.assign(`/payment/callback?reference=${encodeURIComponent(simulationReference)}&mode=simulation`);
    } catch (e) {
      setPaymentError(e.message);
      setPayingId(null);
    }
  };

  if (error) return <DashLayout user={user}><p className="form-error">{error}</p></DashLayout>;
  if (!data) return <DashLayout user={user}><p className="dim">Loading…</p></DashLayout>;

  return (
    <DashLayout user={user}>
      {/* Law: balance owed + next lesson always on top */}
      <div className="summary">
        <div className={`sum-card${data.balanceOwedKobo > 0 ? " owes" : ""}`}>
          <span className="sum-label">Balance owed</span>
          <span className="sum-value">{naira(data.balanceOwedKobo)}</span>
          <span className="sum-note">{data.balanceOwedKobo > 0 ? "Please pay to release booking slots" : "You're all settled"}</span>
        </div>
        <div className="sum-card">
          <span className="sum-label">Next lesson</span>
          {data.nextLesson ? (
            <>
              <span className="sum-value">{lagos(data.nextLesson.startsAtUTC)}</span>
              <span className="sum-note">with {data.nextLesson.instructor} · 60 min</span>
            </>
          ) : (
            <>
              <span className="sum-value dim">Not booked yet</span>
              <span className="sum-note">Pick a slot with your instructor</span>
            </>
          )}
        </div>
        <div className="sum-card">
          <span className="sum-label">Lesson credits</span>
          <span className="sum-value">{data.purchases.reduce((s, p) => s + p.creditsLeft, 0)}</span>
          <span className="sum-note">left across your purchases</span>
        </div>
      </div>

      <section className="dash-section">
        <h2>Your progress</h2>
        <ProgressTracker progress={data.progress} />
      </section>

      <section className="dash-section">
        <h2>Your purchases</h2>
        {paymentError && <p className="form-error" role="alert">{paymentError}</p>}
        {simulationReference && (
          <div className="simulation-note">
            <p>Local test mode only: this records a simulated payment and does not charge a card.</p>
            <button className="btn btn-ghost" type="button" disabled={payingId !== null} onClick={simulatePayment}>
              {payingId === "simulation" ? "Recording simulation…" : "Simulate payment locally"}
            </button>
          </div>
        )}
        <div className="form-actions" style={{ marginBottom: 16 }}>
          <Link className="btn btn-primary" to="/book">Book a lesson →</Link>
        </div>
        {data.purchases.length === 0 && <p className="dim">No purchases yet — <Link to="/packages">choose a package</Link> to get started.</p>}
        <div className="grid3">
          {data.purchases.map((p) => (
            <article className="card" key={p.id}>
              <h3>{p.packageName}</h3>
              <p>{p.creditsLeft} of {p.lessonsTotal} lessons remaining · {p.status}</p>
              <div className="kv"><span>Paid so far</span><strong>{naira(p.paidKobo)}</strong></div>
              <div className="kv"><span>Price</span><strong>{naira(p.priceKobo)}</strong></div>
              {p.balanceOwedKobo > 0 && (
                <>
                  <div className="kv owe"><span>Balance owed</span><strong>{naira(p.balanceOwedKobo)}</strong></div>
                  <label className="payment-amount">Payment amount in naira <small>Leave blank to pay the full balance.</small>
                    <input type="number" min="100" max={p.balanceOwedKobo / 100} step="1"
                      value={paymentAmounts[p.id] ?? ""} placeholder={String(p.balanceOwedKobo / 100)}
                      onChange={(e) => setPaymentAmounts({ ...paymentAmounts, [p.id]: e.target.value })} />
                  </label>
                  <button className="btn btn-primary pay-button" type="button" disabled={payingId !== null}
                    onClick={() => payBalance(p)}>
                    {payingId === p.id ? "Opening secure checkout…" : "Continue to Paystack"}
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </DashLayout>
  );
}
