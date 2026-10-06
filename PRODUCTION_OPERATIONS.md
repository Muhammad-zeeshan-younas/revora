# Production operations setup

Revora is a local pilot until a PostgreSQL provider, alert receiver, and verified email domain are selected. The application now rejects a production start with missing core settings. Keep the development SQL.js file out of production.

## Database recovery

1. Create a dedicated managed PostgreSQL database and set `DATABASE_URL` through the hosting platform's secret manager. Use a database user limited to this application. Confirm the connection uses the provider's required TLS settings.
2. Enable the provider's automatic backups and point-in-time recovery. Choose a retention period that covers the business's agreed recovery window; record the selected retention, backup region, and recovery point objective in the deployment record. Keep a separate export outside the provider account if the business requires protection from account loss.
3. Before a production migration, take an on-demand recovery point and run `npm run db:migrate` against the target database. Migrations also run during app startup, so complete the migration before scaling to multiple app instances.
4. At least once per release cycle, restore a backup into a separate, empty PostgreSQL database. Run the migration command against the restored database, check `/api/health/ready`, compare organization and financial table counts with the source, and spot-check an invoice, its allocations, and audit history. Record restore duration, recovered timestamp, result, and operator. Never test a restore over the live database.
5. Document the provider's exact restore steps, access roles, escalation contact, and the last successful drill in the deployment record. A configured backup without a successful restore test does not establish recovery readiness.

For local SQL.js development, stop the API and run `npm run db:backup -- --offline-confirmed`. That command is separate from managed PostgreSQL backups.

## Secrets and account email

Set `NODE_ENV=production`, `DATABASE_URL`, an HTTPS `APP_ORIGIN`, `MFA_ENCRYPTION_KEY`, `OPERATIONS_TOKEN`, `RESEND_API_KEY`, and `EMAIL_FROM` in the hosting platform's secret manager. The app checks these values at startup without printing them. Generate the MFA key as 32 cryptographically random bytes encoded as 64 hex characters and preserve it across restarts; losing or rotating it without a migration makes enrolled authenticator secrets unreadable. Limit who can read the key and the database backup, and record a key recovery procedure.

Verify the sender domain with the email provider, configure its required DNS records, then send a test invitation, verification email, and password reset to a real inbox. Confirm the links use the deployed `APP_ORIGIN` and that the sender is accepted. Existing users without a verified email will be prompted to verify when account email is enabled. Enroll administrators in authenticator MFA and verify sign-in and recovery procedures before granting production access.

The app cannot verify domain ownership, provider secret storage, or MFA enrollment by itself. Record those checks during deployment.

## Monitoring and alerts

Run `npm run build`, then run `npm run monitor` as a separate managed process. Configure `OPERATIONS_URL` to the private `/api/health/operations` endpoint, `OPERATIONS_TOKEN` to the same value as the API, and `ALERT_WEBHOOK_URL` to an HTTPS receiver that accepts JSON POSTs. Set `ALERT_WEBHOOK_TOKEN` if that receiver accepts bearer authentication. The process checks once a minute, sends a new alert when the alert set changes, repeats an active alert hourly, and sends a recovery event. It also alerts when the operations endpoint cannot be reached. The small state file at `OPERATIONS_STATE_FILE` prevents duplicate delivery across restarts; store it on persistent private storage and run one monitor process per deployment.

The webhook body contains `source`, `status`, `alerts`, and `at`. Test delivery by stopping the API briefly or pointing a nonproduction monitor at an unreachable operations URL, then confirm the alert and recovery reach an operator. Monitor process failure should also be watched by the host's process manager. `/api/health/ready` remains the database readiness probe. `/api/health/operations` also reports the reminder worker's last duration and any active lease expiry.

`npm run monitor:once` performs a single poll for a scheduler or manual check. An alert destination and a host for this process are still required before alerts can reach anyone.

## Large-company checks

The default Overview boot now uses `/api/workspace/bootstrap`, then loads the bounded overview response. Customer, invoice, and payment lists use cursor pages when the workspace is in bounded mode; customer search does the same. Screens and actions that still require complete workspace data fetch it when opened. Collections, credit, activity, and financial command flows still need a wider move to bounded reads and writes before large-company use. The overview response is bounded, but its server calculation still reads the full workspace.

Run `npm run benchmark:records` for the in-memory SQL.js fixture. To measure PostgreSQL, create a **separate empty database with `benchmark` in its name**, set `BENCHMARK_DATABASE_URL`, and run `npm run benchmark:records -- --postgres`. The script refuses a database containing any table before it applies migrations. It inserts 5,000 customers and 25,000 invoices, then reports page latency, full-snapshot latency, and payload size. Run it from the same network and machine class planned for the deployment, record p50/p95 and database resource use, and remove the isolated fixture database afterward. Never point this command at production data.
