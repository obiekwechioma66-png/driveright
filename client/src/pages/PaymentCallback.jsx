import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, naira } from "../lib/api";
import { useAuth } from "../auth";
import { DashLayout } from "./DashLayout";

export default function PaymentCallback() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const simulated = searchParams.get("mode") === "simulation";
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reference) {
      setError("No payment reference was returned. Check your dashboard before trying again.");
      return;
    }
    let active = true;
    api(`/payments/verify?reference=${encodeURIComponent(reference)}`)
      .then((data) => { if (active) setResult(data); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [reference]);

  return (
    <DashLayout user={user}>
      <section className="payment-result card" aria-live="polite">
        <span className="eyebrow">{simulated ? "Local payment simulation" : "Paystack checkout"}</span>
        {!result && !error && <><h1>Confirming your payment</h1><p className="dim">We’re checking the transaction securely.</p></>}
        {error && <><h1>We couldn’t confirm that payment</h1><p className="form-error" role="alert">{error}</p><p className="dim">If you completed checkout, check your dashboard in a moment before paying again.</p></>}
        {result?.payment.status === "success" && (
          <>
            <h1>{simulated ? "Payment simulation completed" : "Payment confirmed"}</h1>
            <p>{naira(result.payment.amountKobo)} {simulated ? "simulated for" : "received for"} {result.packageName}.</p>
            <p className="dim">{result.balanceOwedKobo > 0 ? `${naira(result.balanceOwedKobo)} remains on this package.` : "This package is fully paid."}</p>
          </>
        )}
        {result && result.payment.status !== "success" && (
          <>
            <h1>{result.payment.status === "failed" ? "Payment wasn’t completed" : "Payment is still processing"}</h1>
            <p className="dim">{result.payment.status === "failed" ? "No successful payment was recorded. You can try again from your dashboard." : "Paystack has not confirmed this transaction yet. Check your dashboard before starting another payment."}</p>
          </>
        )}
        <div className="form-actions payment-actions">
          <Link className="btn btn-primary" to="/learner">Return to dashboard</Link>
        </div>
      </section>
    </DashLayout>
  );
}
