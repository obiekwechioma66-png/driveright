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
  const [menuOpen, setMenuOpen] = useState(false);
  const [packages, setPackages] = useState(null);
  const [packageError, setPackageError] = useState("");
  const [testimonials, setTestimonials] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [budget, setBudget] = useState(150000);
  const [lessonTarget, setLessonTarget] = useState("any");
  const [recommendations, setRecommendations] = useState(null);

  const loadPackages = () => {
    setPackageError("");
    api("/packages").then((data) => setPackages(data.packages || [])).catch((error) => setPackageError(error.message));
  };
  useEffect(() => {
    loadPackages();
    api("/testimonials").then((data) => setTestimonials(data.testimonials || [])).catch(() => setTestimonials([])).finally(() => setReviewsLoading(false));
    api("/school-settings").then((data) => setSettings(data.settings || null)).catch(() => setSettings(null));
  }, []);

  const findPackages = (event) => {
    event.preventDefault();
    if (!packages?.length) return;
    const maxBudget = Number(budget) * 100;
    const minLessons = lessonTarget === "any" ? 0 : Number(lessonTarget);
    const eligible = packages.filter((p) => p.priceKobo <= maxBudget && p.lessonCount >= minLessons);
    const ranked = (eligible.length ? eligible : packages).slice().sort((a, b) => {
      if (lessonTarget !== "any" && a.lessonCount !== b.lessonCount) {
        const aGap = Math.abs(a.lessonCount - minLessons);
        const bGap = Math.abs(b.lessonCount - minLessons);
        if (aGap !== bGap) return aGap - bGap;
      }
      return a.priceKobo - b.priceKobo;
    });
    setRecommendations({ packages: ranked.slice(0, 2), exactFit: eligible.length > 0 });
  };

  const navItems = [
    ["About DriveRight", "#about"], ["Our stages", "#stages"], ["Packages", "#packages"],
    ["Find your package", "#finder"], ["Reviews", "#reviews"], ["Contact", "/contact"],
  ];

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
          <nav id="public-navigation" className={`nav-desktop${menuOpen ? " mobile-open" : ""}`} aria-label="Main">
            {navItems.map(([label, href]) => href.startsWith("/")
              ? <Link key={href} to={href} onClick={() => setMenuOpen(false)}>{label}</Link>
              : <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
            <Link to="/staff/login" onClick={() => setMenuOpen(false)}>Staff Portal</Link>
            <Link to="/admin/login" onClick={() => setMenuOpen(false)}>Admin Portal</Link>
            {user
              ? <Link to={homeForRole(user.role)} onClick={() => setMenuOpen(false)}>My dashboard</Link>
              : <Link to="/login" onClick={() => setMenuOpen(false)}>Learner sign in</Link>}
          </nav>
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          ><span /><span /><span /></button>
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

        <section id="about" className="about-section">
          <div className="container">
            <span className="eyebrow">A clearer way to learn</span>
            <h2 className="section-title">Know where you are. Know what comes next.</h2>
            <p className="section-sub">DriveRight helps instructors assess and monitor each learner’s development through Parking, Highway driving, and test preparation. Learners can see how far they’ve progressed and which skills still need practice.</p>
            <div className="owner-card card">
              {settings?.ownerPhotoUrl && <img className="owner-photo" src={settings.ownerPhotoUrl} alt={settings.ownerName ? `Portrait of ${settings.ownerName}` : "DriveRight owner"} loading="lazy" />}
              <div>
                <span className="eyebrow">Meet the owner</span>
                <h3>{settings?.ownerName || "The person behind DriveRight"}</h3>
                <p>{settings?.ownerBio || "The owner introduction can be added in Admin Portal → School Settings."}</p>
              </div>
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
            {packageError && <div className="inline-error" role="alert"><p>{packageError}</p><button type="button" className="btn btn-ghost" onClick={loadPackages}>Retry packages</button></div>}
            {!packages && !packageError && <p className="loading-state" role="status">Loading lesson packages…</p>}
            {packages?.length === 0 && <p className="dim">There are no active lesson packages right now. Please contact the school.</p>}
            <div className="grid3">
              {(packages || []).map((p) => (
                <article className="pkg" key={p.id}>
                  <span className="pkg-tag">{p.lessonCount} driving lessons</span>
                  <h3>{p.name}</h3>
                  <div className="price">{`₦${(p.priceKobo / 100).toLocaleString("en-NG")}`} <small>/ package</small></div>
                  {p.description && <p>{p.description}</p>}
                  <Link className="btn btn-primary" to="/signup">Choose {p.name} →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="finder" className="finder-section">
          <div className="container">
            <span className="eyebrow">A good place to start</span>
            <h2 className="section-title">Find your package</h2>
            <p className="section-sub">Tell us your budget and how many lessons you have in mind. We’ll match you with active DriveRight packages.</p>
            {!packages && !packageError && <p className="loading-state" role="status">Loading packages for your finder…</p>}
            {packageError && <div className="inline-error" role="alert"><p>We couldn’t load the package options for the finder.</p><button type="button" className="btn btn-ghost" onClick={loadPackages}>Retry</button></div>}
            {packages?.length === 0 && <p className="dim">No active packages are available to match right now. Please contact the school.</p>}
            {packages?.length > 0 && <form className="finder-form card" onSubmit={findPackages}>
              <label>Maximum budget (₦)<input type="number" min="100" step="5000" required value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
              <label>Lesson target<select value={lessonTarget} onChange={(event) => setLessonTarget(event.target.value)}><option value="any">I’m flexible</option><option value="6">At least 6 lessons</option><option value="10">At least 10 lessons</option><option value="12">At least 12 lessons</option></select></label>
              <button className="btn btn-primary">Find matching packages</button>
            </form>}
            {recommendations && <div className="finder-results" aria-live="polite">
              <h3>{recommendations.exactFit ? "These packages fit your choices" : "Here are the closest options"}</h3>
              {!recommendations.exactFit && <p className="dim">No active package fits both preferences yet, so these are the nearest options to compare.</p>}
              <div className="grid3">{recommendations.packages.map((p) => <article className="card finder-result" key={p.id}><h3>{p.name}</h3><p>{p.description || `${p.lessonCount} driving lessons`}</p><strong>₦{(p.priceKobo / 100).toLocaleString("en-NG")} · {p.lessonCount} lessons</strong><Link className="btn btn-primary" to="/signup">Choose this package →</Link></article>)}</div>
            </div>}
          </div>
        </section>

        <section id="reviews" className="reviews-section">
          <div className="container">
            <span className="eyebrow">Learner stories</span>
            <h2 className="section-title">Reviews from our learners</h2>
            {reviewsLoading ? <p className="loading-state" role="status">Loading reviews…</p>
              : testimonials.length ? <div className="grid3">{testimonials.map((review) => <article className="card review-card" key={review.id}><p className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p><blockquote>“{review.quote}”</blockquote><strong>{review.learnerName}</strong></article>)}</div>
                : <div className="card reviews-empty"><h3>Learner reviews coming soon</h3><p>DriveRight will share learner feedback here after it has been added by the school.</p></div>}
          </div>
        </section>

        <section id="final">
          <div className="container">
            <div className="final">
              <h2>Your first lesson is one click away.</h2>
              <p>Create a free account, pick your package, and we'll get your wheels turning.</p>
              <Link className="btn btn-light" to="/signup">Start driving →</Link>
              <Link className="instructor-portal-cta" to="/staff/login">Instructor Portal →</Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter extra={<ApiStatus />} />
    </>
  );
}
