# Revora tab guide

This guide explains the information, actions, scenarios, and edge cases in the current development application. It describes implemented behavior, including limitations; it is not a specification of future features.

## Navigation

- [Shared concepts](#shared-concepts)
- [Overview](#overview)
- [Customers](#customers)
- [Invoices](#invoices)
- [Collections](#collections)
- [Payments](#payments)
- [Credit management](#credit-management)
- [Activity center](#activity-center)
- [Settings](#settings)
- [Permissions](#permissions)
- [Common scenarios and recovery](#common-scenarios-and-recovery)

## Shared concepts

Company setup is arranged through the Revora team. There is no public registration form or registration API. Existing users sign in, and invited teammates can accept their invitation. Contact details and the operator setup interface are pending. Development accounts and permission scenarios are documented in [SEED_GUIDE.md](SEED_GUIDE.md).

| Term                                 | Meaning in Revora                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKR / Rs                             | Pakistani rupees. Inputs accept up to two decimal places; stored calculations use integer paisa (100 paisa = Rs 1).                                                    |
| K / M                                | Compact displays: K means thousand, M means million. These figures are rounded; tables and exports provide more precise amounts.                                       |
| Outstanding / receivables / exposure | Unsettled invoice balances: invoice amount minus allocated payments. Draft and written-off invoices contribute zero. Disputed invoices still contribute their balance. |
| Overdue                              | An outstanding invoice whose due date is before today in Asia/Karachi. An invoice due today is current.                                                                |
| Allocation                           | Assigning part or all of a recorded payment to a specific invoice. This is the step that reduces outstanding balances.                                                 |
| Credit limit                         | The approved maximum exposure for a customer. It is not a payment, a bank balance, or money already lent by Revora.                                                    |
| Workspace                            | One organization's customers, invoices, settings, and history. A demo creates an isolated workspace with fictional data.                                               |

Most screens use the latest loaded workspace snapshot. Background preparation is not pushed to the browser in real time; refresh to see worker changes. The “Live workspace” label does not mean a live bank feed.

Blue indicates an action or selection. Green status badges indicate successful/normal states, amber indicates pending work or caution, and red indicates an exception. Read the badge text as well as its color: a red reversed payment is not the same event as an overdue invoice.

## Overview

**Purpose:** understand outstanding money and choose the next action.

| Display                 | What it means                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Total receivables       | Sum of outstanding invoice balances across the workspace.                                                                                                                                                    |
| Overdue amount          | The portion of receivables past its due date. The percentage is overdue divided by total receivables, rounded to a whole percent.                                                                            |
| Collected this month    | Approved allocations on non-reversed payments dated in the current Karachi calendar month. Unallocated bank receipts do not count.                                                                           |
| Average outstanding age | Sum of each outstanding balance multiplied by its age from invoice issue date, divided by total outstanding. Rounded to days. This is balance-weighted invoice age, not accounting DSO and not days overdue. |
| Cash coming in          | Monthly allocated collections versus the full amount of invoices issued in that month. Draft/written-off invoices are excluded. The period selector affects this chart and its total, not the summary cards. |
| Receivables aging       | Outstanding money grouped by days past due: Current, 1–30, 31–60, 61–90, 91–120, and more than 120 days. The “120+” label means more than 120; day 120 remains in 91–120.                                    |
| Payment review strip    | Number of unmatched or partly allocated payments awaiting review.                                                                                                                                            |
| Priority accounts       | Up to five overdue customers with the highest collection priority score.                                                                                                                                     |
| Recent activity         | Recent audit entries describing workspace changes.                                                                                                                                                           |
| Promise strip           | Pending promises and their original promised amounts. Partially kept promises are included in Collections' active total but not this strip.                                                                  |

**Scenario:** an invoice is Rs 100,000, and Rs 40,000 has been allocated against it. Total receivables includes Rs 60,000. If it is five days late, the same Rs 60,000 appears in overdue and the 1–30 aging bucket. Recording another Rs 20,000 payment changes none of those balances until it is allocated.

**Edge cases and interpretation:**

- With no outstanding balances, age and overdue percentage display zero; the aging chart has no populated slices.
- Collections follow the payment's recorded date. Allocating an old receipt today changes that receipt's historical month. Reversing it removes its allocations from historical collection totals.
- Invoiced and collected lines are different populations; collections can exceed invoices issued in a month.
- The “open invoices” count includes invoices with a positive outstanding balance. Drafts, written-off records, and fully paid invoices are excluded; disputed invoices with a remaining balance are included.
- Export report downloads the workspace's invoice report. It is not restricted to the chart period.

## Customers

**Purpose:** maintain accounts and inspect a customer's financial history.

| Display               | Meaning                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Customer and contact  | Business name, city, contact person, and recorded contact details.                                            |
| Outstanding / overdue | That customer's unsettled balance and the part past due.                                                      |
| Payment terms         | Recorded number of days for the account. An invoice's explicit due date determines its actual overdue status. |
| Active / On hold      | Account status. On hold prevents reminder queuing; it does not remove outstanding balances.                   |

Search matches name, city, or contact. Filters show all, active, overdue, or on-hold accounts. Sort by name or highest balance. Tables display ten rows per page; exports include all matching rows, not just the visible page.

Click a customer to open its profile. The profile contains outstanding, overdue, limit, and available credit, plus separate **Invoices**, **Payments**, **Promises**, and **Interactions** views. The summary text is generated from rules and recorded balances, not an external AI opinion.

**Actions:** add a customer, import customer CSV, export filtered accounts, and open related invoice, interaction, promise, or credit actions through the profile.

**Scenario:** a distributor owes Rs 180,000 against a Rs 250,000 limit. Its profile shows Rs 70,000 available. A phone call can be recorded in Interactions without changing the balance.

**Edge cases:** duplicate customer names are rejected case-insensitively, including duplicates within an import batch. An invalid row aborts the entire batch. An on-hold account can still appear in overdue and credit views. The current application does not provide a general customer-edit or delete workflow; do not assume all recorded fields can be edited after creation.

## Invoices

**Purpose:** inspect amounts owed, due dates, settlement progress, and disputes.

The table shows the invoice reference, customer, due date, original amount, remaining balance, status, and available actions. Issue dates are captured when creating/importing invoices and included in the overview report. Search matches invoice number or customer name. Rows sort by earliest due date.

| Status              | Meaning                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Open                | Outstanding, current, and no payment has been allocated.                                                                                 |
| Partially paid      | Some payment has been allocated, with a current balance remaining.                                                                       |
| Overdue             | A balance remains after the due date. This label takes precedence over partially paid.                                                   |
| Paid                | Allocations cover the full invoice amount.                                                                                               |
| Disputed            | The invoice is flagged for review. Its balance remains in exposure; it cannot receive allocations until the dispute is cleared.          |
| Draft / Written off | Supported stored states with zero contribution to receivables. The current UI does not offer a full draft/publish or write-off workflow. |

The filters are All, Open, Overdue, Paid, and Disputed. Current partially paid invoices appear under All; the Open filter is an exact displayed-status filter.

**Actions:** create an invoice, import CSV, export matching invoices, inspect the customer, and flag or clear a dispute with a reason. Payment allocation happens in Payments.

**Scenario:** an invoice for Rs 50,000 receives Rs 15,000. Its balance is Rs 35,000. Before its due date it is partially paid; after that date it becomes overdue while retaining the same balance.

**Edge cases:** invoice numbers must be unique case-insensitively. Customers must already exist, issue dates cannot be future dates, and the due date cannot precede issue date. Allocations cannot exceed the remaining balance. Clearing a dispute recalculates its displayed settlement/overdue status. Due dates govern aging even if the customer's recorded terms differ.

## Collections

**Purpose:** prioritize follow-ups, track commitments, and prepare reminder text.

The summary shows overdue accounts matching the queue search, original amounts of pending/partially kept promises, and non-cancelled outbox jobs. The promise total is not the unpaid remainder of those promises. The outbox total includes historical prepared jobs; it is not a count of messages sent today.

### Collection queue

Each card displays the customer, salesperson, overdue balance, oldest overdue age, credit utilization, priority, and a rule-based follow-up explanation. All overdue customers are eligible to appear; on-hold accounts remain visible even though queuing a reminder is blocked.

Priority is a capped score from 0 to 100:

```text
round(oldest overdue days × 0.7
      + overdue rupees / 50,000
      + broken promise count × 15
      + 15 when credit utilization exceeds 90%)
```

Scores of 65+ are Critical, 35–64 High, and below 35 Normal. This is a prioritization heuristic, not a credit bureau rating or probability of default.

**Actions:** log an interaction, record a promise, queue a reminder, or inspect the account. Logging an interaction stores channel, direction, outcome, note, author, and time. It does not send a message or automatically create a financial commitment.

### Payment promises

The table displays customer, original promised amount, promised date, status, and note. A promise is account-wide rather than tied to one invoice.

| Status         | Current behavior                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Pending        | No qualifying newly allocated amount yet; due date has not passed.                             |
| Partially kept | Some qualifying amount, below the promise amount. This status remains even after its deadline. |
| Kept           | Qualifying allocations cover the promised amount.                                              |
| Broken         | Deadline passed with zero qualifying amount.                                                   |
| Cancelled      | Explicitly cancelled; excluded from subsequent recalculation.                                  |

**Scenario:** a customer promises Rs 30,000 by Friday. Rs 10,000 of qualifying allocations makes it partially kept; Rs 30,000 makes it kept. Existing allocations captured when the promise was created do not count again.

**Edge cases:** only one pending/partially kept promise can exist per customer. The amount cannot exceed outstanding exposure, and new dates must be today or later. Matching uses payment dates from the promise creation day through its deadline, plus allocations beyond the saved baseline. An old receipt dated before creation or a receipt dated after the deadline does not satisfy it. Reversing a payment can change a kept promise back to another status. Partial promises past their deadline still need human follow-up.

“Extract a draft” uses local English/Roman Urdu rules to suggest fields from a message. Inspect amount, date, and classification before saving, especially for ambiguous dates, mixed messages, or unsupported wording. Extraction alone saves no promise and sends no message.

### Reminder outbox

Queued means a local job exists. Prepared means the backend has prepared it for inspection. Cancelled means the job was cancelled. **None of these statuses means sent, delivered, or read. WhatsApp delivery is not connected.**

Each entry includes the customer, message, scheduling information, and status. Copy text for review or cancel the job.

**Edge cases:** no overdue balance, an on-hold customer, a duplicate non-cancelled job for the same Karachi day, or the daily limit blocks queuing. The reminder amount is the full outstanding balance, not only overdue invoices; the invoice placeholder selects the earliest-due outstanding invoice. Disputed balances remain included, so review the text before using it.

Cancelling a job permits a manual replacement within the limit. The automatic scheduler skips customers with any job dated today, including cancelled jobs. Disabling automatic scheduling does not cancel existing jobs or disable manual queuing.

## Payments

**Purpose:** record incoming funds and reconcile them against customer invoices.

Rows show date/reference, customer or unidentified status, bank/method details, receipt amount, allocation status, and actions. Search matches reference, description, or customer name. Rows sort newest payment date first. Filters are All, Unmatched, Partial, Matched, and Reversed.

| Status    | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| Unmatched | No allocations; the whole receipt is available to review. A customer can already be identified. |
| Partial   | Some receipt money is allocated; a remainder is available.                                      |
| Matched   | The entire receipt is allocated. Individual invoices may still be partly paid.                  |
| Reversed  | Its allocations were undone. The record is retained and cannot be allocated again.              |

**Actions:** record a payment, import a bank CSV, review a suggested match, choose manual allocations, reverse an allocated payment with a reason, or export the filtered list.

Suggested matches use a known customer, invoice-reference text, customer-name words, and exact invoice amount. Otherwise they allocate oldest open invoices first. The confidence percentage is a rule score, capped at 98; it is not a statistical accuracy guarantee. Similar names or references require extra review. No suggestion means use manual selection; it does not mean the receipt is invalid.

**Scenario:** a Rs 90,000 receipt can settle invoices of Rs 40,000 and Rs 50,000 for the same customer. A Rs 100,000 receipt allocated to those invoices remains Partial with Rs 10,000 unallocated. A Rs 20,000 receipt fully assigned to a Rs 50,000 invoice is Matched while that invoice retains Rs 30,000 outstanding.

**Edge cases:**

- One receipt cannot be split across different customers. A receipt already assigned to one customer cannot be allocated to another.
- Each submitted allocation must be positive, fit the invoice balance, and fit the remaining receipt amount. Duplicate invoice IDs in one submission are rejected.
- Draft, written-off, disputed, or another customer's invoices cannot receive allocations. An overdue invoice with an underlying open state can.
- Import rejects duplicate bank/reference combinations, comparing reference case-insensitively. Future payment dates are rejected. Debit rows are skipped by the bank CSV importer; it is an incoming-payment workflow.
- Reversal restores affected invoice balances and recalculates promise status. It retains allocations as historical evidence, excludes them from collections, and does not issue a bank refund.
- Unmatched receipts with no allocations cannot use the reversal action. There is no general delete/edit receipt workflow in this pilot.
- The current table exposes Reverse only for Matched receipts. Although the backend supports reversing an allocated partial receipt, the UI does not yet expose that path.

## Credit management

**Purpose:** compare each customer's exposure with the approved limit and review proposed changes.

| Display               | Meaning                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Current exposure      | Outstanding amounts for customers matching the current search/filter.                                                                      |
| Total credit extended | Sum of approved limits across the whole workspace, including unused capacity.                                                              |
| Accounts over limit   | Workspace-wide count where outstanding is greater than the limit.                                                                          |
| Available credit      | Limit minus outstanding. A negative number is an excess, not extra capacity.                                                               |
| Utilization           | Outstanding divided by limit, shown as a percentage. With zero limit, the current display returns 100% if there is exposure, otherwise 0%. |

Filters are All, Over limit, and Overdue. Search and sorting follow the Customers behavior. The utilization bar may stop at its visual maximum while the numeric percentage exceeds 100%.

**Scenario:** a customer owes Rs 180,000 against a Rs 200,000 limit. A hypothetical Rs 40,000 order projects exposure of Rs 220,000 and an excess of Rs 20,000. The order checker does not save an order, reserve capacity, issue an invoice, or grant approval.

**Actions:** inspect the customer, check a proposed order amount, and save a new approved limit with a reason. Only an owner/admin can change limits. The decision is recorded in Activity.

**Edge cases:** a limit can be reduced below existing exposure; this does not reduce the debt. Disputed balances remain in exposure. A balance equal to its limit has zero availability but is not “over limit.” Invoice creation currently does not enforce credit limits; the warning is a human review aid, not an automatic order block.

## Activity center

**Purpose:** inspect the recorded history of workspace changes.

Entries show timestamp, actor, action type, and detail. Financial changes and their audit records are saved together. Scheduler entries identify automatic reminder preparation. Import events summarize a batch rather than creating a separate audit event for every row.

Search matches actor or detail. Category filters match action prefixes such as payment, invoice, promise, reminder, credit, or member. The All view also includes categories without their own filter, such as settings and customer actions. Export downloads every matching event, beyond the current ten-row page.

**Scenario:** to understand why an invoice balance reopened, find the corresponding payment reversal and inspect its reason, then review the receipt and customer profile.

**Edge cases:** activity is not a banking transaction feed, delivery log, or complete security event log. Merely opening a page, exporting data, and failed mutations do not create the same financial audit entries as successful changes. Customer interactions also have their own detailed history in the profile. There is no edit/delete action for audit entries in the UI.

## Settings

**Purpose:** inspect workspace identity, manage access, and configure local reminder preparation.

| Section           | What it displays or changes                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace details | Organization name, PKR currency, Asia/Karachi timezone, and your role. These are informational here.                                   |
| Your team         | Members and roles. The owner can change non-owner roles; ownership cannot be reassigned here.                                          |
| Invite member     | Creates a private single-use link that expires after 48 hours. Share it separately; no invitation email is sent.                       |
| Integrations      | WhatsApp not connected, bank/accounting CSV available, reply assistant running local rules.                                            |
| Collection rules  | Automatic scheduling switch, preparation hour (08:00–18:00 Karachi), daily limit (1–100), and reminder template (20–1,500 characters). |

The scheduler checks approximately every 30 seconds while the backend is running. Automatic queuing occurs from the configured hour through the 18:00 hour. Existing queued jobs are prepared on a tick even if automatic scheduling is disabled.

Use exact template placeholders `{{customer}}`, `{{invoice}}`, and `{{amount}}`, without internal spaces. Unsupported placeholders remain literal. The amount is a numeric rupee value; include your own `Rs`/`PKR` prefix in the template.

**Scenario:** set preparation to 10:00 and a daily limit of 20. With the backend running, eligible accounts are queued from 10:00 Karachi, subject to hold status, overdue balances, and same-day duplication rules. Inspect them in the outbox; no message is delivered automatically.

**Edge cases:** closing the frontend does not stop a running backend scheduler. Stopping the backend stops preparation. Lowering the limit does not remove existing jobs. Template changes affect newly queued text, not existing jobs. The scheduler iterates customer records; it does not use the Collection queue's priority sorting when a daily cap is reached.

## Permissions

| Role           | Current access                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Owner          | Financial and collection actions, credit/settings changes, invitations, and changes to non-owner roles.            |
| Admin          | Financial and collection actions, credit/settings changes, and invitations. Cannot change team roles or ownership. |
| Accountant     | Customer/invoice/payment actions and collection actions. Cannot change credit limits, settings, or roles.          |
| Collections    | Record interactions and promises, cancel promises, queue/cancel reminders.                                         |
| Sales / Viewer | Read-only workspace access.                                                                                        |

The backend enforces permissions. Some controls remain visible to read-only roles; an attempted mutation returns an error instead of saving. Visibility alone does not imply permission. All roles operate within their own organization.

## Common scenarios and recovery

| Situation                                            | Expected behavior / next step                                                                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New empty workspace                                  | Zero summaries and empty states. Add customers before invoices, then record and allocate receipts.                                                                                                                      |
| CSV import                                           | Download the template, retain unique headers, use decimal rupee amounts and valid dates, preview, then confirm. Customer references must resolve to an existing name or ID. A rejected batch saves no rows.             |
| Search returns no rows                               | Clear the query and status filter before assuming the record is missing. The All badge can show a workspace total even while the table is filtered.                                                                     |
| Another teammate changes the ledger                  | A stale revision is rejected and the workspace is refreshed. Review the new balances and retry the intended action; do not assume the rejected command saved.                                                           |
| Lost connection during save                          | Inspect the latest workspace/activity before retrying. A lost response can occur after a server commit. Duplicate-reference validation helps with imports but does not make every command automatically safe to repeat. |
| Loading or save in progress                          | Skeletons indicate loading; save buttons show progress and are disabled during the mutation. Errors remain visible with a retry or correction path.                                                                     |
| Mobile layout                                        | Navigation opens from the menu. Wide tables scroll inside their container; all columns may not fit at once.                                                                                                             |
| Payment was recorded but figures did not change      | Review and allocate it. Unallocated receipts do not settle invoices or satisfy promises.                                                                                                                                |
| Figures change after refresh without a manual action | Time-dependent overdue/promise statuses and the backend reminder worker can change the snapshot. Review dates and Activity.                                                                                             |

Implementation references: [financial calculations](shared/finance.ts), [mutation rules](shared/domain.ts), [CSV handling](shared/csv.ts), [reminder worker](server/services/reminder.worker.ts), [database structure](server/README.md), and [page components](src/pages).
