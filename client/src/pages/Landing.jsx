import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, homeForRole } from "../auth";
import PublicFooter from "../components/PublicFooter";
import { api } from "../lib/api";

const checkpoints = [
  {
    n: 1,
    title: "1 · Parking stage",
    text: "Mirror discipline, clutch control, reversing, hill starts, bay and parallel parking.",
    pct: 35,
    amber: true,
    note: "Typically ~10 lessons",
  },
  {
    n: 2,
    title: "2 · Highway stage",
    text: "Lane discipline, safe overtaking, roundabouts, night driving and long-distance control.",
    pct: 60,
    amber: false,
    note: "Unlocks when Parking is Confident",
  },
  {
    n: 3,
    title: "3 · Test-ready",
    text: "Mock tests, examiner-route practice, calm nerves. The badge lands when everything is Confident.",
    pct: 8,
    amber: false,
    note: "System-verified — instructor confirms at 100%",
  },
];

const packages = [
  {
    tag: "Starter",
    name: "Basics",
    price: "₦80,000",
    lessons: "/ 6 lessons",
    popular: false,
    items: ["60-minute lessons, one instructor", "Parking stage checklist included", "Progress tracking after every lesson", "Booking reminders by email"],
  },
  {
    tag: "Full course",
    name: "Standard",
    price: "₦150,000",
    lessons: "/ 12 lessons",
    popular: true,
    items: ["Everything in Basics", "Highway stage unlocking", "Priority evening & weekend slots", "Balance instalments supported"],
  },
  {
    tag: "Finishing",
    name: "Test-prep",
    price: "₦90,000",
    lessons: "/ 6 lessons",
    popular: false,
    items: ["Mock driving tests with scoring", "Examiner-route practice", "Test-day confidence coaching", "Test-ready badge on completion"],
  },
];

function ApiStatus() {
  const [state, setState] = useState("checking"); // checking | up | down
  useEffect(() => {
    let alive = true;
    api("/health")
      .then((d) => { if (alive && d && d.ok) setState("up"); if (!alive) return; })
      .catch(() => { if (alive) setState("down"); });
    return () => { alive = false; };
  }, []);
  return (
    <div className={`api-status ${state === "up" ? "up" : ""}`}>
      <span className="dot" />
      {state === "up" ? "API connected" : "API offline"}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label="DriveRight home">
            <span className="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M9 3h2v4l3 0v2h-3v4h3v2h-3v2H9v-2H6v-2h3V9H6V7h3V3z" fill="#fff" />
              </svg>
            </span>
            DriveRight
          </a>
          <nav className="nav-desktop" aria-label="Main">
            <a href="#stages">The 3 stages</a>
            <a href="#packages">Packages</a>
            <Link to="/contact">Contact</Link>
            {user
              ? <Link to={homeForRole(user.role)}>My dashboard</Link>
              : <Link to="/login">Log in</Link>}
          </nav>
          <div className="header-cta">
            {user ? (
              <Link className="btn btn-primary" to={homeForRole(user.role)}>My dashboard →</Link>
            ) : (
              <Link className="btn btn-primary" to="/signup">Sign up →</Link>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">DriveRight Driving School</span>
              <h1>Learn to drive — <em>the right way</em>.</h1>
              <p className="lede">
                Book lessons that never clash, pay for a package once online, and watch every
                skill grow with a certified instructor — from parallel parking to highway confident.
              </p>
              <div className="hero-actions">
                {user ? (
                  <Link className="btn btn-primary" to={homeForRole(user.role)}>Open my dashboard →</Link>
                ) : (
                  <Link className="btn btn-primary" to="/signup">Book my first lesson →</Link>
                )}
                <a className="btn btn-ghost" href="#stages">See how tracking works</a>
              </div>
              <div className="trust">
                <span className="stars" aria-label="Rated 5 stars">★★★★★</span>
                <span><strong>200+ learners</strong> passed their test with us</span>
              </div>
            </div>
            <div className="hero-photo">
              <img
                src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=900&q=75"
                alt="A learner driver's hands on the steering wheel during a daytime lesson"
                loading="eager"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <div className="hero-badge">Progress bar updated after today's lesson</div>
            </div>
          </div>
        </section>

        <section id="stages">
          <div className="container">
            <span className="eyebrow">Not just lessons</span>
            <h2 className="section-title">Three stages. Zero guessing.</h2>
            <p className="section-sub">
              After every lesson your instructor rates each skill. You watch progress bars move —
              and a badge appears the day you're ready for the real test.
            </p>
            <div className="grid3">
              {checkpoints.map((c) => (
                <article className={`card p${c.n}`} key={c.n}>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <div className="meter-top"><span>Stage progress</span><span>{c.pct}%</span></div>
                  <div className={`bar${c.amber ? " amber" : ""}`}>
                    <i style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="meter-note">{c.note}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="packages">
          <div className="container">
            <span className="eyebrow">Packages</span>
            <h2 className="section-title">Pay once. Learn till you're ready.</h2>
            <p className="section-sub">
              Prepaid lesson credits. Cancel more than 24h before a lesson and the credit returns to you.
            </p>
            <div className="grid3">
              {packages.map((p) => (
                <article className={`pkg${p.popular ? " popular" : ""}`} key={p.name}>
                  {p.popular && <span className="ribbon">Most popular</span>}
                  <span className="pkg-tag">{p.tag}</span>
                  <h3>{p.name}</h3>
                  <div className="price">{p.price} <small>{p.lessons}</small></div>
                  <ul>
                    {p.items.map((i) => <li key={i}>✓&nbsp;{i}</li>)}
                  </ul>
                  <Link className="btn btn-primary" to="/signup">Choose {p.name} →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="final">
          <div className="container">
            <div className="final">
              <h2>Your first lesson is one click away.</h2>
              <p>Create a free account, pick your package, and we'll get your wheels turning.</p>
              <Link className="btn btn-light" to="/signup">Start driving →</Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter extra={<ApiStatus />} />
    </>
  );
}
