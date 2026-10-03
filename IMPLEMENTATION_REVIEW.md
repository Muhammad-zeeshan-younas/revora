# Revora implementation review

Reviewed 3 October 2026 against `BUSINESS_GUIDE.md`, the application code, and the automated tests. This is a code review of the pilot, not evidence of production readiness or customer adoption.

## What works today

| Business workflow              | Status      | Evidence and scope                                                                                                                                                                        |
| ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company sign-in and team roles | Implemented | Sessions, invitations, tenant membership, and backend role checks. Company creation is an internal helper; public registration is closed.                                                 |
| Customer accounts              | Implemented | Add, search, filter, import/export CSV, account profile, balances, and credit limit. General editing and deletion are absent.                                                             |
| Invoices and aging             | Implemented | Create/import, due dates, disputes, balances, aging, and CSV export. Draft and written-off states exist in data, without complete approval workflows.                                     |
| Collections                    | Implemented | Priority queue, interactions, promises, and local reminder outbox. Message sending and reply capture are absent.                                                                          |
| Incoming receipts              | Implemented | Manual entry and bank CSV import, duplicate reference checks, match suggestions, reviewed allocations, partial matching, and reversal. Importing a receipt alone does not pay an invoice. |
| Credit decisions               | Implemented | Limits, utilization/exposure, and decision history. Orders are not automatically blocked.                                                                                                 |
| Overview and activity          | Implemented | Receivables summary, charts, aging, priority accounts, invoice CSV report export, and audit entries for successful changes. No general report upload or report builder exists.            |
| Reply assistant                | Limited     | Local English/Roman Urdu rules create drafts for human review; no external AI or messaging connection.                                                                                    |

**“Report upload” clarification:** The Overview exports an invoice report. The supported uploads are customer, invoice, and incoming bank-payment CSV files. The browser parses each file and sends a validated command; there is no PDF/image report ingestion or server multipart upload endpoint.

## Reliability work in this review

- Added `tests/import-and-race.test.ts` for the bank CSV path, debit skipping, quoted text, duplicate references, malformed CSV, unknown customers, atomic rejection, allocation, and competing writes against the same revision.
- Confirmed that two concurrent requests to allocate the same receipt result in one commit and one HTTP 409; the invoice and receipt retain a single allocation. The database revision comparison and financial row changes occur in one transaction. Clients must reload after 409.
- Changed batch duplicate checks and CSV customer resolution to indexed lookups. A 1,000-row import no longer scans all existing records for each row in those paths.
- Tightened malformed CSV quote handling. The normal CSV upload limit remains 1.5 MB and 1,000 rows at the browser/command boundary.

## Remaining work, in priority order

1. **Production safety:** managed backups and restore drills, encryption and secret management, password recovery, MFA, email verification, monitoring/alerts, and deployment procedures. The guide calls this a development pilot.
2. **Import robustness:** bank-specific CSV column mapping and preview of actual rows/errors, upload idempotency for lost responses, and a durable import receipt/log. Today an HTTP response lost after commit can leave a user unsure whether retrying is safe. Duplicate bank/reference checks help only for payments with stable references.
3. **Scale:** paginated/filterable server queries and narrower scheduler queries. The API sends a complete workspace snapshot and the reminder worker loads every organization; both grow with the total record count. Measure with realistic company sizes before selecting indexes or caches.
4. **Financial operations:** formal write-off approval, invoice adjustments/credit notes, customer edits, and bank reconciliation against a statement balance. The current reversal is an internal allocation reversal, not a bank refund.
5. **Integrations:** connected WhatsApp delivery/status and reply capture; bank/Raast or accounting/ERP connectors. These need provider agreements, reconciliation rules, and delivery retry design.
6. **Field workflow:** mobile/offline collection, salesperson territory restrictions, order and inventory linkage, and actual credit holds if targeting distributors that need a full distribution system.
7. **Reporting:** DSO and collection effectiveness measures, unmatched-receipt aging, promise timeliness, scheduled reports, and drill-down/export for managers. The current dashboard does not calculate all of these.
8. **Tax fit:** assess FBR digital invoicing obligations for target customers before positioning Revora as their invoice issuance system. Revora currently stores receivable invoices, without an FBR integration.

## What Pakistani businesses can use now

Evidence supports **available tools and workflows**, not a claim that every Pakistani company uses them. A distributor may still work with paper, spreadsheets, phone calls, and WhatsApp; local distribution platforms explicitly describe that starting point. Local DMS products advertise order booking, dispatch, inventory, field collection, receivables, and bank reconciliation together. Revora covers the receivables/collection slice, so CSV exchange with an existing billing system is the practical pilot fit. [SAMS Online product description](https://www.sams.solutions/), [SAMS DMS features](https://www.sams.solutions/distribution-management-system-software).

Digital receipt options are also relevant. SBP's FY2024–25 review reports that digital channels made up over 88% of retail payment transactions, and Raast P2M supports QR, IBAN, merchant aliases, and request-to-pay. This is broad payment-system data, **not** a measure of B2B distributor adoption. Revora can label a receipt as Raast but has no live Raast integration. [SBP payment systems review](https://www.sbp.org.pk/PS/PDF/Annual-Payment-Systems-Review-FY25.pdf), [SBP Raast P2M](https://www.sbp.org.pk/our-subsidiaries/raast/raast-person-to-merchant).

FBR describes digital invoicing and integration requirements for registered persons. Tax treatment depends on the customer's status and current rules; validate requirements with a qualified local adviser before building or marketing a compliance workflow. [FBR digital invoicing FAQ](https://www.fbr.gov.pk/faqs/173967/173969).

## Verification

- `npm test`: 44 tests passed across 7 files.
- `npm run typecheck`: passed.
- `npx tsc --noEmit -p tests/tsconfig.json`: passed.

The concurrency test uses the SQL.js test database and real HTTP requests. PostgreSQL multi-process behavior, large-tenant load, and backup recovery still need environment-specific testing before production use.
