# Development accounts and dummy records

Run the seed against your development database, then use the normal **Sign in** form. The **Explore demo workspace** button creates a separate temporary demo; it does not log into these accounts.

```powershell
# Stop yarn dev first with Ctrl+C.
yarn db:seed
yarn dev
```

The command requires `NODE_ENV=development` in `.env`. It applies pending database migrations and creates the records in one transaction. It refuses to run while the configured API port is occupied, because the local SQL.js database must not have two processes writing to it. Stop all backend instances using the same database before seeding, including instances on other ports. PostgreSQL uses the configured `DATABASE_URL`; ensure that it points to a development database.

Re-running the command preserves existing records, passwords, roles, and manual edits. It does not reset dates or duplicate accounts. An existing unrelated account with a seed email causes the command to stop instead of overwriting it. To start over, use a fresh development database; retain a backup of any data you want to keep.

## Login accounts

Initial password for all seven accounts: **`RevoraDev!2026`**. These are deliberately public dummy credentials and must never be used in production. Passwords are stored as independently salted hashes.

| Email                     | Role        | Workspace            |
| ------------------------- | ----------- | -------------------- |
| `owner@revora.test`       | Owner       | Revora Demo Trading  |
| `admin@revora.test`       | Admin       | Revora Demo Trading  |
| `accountant@revora.test`  | Accountant  | Revora Demo Trading  |
| `collections@revora.test` | Collections | Revora Demo Trading  |
| `sales@revora.test`       | Sales       | Revora Demo Trading  |
| `viewer@revora.test`      | Viewer      | Revora Demo Trading  |
| `isolated@revora.test`    | Owner       | Revora Isolated Demo |

Sign out between accounts, or use separate browser profiles to compare them simultaneously. Tabs in the same browser profile share the session cookie.

## Current permission behavior

| Action                                                           | Owner | Admin | Accountant | Collections | Sales | Viewer |
| ---------------------------------------------------------------- | ----- | ----- | ---------- | ----------- | ----- | ------ |
| Read workspace records and export available CSVs                 | Yes   | Yes   | Yes        | Yes         | Yes   | Yes    |
| Create/import customers and invoices; dispute invoices           | Yes   | Yes   | Yes        | No          | No    | No     |
| Record/import, allocate, and reverse payments                    | Yes   | Yes   | Yes        | No          | No    | No     |
| Log interactions; create/cancel promises; queue/cancel reminders | Yes   | Yes   | Yes        | Yes         | No    | No     |
| Change credit limits and collection settings                     | Yes   | Yes   | No         | No          | No    | No     |
| Invite members                                                   | Yes   | Yes   | No         | No          | No    | No     |
| Change a non-owner member's role                                 | Yes   | No    | No         | No          | No    | No     |

These permissions describe the existing implementation, not new permissions added by the seed. Sales currently has the same read-only access as Viewer, including all customers within its organization. Salesperson labels do not restrict record visibility. Ownership cannot be reassigned through the role editor. Business rules can still reject an action permitted by a role.

## Financial scenarios

The main workspace starts with 18 customers, 68 invoices, 30 receipts, six promises, two outbox records, contact history, and sample audit events. Existing demo records provide six months of collections history, six aging buckets, unmatched receipts, a disputed invoice, and pending/broken promises. All amounts below are rupees; the database stores integer paisa. Dates are relative to the first seed run in the Asia/Karachi timezone.

| Record                                 | Initial state                                                                                  | Manual scenario                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed Partial Payments / `DEV-PARTIAL`  | Rs 80,000 receipt; Rs 60,000 allocated across `DEV-1001` and `DEV-1002`; Rs 20,000 unallocated | As Accountant, allocate the remainder. Attempting more than the available balance should fail. The Rs 80,000 promise becomes kept if allocated within its deadline. |
| `DEV-1001` / `DEV-1002`                | Rs 60,000 outstanding due in seven days / Rs 40,000 outstanding overdue by ten days            | Compare partial payment display with overdue status and aging totals.                                                                                               |
| Seed Reversed Payment / `DEV-REVERSED` | Historical Rs 50,000 allocation remains; `DEV-2001` owes Rs 50,000                             | Verify the reversed receipt does not count as collected. Reversing it again should fail.                                                                            |
| Seed Credit Hold / `DEV-3001`          | Zero credit limit; Rs 25,000 overdue; customer on hold                                         | Check credit exposure and rejection of a new reminder. Owner/Admin can adjust the limit; Collections cannot.                                                        |
| Seed Due Today / `DEV-4001`            | Rs 75,000 due today at a Rs 75,000 limit                                                       | It is outstanding but not overdue on seed day. Positive projected order exposure exceeds the limit. It becomes overdue tomorrow.                                    |
| `DEV-4002` / `DEV-4003`                | Draft Rs 10,000 / written-off Rs 5,000                                                         | Verify neither adds to outstanding balance and neither accepts payment allocation.                                                                                  |
| Seed Settled Account / `DEV-5001`      | Fully paid Rs 30,000 invoice and kept promise                                                  | Verify zero outstanding and rejection of an overdue reminder.                                                                                                       |
| Seed New Customer                      | Customer exists without invoices or payments                                                   | Check empty customer details; create its first invoice as Accountant.                                                                                               |
| City Wholesale / `INV-2425`            | Disputed invoice with an inbound dispute interaction                                           | Review the disputed balance and delivery-note follow-up.                                                                                                            |
| Ali Traders / `IBFT-928451`            | Unmatched receipt mentioning `INV-2401`                                                        | Review the match suggestion, then confirm allocation as Accountant.                                                                                                 |
| Prepared and cancelled outbox examples | Historical reminder records from yesterday                                                     | Inspect both states. Newly queued reminders become prepared when the worker runs; WhatsApp delivery is not connected.                                               |

The automatic reminder scheduler starts disabled. Dates continue aging after seeding; running the seed again does not restore the original scenario states.

## Permission and isolation scenarios

1. Sign in as Owner and verify the six team members in Settings. Change Viewer to Sales, sign in as Viewer again, and observe the new role. Restore it as Owner afterward.
2. As Admin, edit collection settings and invite a member. Changing an existing member's role must fail: that operation is owner-only.
3. As Accountant, allocate a receipt and create an invoice. Credit-limit and settings changes must be denied.
4. As Collections, add a phone interaction and payment promise. Creating a receipt or invoice must be denied.
5. As Sales and Viewer, browse records and check that mutation controls are unavailable. The backend also rejects forbidden commands submitted directly.
6. Sign in as `isolated@revora.test`: all financial lists start empty and none of the main workspace's customers appear. Creating an invoice with a main-workspace customer ID must fail.
7. In separate browser profiles, load the same record as Owner and Accountant. Save a change in one, then submit an edit from the stale profile: the backend should report a revision conflict and require a refresh.

Automated seed checks are written in `tests/development-seed.test.ts`. They have not been executed, as requested.
