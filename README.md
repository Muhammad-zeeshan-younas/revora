# Revora

A Vue 3 and NestJS accounts receivable workspace for Pakistani distributors, based on the MVP priorities in [Revora.md](../Revora.md).

## Development

For persistent dummy records and a login for every role, see [SEED_GUIDE.md](SEED_GUIDE.md). With the backend stopped, run `yarn db:seed`, then `yarn dev`.

Requires Node.js 22.13+ and Yarn Classic. The frontend runs at **http://127.0.0.1:5173**; the API runs at **http://127.0.0.1:3001/api**.

```powershell
cd C:\Users\void\Desktop\projects\revora
yarn install
Copy-Item .env.example .env
yarn dev
```

Stop the development servers with `Ctrl+C` before installing or updating dependencies. On Windows, a running Vite or tsx process can lock `esbuild.exe` and prevent installation. Use Yarn for dependency installation so `yarn.lock` stays authoritative. The npm script commands below also work as `yarn <script>`.

Choose **Explore demo workspace** in development to create an isolated organization with fictional Pakistani customer accounts, invoices, payments, promises, and activity. The session and data survive a refresh. Each new demo entry creates a separate workspace. Public registration is unavailable: Revora arranges company setup manually, and existing users sign in with their provided credentials. Contact details and the operator setup interface will be configured later. Use `yarn db:seed` for reusable development accounts.

## Implemented

See [BUSINESS_GUIDE.md](BUSINESS_GUIDE.md) for a plain-English explanation of the app, its intended users, each tab, and finance terms. See [TAB_GUIDE.md](TAB_GUIDE.md) for every tab's displayed information, metric definitions, examples, permissions, and edge cases.

- Vue Composition API, strict TypeScript, SCSS design tokens, Phosphor icons, and responsive navigation.
- Receivables dashboard with calculated totals, overdue balances, collection history, balance-weighted invoice age, six aging buckets, and prioritized accounts.
- Customers, profiles, search, filtering, credit exposure, salesperson assignment, and payment terms.
- Invoice creation and CSV imports; open, overdue, partial, paid, and disputed invoice views.
- Collection queue, interaction history, local scheduled reminder preparation, communication templates, daily limits, cancellation, and promises to pay.
- Rule-based English and Roman Urdu promise drafts with human confirmation. Existing payment allocations are recorded as a baseline so they cannot fulfill a new promise again.
- Bank CSV imports, duplicate detection, deterministic match suggestions, manual matching, partial payments, multiple invoice allocations, and audited reversal.
- Credit limit review, projected order exposure warnings, and owner/admin decisions with a recorded reason.
- Sign-in for provisioned accounts, hashed passwords, expiring HTTP-only sessions, logout revocation, tenant isolation, role permissions, one-use invitations, and audit history.
- Loading skeletons, save indicators, error states, conflict refresh, empty states, accessible modal focus handling, and reduced-motion support.
- Spreadsheet-safe CSV exports and downloadable import templates.

## Project structure

```text
src/pages/            Page composition and matching scoped SCSS files
src/components/forms/ Focused form sections and typed models
src/components/ui/    Reusable visual components and matching scoped SCSS files
src/config/           Typed navigation, dialog copy, and UI enums
src/stores/           Workspace state and financial mutations
src/composables/      Reusable reactive behavior
src/lib/              HTTP and browser utilities
src/styles/           Generic styling and design tokens only
server/controllers/   All HTTP controllers
server/services/      All business, session, database, and worker services
server/models/        All relational TypeORM models
server/repositories/  Queries, transactions, and workspace assembly
server/migrations/    Versioned schema and legacy data conversion
server/modules/       Nest dependency registration
server/database/      Connection configuration and migration CLI
shared/               Domain enums, constants, Zod contracts, financial logic
tests/                Domain and API test sources
e2e/                  Playwright workflow test sources
```

All authored application logic and configuration use TypeScript. Vue templates and SCSS provide the presentation layer. The project does not use explicit `any`, `unknown`, or `never` types, unchecked JSON casts, or TypeScript suppression comments. Runtime input and response parsing use shared Zod schemas.

See [CODING_STANDARDS.md](CODING_STANDARDS.md) for ownership, formatting, enum, and styling conventions. Prettier, ESLint, and EditorConfig enforce consistent formatting and the core TypeScript/Vue rules.

See [server/README.md](server/README.md) for the backend directory map, controller/service/repository/model responsibilities, routes, request flow, and Neovim decorator configuration.

## Financial and data rules

Amounts are integer **paisa**, not floating-point rupees. CSV and form amounts are converted at the boundary. Invoice balances derive from approved allocations. A bank import alone does not mark invoices paid. Disputed invoices remain in exposure but cannot receive allocations.

All workspace commands run against a copy of the tenant's state. The full update, including ledger changes and audit evidence, commits with a conditional revision check. Stale revisions receive HTTP 409 instead of overwriting newer work. The tenant ID comes from the authenticated session, never from the submitted financial command.

The local default is a persistent SQL.js SQLite file at `data/revora.sqlite`. PostgreSQL is supported through TypeORM using `DATABASE_URL`. Fifteen related tables store organizations, identities, memberships, settings, customers, invoices, payments, allocations, promises, baselines, interactions, reminders, and audit events. Financial changes and their audit entries commit in one revision-checked transaction. A versioned migration converts existing workspace JSON records and verifies that they reconstruct identically before removing the legacy tables. See the [backend and database guide](server/README.md) for the table map and relationships.

The displayed average outstanding age is balance-weighted invoice age, **not accounting DSO**. Collection history includes approved allocations and excludes reversed payments. Match confidence is a deterministic heuristic, not a calibrated statistical probability.

## External integrations and scope

This is a local development pilot, not a completed production financial platform. The UI labels the following boundaries explicitly:

- **WhatsApp:** durable local outbox with scheduled preparation. No live delivery, webhook receipt, or external messages are sent. Replies can be recorded manually.
- **AI:** deterministic reply parsing and account summaries. No LLM provider is connected; extraction requires human review.
- **ERP and banks:** CSV exchange. No direct feeds or ERP credentials are required.
- **Invitations:** a private copyable link; email delivery is not configured.

Production work still includes live WhatsApp and LLM adapters, MFA, password recovery/email verification, managed encryption and backups, retention, reporting optimization, operational monitoring, and a durable distributed job queue. Do not expose this pilot publicly or import live financial records until these requirements are addressed.

The broader financing, native apps, advanced analytics, and international expansion in the brief are deliberately outside its MVP scope.

## Commands

```text
npm run dev          Vue and NestJS development servers
npm run dev:web      Vue only
npm run dev:api      NestJS only
npm run db:migrate   Apply database migrations and report table counts
npm run typecheck    Strict Vue and server compilation checks
npm run lint         TypeScript and Vue coding standards
npm run format       Format the project
npm run format:check Verify formatting
npm run build        Type checks and production compilation
npm start            Compiled NestJS server
npm test             Domain and API tests
npm run test:e2e     Browser workflow tests (Microsoft Edge)
```

**Test execution is paused at the user's request.** Test sources are included but have not been verified by a completed run. A first attempt was blocked by the Windows sandbox. Type checking passed during development.

In Windows managed environments, Vite/esbuild and tsx may need permission to run outside the filesystem sandbox. No permission is required by the application itself.

## Environment

See `.env.example`. `DEMO_ENABLED=true` is development-only and is ignored when `NODE_ENV=production`. The production cookie uses the Secure flag and requires HTTPS. `APP_ORIGIN` must match the frontend origin exactly. Provision the PostgreSQL schema before setting `DB_SYNCHRONIZE=false`; automatic synchronization is intended for development only.

Reference documentation: [Vue TypeScript](https://vuejs.org/guide/typescript/composition-api), [NestJS authentication](https://docs.nestjs.com/security/authentication), [TypeORM](https://typeorm.io/docs/getting-started/).
