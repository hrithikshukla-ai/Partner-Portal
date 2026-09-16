# Academia Global Channel Partner Portal

Built from `Academia Partner Portal – Conceptualization` (BRD v1.0, 06 July 2026), Sections 1–10 and Appendices A–C.
Sections 11–16 of the source document were explicitly marked "ignore" and are not reflected here, except
Appendix C's tech stack (React / Node / MySQL), which this build follows exactly.

## Stack
- **Frontend:** React 18 + Vite + React Router. Plain CSS using the brand tokens from Appendix B
  (Midnight Navy `#2A2C5B`, Crimson Red `#B2242E`, Ghost White `#F9FAFB`, Black `#1B1B1B`, Inter typeface).
- **Backend:** Node.js + Express, JWT auth, `mysql2`.
- **Database:** MySQL 8+.

## Architecture: Region → Country → Partner + RBAC
Per BRD Section 7.1, access control is enforced **at the data-query level, not just the UI** — every
scoped controller calls into `backend/src/middleware/scope.js`, which builds a `WHERE` clause from the
authenticated user's role/region/partner (taken from the JWT, never from client input) before any
region- or partner-scoped table is queried. This is the mechanism that stops a partner in Country A from
retrieving Country B's data even via direct API calls.

Roles implemented (Section 7.1): `SUPER_ADMIN`, `GLOBAL_PARTNER_MANAGER`, `REGIONAL_PARTNER_MANAGER`,
`PARTNER_ADMIN`, `PARTNER_SALES_USER`, `ACADEMIA_MARKETING`, `ACADEMIA_SALES`.

## The modules (BRD Section 8, plus a Users master)
| # | Module | Backend | Frontend |
|---|---|---|---|
| 1 | Partner Onboarding & Profile | `controllers/partnerController.js` | `pages/Partners.jsx` |
| 2 | Region-Country-Tier Hierarchy & Access | `controllers/hierarchyController.js` | `pages/Hierarchy.jsx` |
| 3 | Target Account & Contact Mgmt | `controllers/instituteController.js` | `pages/Institutes.jsx` |
| 4 | Deal Registration & Pipeline | `controllers/dealController.js` | `pages/Deals.jsx` |
| 5 | Marketing Collateral Library | `controllers/collateralController.js` | `pages/Collateral.jsx` |
| 6 | Cadence & MoM Tracker | `controllers/cadenceController.js` | `pages/Cadence.jsx` |
| 7 | Training & Certification | `controllers/trainingController.js` | `pages/Training.jsx` |
| 8 | Dashboards & Business Plan | `controllers/dashboardController.js` | `pages/Dashboard.jsx` |
| 9 | Notification Centre | `controllers/notificationController.js` | `pages/Notifications.jsx` |
| 10 | MDF & Commission (Phase 3) | `controllers/incentiveController.js` | `pages/Incentives.jsx` |
| 11 | Users master (all roles) + self-service profile | `controllers/userController.js` | `pages/Users.jsx`, `pages/Profile.jsx` |

Module 4 (Deal Registration) is the most critical per the BRD: `dealController.js` runs an automated
conflict check against any other partner's **approved, still-protected (default 90-day window), open**
deal on the same institute, both at registration and again at approval time, and blocks approval on conflict.

## Setup

### 1. Database
```bash
cd backend
cp .env.example .env   # edit DB_* and JWT_SECRET
npm install
npm run migrate         # applies src/db/schema.sql
npm run db:seed         # creates a Super Admin login (see console output)
```
> Note: `npm run db:seed` isn't wired into package.json yet — run `node src/db/seed.js` directly, or add
> `"db:seed": "node src/db/seed.js"` to `backend/package.json` scripts.

### 2. Backend API
```bash
npm run dev   # http://localhost:4000, health check at /health
```

### 3. Frontend
```bash
cd ../frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to :4000
```

Log in with the seeded Super Admin (`superadmin@academia-portal.local` / `ChangeMe123!`). Use **Region &
Access** to add regions, countries (with dialing code) and tiers; **Master ▸ Users** to create any user
(Regional Managers, Academia staff, or Partner personnel) — creating a user emails an activation link
(logged to the backend console if `SMTP_HOST` isn't set in `.env`) rather than displaying a temp password.

### Optional: SMTP and Google SSO
- **Email:** set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `backend/.env` to send real
  activation/notification emails. Left blank, the backend logs the email content to its console instead.
- **Single sign-on:** set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in
  `backend/.env` (OAuth client from Google Cloud Console, redirect URI =
  `<API base>/api/auth/sso/google/callback`) to enable the "Sign in with Google" button on the login page.
  A Google sign-in only succeeds for an email that already has a portal account.

## What's built vs. what's next
**Done:** full schema, RBAC-scoped API for all 11 modules (the 10 from BRD Section 8 plus a Users master),
deal conflict engine, tier/training/certification masters with add/modify/delete, local file uploads
(partner documents, certificates) served from `backend/uploads/`, email-based user activation, optional
Google SSO, and a working React UI for every module.

**Not yet built** (natural next slice):
- Swap local disk storage (`backend/uploads/`) for S3/equivalent for partner documents, collateral and
  certificates in a multi-instance deployment.
- Scheduled jobs for SLA/overdue MoM alerts and proactive notification delivery (WhatsApp/SMS channels) —
  the `notifications` table and `notify()` helper exist; nothing calls them yet on stage-change/deal-approval
  events beyond broadcasts.
- Bulk import wizard for spreadsheet migration (BRD Section 9).
- Automated tests.
