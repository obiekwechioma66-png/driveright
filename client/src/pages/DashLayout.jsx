import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

// Shared dashboard chrome. No marketing nav here — dashboards are their own space.
export function DashLayout({ user, children }) {
  const nav = useNavigate();
  const { logout } = useAuth();

  const out = () => { logout(); nav("/"); };

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" to={`/${user?.role || ""}`}>
            <span className="brand-mark" aria-hidden="true">⚙</span> DriveRight
          </Link>
          <nav className="nav-desktop" aria-label="Dashboard">
            <Link to={`/${user?.role || ""}`}>Dashboard</Link>
            {user?.role === "learner" && <Link to="/book">Book a lesson</Link>}
            {user?.role === "learner" && <Link to="/packages">Choose a package</Link>}
            {user?.role === "admin" && <Link to="/admin#packages-manager">Packages</Link>}
            {user?.role === "admin" && <Link to="/admin/settings">School Settings</Link>}
            {(user?.role === "learner" || user?.role === "instructor") && <Link to="/profile">Profile</Link>}
          </nav>
          <div className="header-cta">
            <span className="pill neutral">{user?.name} · {user?.role}</span>
            <button className="btn btn-ghost" onClick={out}>Log out</button>
          </div>
        </div>
      </header>
      <main className="dash-page"><div className="container">{children || <Outlet />}</div></main>
      <footer className="site-footer">
        <div className="container footer-inner"><span>DriveRight · {new Date().getFullYear()} · Lagos</span></div>
      </footer>
    </>
  );
}
