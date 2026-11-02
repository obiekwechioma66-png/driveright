# DriveRight API deployment

The web client is deployed on Vercel. The Express API and its database run as a separate service. Local development keeps using SQLite; production uses the PostgreSQL schema so the local database is not replaced.

## API service settings

- Service root: `server`
- Install/build: `npm ci && npm run prisma:generate:postgres`
- Start: `npm start`
- Node: 20 or newer
- Add a PostgreSQL database on the same host and set `DATABASE_URL` to its private connection URL.
- For a new, empty production database only, apply the schema once with `npm run db:push:postgres`. Review and back up any non-empty database before schema changes.

Set these environment variables on the API service:

- `DATABASE_URL` — production PostgreSQL connection string.
- `JWT_SECRET` — long, random secret for session tokens.
- `CORS_ORIGINS` — exact frontend origin, for example `https://driveright.vercel.app`.
- `APP_BASE_URL` — frontend origin used in instructor invitation links.
- `PAYSTACK_SECRET_KEY` — Paystack **test** secret key (`sk_test_…`). Keep it on the API service only.
- `PAYSTACK_CALLBACK_URL` — `https://driveright.vercel.app/payment/callback`.
- `PAYSTACK_ALLOW_SIMULATE` — `0` in hosted environments.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — verified sender for lesson reminders and instructor invitations.
- `PORT` — supplied by the hosting provider.

Set `VITE_API_URL` on the Vercel client to the API origin, with no `/api` suffix. In Paystack’s dashboard, set the webhook endpoint to `https://<api-origin>/api/payments/webhook`. Configure the same test secret key on the API service.

The API health check is `GET /api/health`. Verify test checkout, webhook delivery, and email delivery against the hosted services before switching any payment key to live mode.
