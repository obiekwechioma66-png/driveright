import { useEffect, useState } from "react";
import PublicFooter from "../components/PublicFooter";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const digits = (value) => String(value || "").replace(/\D/g, "");
const SOCIALS = [["instagram", "Instagram", "instagram.com"], ["facebook", "Facebook", "facebook.com"], ["x", "X", "x.com"], ["tiktok", "TikTok", "tiktok.com"], ["youtube", "YouTube", "youtube.com"]];
const linkFor = (value, domain) => /^https?:\/\//i.test(value) ? value : `https://${domain}/${value.replace(/^@/, "")}`;

export default function Contact() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api("/school-settings").then((d) => setSettings(d?.settings || null)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  const wa = digits(settings?.whatsappNumber).replace(/^0/, "234");
  return <><header className="site-header"><div className="container header-inner"><Link className="brand" to="/"><span className="brand-mark">⚙</span> DriveRight</Link><nav className="nav-desktop"><Link to="/">Home</Link><Link to="/login">Log in</Link></nav></div></header>
    <main className="contact-page"><div className="container"><span className="eyebrow">We’re here to help</span><h1 className="section-title">Contact DriveRight</h1><p className="section-sub">Talk to our team about lessons, packages, or getting started.</p>
      <section className="card contact-card"><h2>School details</h2>{loading ? <p className="loading-state" role="status">Loading contact details…</p> : error ? <p className="form-error" role="alert">{error}</p> : <><address>{settings?.address || "School address not set yet"}</address>
        <div className="contact-actions">{settings?.phone && <a className="btn btn-primary" href={`tel:${digits(settings.phone)}`}>Call {settings.phone}</a>}{settings?.whatsappNumber && <a className="btn btn-ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Message on WhatsApp</a>}{settings?.email && <a className="link" href={`mailto:${settings.email}`}>{settings.email}</a>}</div>
        {settings?.address && <a className="map-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}>Open address in Google Maps ↗</a>}
        {SOCIALS.some(([key]) => settings?.[key]) && <div className="contact-socials"><h3>Follow us</h3>{SOCIALS.filter(([key]) => settings?.[key]).map(([key, label, domain]) => <a key={key} href={linkFor(settings[key], domain)} target="_blank" rel="noreferrer">{label}</a>)}</div>}
      </>}</section>
    </div></main><PublicFooter /></>;
}
