import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const SOCIALS = [
  ["instagram", "Instagram", "instagram.com"], ["facebook", "Facebook", "facebook.com"],
  ["x", "X", "x.com"], ["tiktok", "TikTok", "tiktok.com"], ["youtube", "YouTube", "youtube.com"],
];
const digits = (value) => String(value || "").replace(/\D/g, "");
const whatsappDigits = (value) => { let d = digits(value); if (d.startsWith("0")) d = `234${d.slice(1)}`; return d; };
function socialUrl(value, domain) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${domain}/${v.replace(/^@/, "")}`;
}

export default function PublicFooter({ extra }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => { api("/school-settings").then((d) => setSettings(d?.settings || null)).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
  const socials = SOCIALS.filter(([key]) => settings?.[key]);
  return <footer className="site-footer public-footer">
    <div className="container public-footer-grid">
      <div><Link className="brand" to="/"><span className="brand-mark" aria-hidden="true">⚙</span> DriveRight</Link><p className="footer-address" role="status">{loading ? "Loading school contact details…" : error ? "Contact details are temporarily unavailable." : settings?.address || "Contact details coming soon"}</p></div>
      <div className="footer-contacts">
        {settings?.phone && <a href={`tel:${digits(settings.phone)}`}>Call {settings.phone}</a>}
        {settings?.whatsappNumber && <a href={`https://wa.me/${whatsappDigits(settings.whatsappNumber)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {settings?.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
        <Link to="/contact">Contact & location</Link>
      </div>
      {socials.length > 0 && <div className="footer-socials" aria-label="Social media">
        {socials.map(([key, label, domain]) => <a key={key} href={socialUrl(settings[key], domain)} target="_blank" rel="noreferrer" aria-label={label} title={label}><span aria-hidden="true">{label === "Instagram" ? "◎" : label === "Facebook" ? "f" : label === "X" ? "𝕏" : label === "TikTok" ? "♪" : "▶"}</span></a>)}
      </div>}
      <div className="footer-bottom"><span>© {new Date().getFullYear()} DriveRight Driving School</span>{extra}</div>
    </div>
  </footer>;
}
