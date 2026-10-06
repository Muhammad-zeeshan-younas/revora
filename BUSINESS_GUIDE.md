# Revora: a plain-English business guide

This guide explains what Revora does, why a business would use it, what each screen means, and who could use it. You do not need a finance background to read it.

It describes the application as it currently works. Possible audiences and future ideas are identified separately from features that already exist.

## 1. What does Revora do?

Revora helps a business manage money that its customers still owe it.

Imagine a distributor that supplies groceries to shops. A **distributor** buys or receives goods and supplies them to other businesses. A **wholesaler** sells goods in larger quantities, usually to businesses that will resell them.

Some shops pay immediately. Other shops receive the goods now and agree to pay later. This arrangement is called **selling on credit**. Here, credit means permission to pay later; it does not mean Revora gives the shop a loan.

When payment is delayed, the distributor needs to know:

- Which shop owes money?
- How much does it owe?
- When was it supposed to pay?
- Has anyone contacted it?
- Did it promise a payment?
- Has money arrived, and which bill should that money pay?
- Should the shop be allowed to buy more goods before paying its old bills?

Revora brings these questions into one workspace. A **workspace** is the set of records for one company: its customers, bills, payments, follow-up notes, and team settings.

The finance name for money owed by customers is **accounts receivable**, or simply **receivables**. If a customer owes your business Rs 100,000, that Rs 100,000 is a receivable. It is money you expect to receive, rather than money already available in your bank account.

### A simple example

Your business supplies goods worth Rs 100,000 to Ali Traders. Ali Traders agrees to pay within 30 days.

You create a bill for Rs 100,000. Ali Traders later pays Rs 40,000, and your team assigns that payment to the bill.

Revora then shows:

| Question                                        | Answer                          |
| ----------------------------------------------- | ------------------------------- |
| How much was originally billed?                 | Rs 100,000                      |
| How much payment has been assigned to the bill? | Rs 40,000                       |
| How much is still owed?                         | Rs 60,000                       |
| Is the remaining amount late?                   | Only if its due date has passed |

The remaining Rs 60,000 is the **outstanding balance**. Outstanding means still unpaid.

## 2. What business problem is it intended to solve?

A business may keep customer bills in accounting software, payment information in bank statements, and follow-up conversations in phone notes or WhatsApp.

Someone then has to connect these pieces manually. A payment might arrive without a clear customer name. Two employees might contact the same shop. A customer might promise to pay on Friday, but nobody remembers to check on Friday.

Revora is intended to make that work easier by keeping the bill, payment, customer, and follow-up history connected.

| Problem                                           | How Revora helps                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Staff cannot quickly see who owes money           | Customer balances and the Overview show unpaid amounts            |
| Late bills get missed                             | Overdue filters and the collection queue highlight them           |
| Follow-ups depend on individual memory            | Interaction notes and payment promises provide shared records     |
| A bank receipt does not clearly identify the bill | Payment matching suggests possible bills for a person to review   |
| A customer keeps buying while old debt grows      | Credit management compares unpaid balances with an approved limit |
| Staff cannot explain why a balance changed        | Activity center records successful changes and their reasons      |

The expected business value is better follow-up, fewer matching mistakes, and a clearer view of money still owed. Whether it actually improves payment speed depends on the quality of the records and how the team uses it.

**Cash flow** means money coming into and going out of a business over time. Late customer payments can make it harder to pay suppliers or wages. Revora supports the customer-payment side of cash flow; it does not show every business expense or your complete bank position.

## 3. Who is the app intended for?

The original target is Pakistani distributors and wholesalers that sell to other businesses and allow customers time to pay.

This is a **B2B** use case. B2B means **business to business**: one business sells to another business. A distributor supplying a shop is B2B. A shop selling one drink to a walk-in shopper is a consumer sale.

Revora is most relevant when a business has several customers with separate bills, payment dates, and follow-up needs. A business where every customer pays immediately may have much less need for it.

The current application uses Pakistani rupees, shown as **PKR** or **Rs**, and the Asia/Karachi timezone for important date-based rules. These choices make the current version specific to that setting.

### The buyer and the daily user may be different people

The **buyer** is the person who decides whether the business should use or pay for the product. This could be the owner, finance manager, or operations manager.

The **daily users** may be accountants and collection staff. They enter receipts, match payments, call customers, and record what happened. Managers may use the app mainly to review balances and approve credit decisions.

The shops listed under Customers are usually customers of the business using Revora. They are not automatically Revora users and do not currently receive a customer login portal just because their account has been added.

## 4. A quick map of the screens

| Screen            | Main question it answers                                    |
| ----------------- | ----------------------------------------------------------- |
| Overview          | Where does our customer money stand today?                  |
| Customers         | What is the full account history for this customer?         |
| Invoices          | Which bills are unpaid, paid, late, or disputed?            |
| Collections       | Who should we follow up with, and what did they promise?    |
| Payments          | Which incoming payments belong to which bills?              |
| Credit management | How much more can a customer owe within its approved limit? |
| Activity center   | What changed, when, and who made the change?                |
| Settings          | Who has access, and how should reminder preparation work?   |

Settings, Help & getting started, and Sign out are available from the top-right avatar menu. The **avatar** is the small circle showing the signed-in user's initial.

The small number bubbles beside record tabs show how many records belong to each category. Customer categories can overlap: an active customer may also be overdue. Record-tab counts are workspace totals, so they can differ from the rows visible after a search. The collection queue count follows its queue search; promise and outbox counts show all entries in those views.

## 5. What each tab does

### 5.1 Overview

**Purpose:** give an owner or manager a quick picture of unpaid customer money and the work that needs attention.

This is the dashboard. A **dashboard** is a summary screen that brings important figures together.

| Figure or area          | Plain-English meaning                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Total receivables       | The total amount customers still owe on included invoices                                  |
| Overdue amount          | The part of that unpaid money whose payment deadline has passed                            |
| Collected this month    | Payments dated this month that have been assigned to invoices, excluding reversed payments |
| Average outstanding age | How old the unpaid invoice balances are, giving larger balances more weight                |
| Cash coming in chart    | A comparison of assigned collections and invoices issued across the selected months        |
| Receivables aging       | A breakdown of unpaid money by how late it is                                              |
| Priority accounts       | Overdue customers the app's rules place near the top of the follow-up list                 |
| Recent activity         | Recent recorded changes in the workspace                                                   |

**Aging** means grouping debt by how long it has been overdue. For example, Rs 60,000 that is ten days late goes in the 1–30 days group. The app also has Current, 31–60, 61–90, 91–120, and more than 120 days groups. Current means the due date has not passed.

An invoice due today is still current. It becomes overdue after that date if a balance remains.

Average outstanding age is measured from the invoice's issue date. It is different from days overdue, which are measured after the due date. Revora's average is also not a formal DSO calculation. **DSO**, or days sales outstanding, is an accounting measure of how long sales take to turn into cash; the dashboard uses a different calculation.

Example: a bill was issued 40 days ago and was due 30 days after issue. Its invoice age is 40 days, but it is only ten days overdue.

Use Overview to decide where to go next: Payments for receipts awaiting review, Collections for late accounts, or a customer profile for the full story.

The chart is based on recorded invoice and payment data. It is not a live bank feed or a prediction of future money. The chart's month selector changes the chart, rather than all the summary cards.

### 5.2 Customers

**Purpose:** keep each customer's identity and financial history together.

The main list shows the customer's business name, contact details, outstanding amount, overdue amount, payment terms, and status.

**Payment terms** describe the time allowed to pay. For example, **Net 30** means payment is expected within 30 days. Each invoice still has its own due date, and that date determines whether it is late.

You can add a customer, import customer records, search, filter, sort, export, and open a customer profile. An **import** brings records into the app from a file. An **export** downloads records from the app into a file.

| Filter        | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| All customers | Every recorded customer                                     |
| Active        | Customers recorded with active account status               |
| Overdue       | Customers with at least some unpaid money past its due date |
| On hold       | Customers whose account is marked as on hold                |

On hold does not erase what the customer owes. In this app it prevents reminders being queued for that account; it should not be interpreted as a complete automatic block on all sales activity.

#### The customer profile

Opening a customer shows its balances, credit limit, and available credit, followed by these views:

| Profile view | What it contains                                    |
| ------------ | --------------------------------------------------- |
| Invoices     | The customer's bills and remaining balances         |
| Payments     | Recorded receipts associated with the customer      |
| Promises     | Payment commitments the team has recorded           |
| Interactions | Notes about calls, messages, or other conversations |

The salesperson name is a display label. In Settings, an owner or admin can also assign the customer to a Sales account. A Sales user sees only customers explicitly assigned to that account, along with those customers' invoices, receipts, promises, and interactions.

Example: before calling Ali Traders, a staff member opens the profile and sees that Rs 60,000 remains unpaid, someone called yesterday, and the customer promised Rs 20,000 by Friday. This helps avoid an uninformed or repeated follow-up.

The customer profile now lets staff edit contact details, name, city, tax reference, salesperson, payment terms, and active/on-hold status. Credit limits use a separate approval action. Customer deletion is not available.

### 5.3 Invoices

**Purpose:** track the bills that create customer debt.

An **invoice** is a bill asking a customer to pay for goods or services. Its **issue date** is the date it was created or issued. Its **due date** is the payment deadline. Its **reference** or invoice number identifies that specific bill.

The list shows the invoice number, customer, due date, current amount, remaining balance, status, and available actions. You can create or import invoice records, search, filter, export, and flag or clear a dispute with a reason. Creating a record here tracks money owed; it does not issue a bill to the customer or submit one to an external system.

| Status         | Meaning in this app                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Open           | An unpaid invoice that is not yet overdue and has no assigned payment                                            |
| Partially paid | Some money has been assigned, but a balance remains and is not yet overdue                                       |
| Overdue        | A balance remains after the payment deadline                                                                     |
| Paid           | Assigned payments cover the full invoice amount                                                                  |
| Disputed       | A bill has been flagged because it needs investigation                                                           |
| Draft          | A supported unfinished-bill state that does not contribute to receivables                                        |
| Written off    | A supported state excluded from receivables, representing an amount treated as no longer collectible in this app |

A **dispute** is a disagreement about a bill. For example, a shop might say some goods were damaged or the quantity was wrong. A disputed invoice still contributes its unpaid balance to the amount owed, but payments cannot be assigned to it until the dispute is cleared.

Overdue takes priority over partially paid as a displayed status. A late invoice for Rs 100,000 with Rs 40,000 assigned is shown as overdue, with Rs 60,000 remaining.

There is no separate Partially paid filter in the current invoice tabs; those invoices appear under All. The Corrections action records internal amount adjustments and credit notes with reasons. A write-off request needs a different owner or admin to approve it. An approved write-off removes the outstanding amount from receivables without deleting the invoice or its history. These internal records do not issue a tax credit note; that document stays in the company's billing system. Draft publishing is still unavailable.

An invoice records what should be paid. It does not prove that money has reached the bank. That is handled through Payments.

### 5.4 Collections

**Purpose:** organize the work of asking customers to pay money they already owe.

In this context, **collections** means following up on unpaid customer bills. It does not mean a collection of products or a new sale.

#### Collection queue

A **queue** is a list of work waiting to be handled. The collection queue shows overdue customers, sorted using the app's priority rules.

Cards include the overdue amount, oldest overdue age, credit utilization, and a reason for follow-up. The rules consider how late the debt is, how much is overdue, broken promises, and heavy use of a customer's credit limit.

Labels such as Normal, High, and Critical indicate follow-up priority. They are not an official credit rating and do not prove that a customer will fail to pay.

Staff can record an interaction, record a payment promise, or queue a reminder.

An **interaction** is a conversation record: what was discussed, through which channel, whether it was incoming or outgoing, the outcome, and the next action. Recording a call or WhatsApp conversation stores a note; it does not place a call or send a message.

#### Promises to pay

A **promise to pay** is a recorded customer commitment, such as: "We will pay Rs 20,000 by Friday."

It helps the team check whether the customer followed through. It is not money received and does not reduce the unpaid balance.

| Promise status | Meaning                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| Pending        | No qualifying payment amount has been assigned yet, and the deadline has not passed |
| Partially kept | Some qualifying money has been assigned, but less than the promised amount          |
| Kept           | Qualifying assigned payments cover the promised amount                              |
| Broken         | The deadline passed without any qualifying assigned payment                         |
| Cancelled      | The commitment was cancelled in the app                                             |

The app checks qualifying payment dates and new allocations rather than counting payments that already satisfied earlier debt before the promise was recorded. A promise is for the customer's account, rather than one specific invoice.

There is an important detail: a partly fulfilled promise can remain Partially kept even after its deadline. Staff still need to review it; the absence of a Broken label does not mean it was fully fulfilled on time.

The reply assistant can suggest a promise draft from some English or Roman Urdu text. **Roman Urdu** is Urdu written with Latin letters. The assistant uses local text rules and requires a person to review the result; it is not connected to an external AI service.

The active promise summary adds the original amounts of pending and partially kept promises. It is not a calculation of their remaining unpaid portions.

#### Reminder outbox

An **outbox** holds reminders waiting to be prepared or reviewed.

| Reminder status | Meaning                                    |
| --------------- | ------------------------------------------ |
| Queued          | A reminder job has been saved locally      |
| Prepared        | The backend has prepared it for inspection |
| Cancelled       | The reminder job was cancelled             |

Without a configured Meta WhatsApp Business account, reminders remain local and can be inspected or copied. With a configured pilot account, an approved three-variable template, and recorded customer consent, a prepared reminder can be sent automatically. Delivery status appears separately as sending, accepted by Meta, sent, delivered, read, failed, or unknown. An unknown outcome is held for review instead of being resent automatically. Confirmed failures can be retried by staff. Replies are recorded in the customer interaction history when the sender phone uniquely identifies a customer. The local preview text may differ from the approved Meta template.

The Field drafts tab keeps a conversation note or payment promise on the current device while the page is open without a connection. Staff sync drafts after reconnecting. A disconnected page reload is not yet supported, and a draft is not a saved company record until sync succeeds.

Reminder text can include the full outstanding balance, including money not yet overdue or under dispute. Review the text before using it with a customer.

The outbox tab includes all its entries, including historical and cancelled ones. The summary card counts non-cancelled entries, so its number can be different from the tab badge.

### 5.5 Payments

**Purpose:** record incoming money and connect it to the correct customer bills.

A **payment receipt** is a record of money received. A bank **transaction reference** helps identify a particular transfer. Recording the receipt and deciding which bill it pays are two separate steps.

**Reconciliation** means checking records against one another and making sure they agree. Revora supports both allocating recorded receipts to invoices and reviewing a bank statement CSV against recorded receipts, allocations, dates, and the opening-to-closing balance. The latter stores exceptions for review; it does not replace reconciliation of an accounting general ledger.

**Allocation** means assigning a specific amount from a receipt to a specific invoice. This is the action that reduces the invoice's unpaid balance.

Example: a bank receipt for Rs 40,000 is recorded. Until someone assigns that Rs 40,000 to Ali Traders' invoice, Revora does not reduce that invoice's balance.

| Payment tab  | Meaning                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| All payments | Every recorded receipt                                                            |
| Unmatched    | None of the receipt amount has been assigned to invoices                          |
| Partial      | Some has been assigned, and some remains unassigned                               |
| Matched      | The whole receipt amount has been assigned                                        |
| Reversed     | Its invoice allocations have been undone, while the historical record is retained |

A matched payment does not necessarily mean its invoice is paid in full. A Rs 20,000 receipt can be fully matched to a Rs 50,000 invoice, leaving Rs 30,000 still owed.

One receipt can pay several invoices for the same customer. It cannot currently be split across different customers.

The app suggests matches using details such as a known customer, invoice reference, customer name, and matching amounts. A person reviews and approves the allocation. The confidence percentage is a score from those rules, rather than a guaranteed probability of correctness.

You can record payments manually, import incoming payments from a bank CSV, review suggestions, choose allocations, and export the list. **CSV** means comma-separated values: a simple table file that spreadsheet programs can read and write.

A **reversal** undoes a recorded allocation when it was wrong. It restores the relevant unpaid invoice balance. It does not move money out of the bank or issue a refund. The current payment table exposes this action for Matched receipts.

Duplicate bank/reference combinations are rejected during import to help prevent recording the same receipt twice. There is no direct bank connection in the current version.

### 5.6 Credit management

**Purpose:** help a business decide how much unpaid buying it is comfortable allowing for each customer.

A **credit limit** is the approved maximum unpaid amount for a customer. It is a business rule, rather than money deposited into the customer's account.

**Exposure** means the unpaid amount the business is currently relying on that customer to pay. In Revora it is the customer's outstanding invoice balance.

| Figure           | Example with a Rs 250,000 limit and Rs 180,000 owed |
| ---------------- | --------------------------------------------------- |
| Credit limit     | Rs 250,000 is the approved unpaid-balance limit     |
| Exposure         | Rs 180,000 is currently owed                        |
| Available credit | Rs 70,000 remains within the limit                  |
| Utilization      | 72% of the limit is used                            |

**Utilization** means how much of the limit is used. Here, Rs 180,000 divided by Rs 250,000 equals 72%.

**Projected exposure** asks what the debt would become if another order were added. With Rs 180,000 already owed, a proposed Rs 100,000 order would bring it to Rs 280,000, exceeding the limit by Rs 30,000.

An owner or admin can review and change the approved limit with a reason. The reason is recorded in Activity center. Reducing a limit does not reduce the customer's existing debt.

The tabs show All accounts, Over limit, and Overdue. Over limit means debt is greater than the approved limit. A customer exactly at its limit has no available credit but is not counted as over limit.

The summary named Total credit extended adds approved limits, including unused capacity. It is not the amount of money actually paid out or owed.

The projected-order check in Credit management is a decision aid and does not place an order. The separate Orders & stock page can reserve stock and credit for an actual internal order. Direct invoice creation checks existing order holds; fulfillment releases the hold and creates the receivable. These are internal records, not statutory sales documents.

### 5.7 Activity center

**Purpose:** explain recorded changes and provide a shared history.

An **audit log** is a record of actions, including who performed them, when, and what changed. Activity center is the app's view of that history.

It can help answer questions such as:

- Who recorded or matched this payment?
- Why did the customer's unpaid balance increase again?
- Who changed the credit limit, and why?
- When was this reminder prepared?

You can search, filter by categories such as payments or invoices, and export matching entries. All activity also contains categories that do not have their own tab, such as customer or settings changes.

The history helps explain successful workspace changes. It is not a live bank feed or a complete record of every login, page visit, failed action, or export. Detailed conversation notes are also available through customer profiles.

There is no screen for editing or deleting audit entries.

### 5.8 Settings, Help, and Sign out

These controls are in the top-right avatar menu.

**Settings** contains workspace information, team members, access roles, integration status, and collection rules.

**Permissions** are rules about which actions a user is allowed to perform. A **role** is a named set of those permissions, such as Accountant or Viewer.

Reminder settings include the preparation time, daily limit, and a local message template. A **template** is reusable text with placeholders. For example, `{{customer}}` is replaced with the customer's name. Live WhatsApp delivery also needs a separately approved Meta template and provider configuration.

An invitation creates a private, single-use link for a teammate. Invitation email delivery is not connected, so the link must be shared separately.

**Help & getting started** explains the basic steps: add customers, record invoices, follow up, and match payments.

**Sign out** ends the current login session. It does not delete customers, payments, or other business records.

## 6. Who uses which features inside a company?

| App role    | Likely person                                          | Current access                                                                                                   |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Owner       | Business owner or person responsible for the workspace | Financial work, collection work, credit/settings changes, invitations, and changes to non-owner team roles       |
| Admin       | Trusted finance or operations manager                  | Financial work, collection work, credit/settings changes, and invitations; cannot change team roles or ownership |
| Accountant  | Person who maintains bills and receipts                | Customer, invoice, payment, and collection actions; cannot change credit limits, settings, or team roles         |
| Collections | Staff who contact customers about unpaid bills         | Record conversations and promises, cancel promises, and queue or cancel reminders                                |
| Sales       | Salesperson following up their assigned accounts       | Only explicitly assigned customers are visible; can record interactions and payment promises for those customers |
| Viewer      | Manager or colleague who only needs to inspect records | Read-only workspace access                                                                                       |

**Read-only** means a user can inspect information without saving changes. Some action buttons can still be visible to a user who lacks permission; the backend rejects an unauthorized change.

Viewer users can inspect their organization's records. Sales assignments use authenticated member IDs in Settings rather than the free-text salesperson label. Sales users have an empty customer view until an owner or admin assigns accounts.

Team roles apply within the company's workspace. A company is not intended to see another company's records. Inviting a customer as a teammate is therefore different from giving that customer a restricted customer portal.

## 7. A complete example from sale to payment

The following example is fictional. It shows how the screens connect.

| Step | What happens in the business                                              | What the team does in Revora                                                                                  |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | A distributor agrees to sell to Ali Traders with payment allowed later    | Add Ali Traders in Customers and record its payment terms and approved credit limit                           |
| 2    | Goods worth Rs 100,000 are supplied                                       | Create an invoice for Rs 100,000 with its issue date and due date                                             |
| 3    | The due date passes without payment                                       | See Rs 100,000 overdue in Overview and Ali Traders in the collection queue                                    |
| 4    | A staff member calls, and the customer promises Rs 40,000 within two days | Record the call and create the Rs 40,000 payment promise                                                      |
| 5    | The customer sends Rs 40,000 within that deadline                         | Record or import the receipt in Payments                                                                      |
| 6    | The accountant confirms which invoice the receipt pays                    | Allocate Rs 40,000 to the Rs 100,000 invoice                                                                  |
| 7    | The balance is updated                                                    | The invoice and customer now show Rs 60,000 owed; qualifying allocation makes the Rs 40,000 promise Kept      |
| 8    | The shop wants another Rs 80,000 order                                    | Check projected exposure: Rs 60,000 plus Rs 80,000 equals Rs 140,000, then compare it with the approved limit |

The main distinction is between a bill, a promise, a receipt, and an allocation. The bill creates the recorded amount owed. The promise records an intention. The receipt records money received. The allocation connects that money to the bill and reduces its balance.

## 8. Possible audiences beyond the original target

These are possible audiences based on the workflow, rather than proven customer demand. The shared need is selling on credit and having to track later payments.

| Possible audience                               | Why the workflow may fit                                             | What needs checking before expanding                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Grocery and packaged-goods distributors         | Many shops, repeated invoices, and frequent follow-ups               | Their existing billing process and how receipts identify customers                                                    |
| Building-material wholesalers                   | Customers may buy supplies before paying for earlier orders          | Project references, longer payment terms, and dispute handling                                                        |
| Electrical, hardware, and spare-parts suppliers | Regular trade customers may keep running unpaid balances             | Product/order system connections and customer-level credit decisions                                                  |
| Pharmaceutical or medical-supply distributors   | Customer invoices and later collections may follow a similar pattern | Sector-specific requirements, return handling, and required record controls                                           |
| Textile or garment wholesalers                  | Buyers may pay in stages across several invoices                     | How deposits, returns, and adjustments are recorded                                                                   |
| Business service providers or agencies          | Business customers may receive invoices with future payment dates    | Recurring billing, contract details, and service disputes                                                             |
| Bookkeeping firms supporting several companies  | Staff may need a structured view of client receivables               | A suitable multi-company operating process and access controls; a dedicated accountant portal is not established here |

An **audience** can also mean the person inside the business: owners need a summary, accountants need accurate matching, collection staff need follow-up records, and managers need visibility into decisions.

The current version has a weaker fit for cash-only shops, personal budgeting, supplier-payment management, payroll, or businesses needing a complete stock-and-accounting system. Those workflows involve information and actions outside its current focus.

International businesses could be a future audience, but additional currencies, date conventions, languages, and local operating needs would require further work.

## 9. Current capabilities and future possibilities

| Area                  | What the current app does                                                  | What should not be assumed                                                    |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Customer debt         | Records invoices, remaining balances, due dates, and disputes              | A complete accounting package covering every business account                 |
| Follow-up             | Stores conversation notes, promises, priorities, and reminder text         | Automatic phone calls                                                         |
| WhatsApp              | Optional Meta Cloud API sender and signed delivery/reply webhook           | Live delivery before a provider account, approved template, and consent exist |
| Reply assistant       | Uses local English/Roman Urdu rules to draft some promise details          | A connected AI model that fully understands every message                     |
| Payments              | Records/imports receipts and supports reviewed invoice matching            | Collecting money online, issuing bank refunds, or a live bank feed            |
| Credit                | Compares debt with approved limits and records decisions                   | Lending money, guaranteeing repayment, or automatically blocking all orders   |
| Orders and stock      | Reserves internal stock and credit, then records an invoice on fulfillment | A full purchasing, warehouse, or statutory invoicing system                   |
| Documents and reports | Stores supporting PDFs/images and calculates monthly collection measures   | Replacing the source invoice or a general ledger                              |
| Data exchange         | Imports and exports CSV files                                              | Direct synchronization with banks or accounting systems                       |
| Company access        | Sign-in for provided accounts and invitations for teammates                | Open self-service registration or a customer payment portal                   |

An **ERP** is business software that may manage orders, stock, accounting, and other company operations together. Revora currently exchanges files rather than directly connecting to an ERP.

Future work could include live messaging, direct bank/accounting connections, stronger production operations, customer self-service, or financing features. These are possibilities, rather than capabilities available today.

**Working capital** is the money a business uses to keep everyday operations moving, such as buying stock and paying staff while waiting for customers to pay. Better collections can support that process, but the current Revora app does not provide working-capital loans.

The app is currently a development pilot. A **pilot** is an early version used to explore and validate the workflow. Password recovery and email verification need a configured sending domain. Authenticator MFA needs an encryption key. Production use still needs managed backups, secrets, and operational alert delivery.

## 10. How a business could judge whether it is useful

These are evaluation questions, not promised results or figures already measured by the app:

- Can staff explain each customer's unpaid balance without checking several separate files?
- Are late customers reviewed consistently?
- Are calls and promises recorded so another teammate can continue the work?
- Are unmatched receipts reviewed promptly?
- Are duplicate receipts and incorrect allocations caught before they affect decisions?
- Are credit-limit changes backed by a clear reason?
- Is less staff time spent finding information and repeating follow-ups?

The Overview shows overdue money, unallocated receipts and their value, receipts waiting at least seven days, and the number of due promises kept by their deadline. Time spent matching payments and other measures still require separate analysis.

Before judging results, the business needs a consistent process for keeping invoices, payment dates, allocations, and conversation notes up to date. An incomplete record can make a paid customer look unpaid or make a promise appear unfulfilled.

## 11. Finance and business terms to keep nearby

| Term                              | Simple meaning                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Accounts receivable / receivables | Money customers still owe the business                                                                      |
| Accounts payable                  | Money the business owes suppliers; a different workflow from the one Revora mainly handles                  |
| Invoice                           | A bill asking a customer to pay                                                                             |
| Outstanding balance               | The amount still unpaid                                                                                     |
| Debt                              | Money one person or business owes another                                                                   |
| Customer account                  | The customer's identity, balances, and related records in the business                                      |
| Supplier                          | A person or business that provides goods or services to your business                                       |
| Stock                             | Goods the business holds so it can sell them                                                                |
| Due date                          | The deadline for payment                                                                                    |
| Overdue                           | The payment deadline has passed and money remains unpaid                                                    |
| Aging                             | Grouping unpaid money by how late it is                                                                     |
| Payment terms                     | The agreed time allowed to pay                                                                              |
| Net 30                            | Payment is expected within 30 days                                                                          |
| Receipt                           | A record of incoming money                                                                                  |
| Allocation                        | Assigning receipt money to a particular bill                                                                |
| Reconciliation                    | Checking related records and making them agree                                                              |
| Collections                       | Following up to recover money already owed                                                                  |
| Promise to pay                    | A recorded commitment about payment amount and date                                                         |
| Credit limit                      | The approved maximum unpaid amount for a customer                                                           |
| Exposure                          | The amount currently owed and awaiting repayment                                                            |
| Available credit                  | Credit limit minus the outstanding balance                                                                  |
| Utilization                       | The percentage of the credit limit already used                                                             |
| Dispute                           | A disagreement about a bill that needs investigation                                                        |
| Reversal                          | Undoing a recorded allocation; it is not a bank refund                                                      |
| Write-off                         | Treating a debt as no longer collectible; Revora supports the stored state but not a full approval workflow |
| Cash flow                         | Money entering and leaving the business over time                                                           |
| Revenue                           | The value of sales; it is not necessarily cash already received                                             |
| Profit                            | What remains after relevant business costs; Revora's receivables totals do not calculate profit             |
| Audit log                         | Recorded history of actions and changes                                                                     |
| B2B                               | Business-to-business selling                                                                                |
| CSV                               | A simple table file used for importing or exporting records                                                 |
| ERP                               | A system that combines areas such as orders, stock, and accounting                                          |
| PKR / Rs                          | Pakistani rupees                                                                                            |
| Paisa                             | A smaller currency unit; 100 paisa equals Rs 1                                                              |
| K / M                             | Thousand / million; Rs 100K means Rs 100,000                                                                |

## 12. Further reading in this project

- [Tab guide](TAB_GUIDE.md): more detailed screen behavior and edge cases.
- [Development accounts](SEED_GUIDE.md): dummy logins and example records for trying the app.
- [Project README](README.md): setup, implemented features, and current integration limits.

This guide is based on those documents and the current pages, finance calculations, and permission rules in the repository. Audience suggestions are business-fit hypotheses and would need conversations with prospective users to validate.
