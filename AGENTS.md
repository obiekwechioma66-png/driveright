# AGENTS.md — DriveRight

Driving school web app (single school). Roles: learner, instructor, admin.
Status: steps 1–6 verified, step 9 reminder service wired (polls ~24h window, one email per lesson via Resend idempotency key; idle until RESEND_API_KEY + RESEND_FROM_EMAIL are set). Learner signup now requires a phone number (for reminders). Smoke tests (all pass w/ tools\v24node): `smoke-auth.js`, `smoke-packages.js`, `smoke-booking.js`, `smoke-lessons.js`, `smoke-payments.js`. Sample logins (all `password123`): admin@driveright.ng, chike@driveright.ng, tunde@example.com. Remaining: real Resend/Paystack keys from owner, step 10 landing 3D, extra admin polish, deploy.

## Agreed stack & plan
- React (Vite) SPA + Node/Express API + PostgreSQL via Prisma; JWT auth (bcryptjs + jsonwebtoken).
- Paystack for payments (naira, test mode first). Resend/Brevo for email. Deploy: Vercel/Netlify (SPA) + Render/Railway (API + Postgres).
- Build order: 1 skeleton+schema → 2 auth+roles → 3 packages CRUD → 4 Paystack flow → 5 availability+booking engine → 6 lesson lifecycle → 7 progress tracker (special feature) → 8 learner dashboard → 9 reminder email → 10 landing 3D upgrade → 11 admin screens → 12 deploy. Ship one step at a time; owner tests after each.
- Do not write application code before owner says "go ahead"; step 10+ work only after 1–9 are solid.

## Standing project rules
1. Double-booking is prevented in the BACKEND only, as one transaction with four checks: no instructor overlap, no learner overlap, slot inside instructor's weekly availability, learner has paid purchase with remaining credit. Admin overrides are allowed (warn, don't block).
2. `balance owed = package price − Σ successful payments` — computed, never stored.
3. Lesson reminder: exactly ONE email per lesson, 24h before (learner + instructor). The only other transactional email is an instructor invitation sent by an admin.
4. Test-ready badge is system-gated: enabled only when every Parking + Highway skill's latest rating = Confident. Ratings are stored per skill per lesson (history, not overwrite).
5. Stages are strictly sequential: Parking → Highway → Test-ready.
6. Lessons are 60 minutes. Store datetimes in UTC; display in Africa/Lagos.
7. Cancellations: >24h before lesson returns the credit; ≤24h consumes it.

## Visual law (landing.html is the reference; tokens are CSS vars at its top)
- Warm off-white `#FAF7F2`, road-grey `#2B2F33`, soft sky blue `#32718D` for CTAs and key actions, signal orange `#E8842C` ONLY for attention (balance owed, progress highlights).
- Fonts: Bricolage Grotesque headings, Inter body. Flat colors + soft shadows. Mobile-first (360–430px), tap targets ≥44px.
- Never: neon, gradients/sci-fi, cartoon, game-like motion. Learner dashboard must always show balance owed + next lesson on top.

## Environment quirks (verified this machine)
- No Python and no Node installed. To preview HTML locally run the current dir server: `powershell -NoProfile -ExecutionPolicy Bypass -File preview-server.ps1` → http://127.0.0.1:8731/landing.html.
- OpenCode browser cannot open `file://` URLs; use `browser.preview` for local files or the HTTP server for tab work.
- Chromium throttles page logic when the desktop app window is minimized: rAF never fires and scroll events stall, so a scroll-driven page looks "broken" though it isn't. Don't defer essential logic behind rAF only, and don't misdiagnose throttle symptoms as JS bugs. `browser.screenshot` also fails without a visible desk window.
- preview-server.ps1 sends no cache headers; Chromium may serve a stale copy after edits — force revalidation or verify served bytes when a change "doesn't appear".

## License policy
Any car imagery/model must have a real, verifiable licence (CC0/CC-BY with attribution, or bought royalty-free). No uncredited Sketchfab grabs.
