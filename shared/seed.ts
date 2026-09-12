import {
  CommandType,
  CommunicationChannel,
  CustomerStatus,
  InteractionOutcome,
  InvoiceStatus,
  MessageDirection,
  PaymentMethod,
  PaymentStatus,
  PromiseStatus,
} from './enums';
import { offsetDate, today } from './finance';
import type { Workspace } from './schema';

export function emptyWorkspace(organizationId: string, name: string): Workspace {
  return {
    organization: { id: organizationId, name, currency: 'PKR', timezone: 'Asia/Karachi' },
    customers: [],
    invoices: [],
    payments: [],
    promises: [],
    interactions: [],
    audit: [],
    jobs: [],
    members: [],
    settings: {
      remindersEnabled: false,
      reminderHour: 10,
      dailyLimit: 40,
      template:
        'Assalam-o-Alaikum {{customer}}, this is a friendly reminder about {{invoice}}. Your outstanding balance is Rs {{amount}}. Please confirm your expected payment date. Thank you.',
    },
  };
}
export function createDemo(organizationId: string, now = new Date()): Workspace {
  const date = today(now);
  const workspace = emptyWorkspace(organizationId, 'Atlas Distributors');
  const customers = [
    ['Ali Traders', 'Ali Hassan', 'Lahore', 2500000],
    ['Metro Cash & Carry', 'Sara Ahmed', 'Karachi', 4500000],
    ['Al-Fatah Stores', 'Usman Malik', 'Lahore', 3500000],
    ['Imtiaz Super Market', 'Ayesha Khan', 'Karachi', 5000000],
    ['Bismillah Enterprises', 'Bilal Raza', 'Faisalabad', 1800000],
    ['Chase Up', 'Omar Farooq', 'Karachi', 3000000],
    ['Raja General Store', 'Hassan Raja', 'Rawalpindi', 1000000],
    ['Green Valley', 'Fatima Shah', 'Islamabad', 2500000],
    ['City Wholesale', 'Ahmed Iqbal', 'Multan', 1500000],
    ['Punjab Traders', 'Zain Ali', 'Gujranwala', 2000000],
    ['Fresh Basket', 'Hina Tariq', 'Lahore', 1200000],
    ['Noor & Sons', 'Saad Noor', 'Peshawar', 1600000],
  ] satisfies [string, string, string, number][];
  const amounts = [
    850000, 640000, 420000, 725000, 530000, 360000, 245000, 380000, 195000, 325000, 175000, 285000,
  ];
  const delays = [48, 14, 7, -12, 76, 22, 95, -20, 132, 35, -8, 18];
  customers.forEach(([name, contact, city, creditLimit], index) => {
    const customerId = `customer-${index + 1}`;
    workspace.customers.push({
      id: customerId,
      name,
      contact,
      city,
      creditLimit: creditLimit * 100,
      email: `${name.toLowerCase().replaceAll(/[^a-z]/g, '')}@example.com`,
      phone: `+9230012345${String(index).padStart(2, '0')}`,
      taxId: `NTN-${710001 + index}`,
      salesperson: index % 2 === 0 ? 'Adeel Khan' : 'Sana Malik',
      terms: 30,
      status: CustomerStatus.Active,
    });
    for (let part = 0; part < 3; part++) {
      const dueAt = offsetDate(date, -(delays[index] ?? 0) + part * 14);
      workspace.invoices.push({
        id: `invoice-${index}-${part}`,
        number: `INV-${2401 + index * 3 + part}`,
        customerId,
        issuedAt: offsetDate(dueAt > date ? date : dueAt, -30),
        dueAt,
        amount:
          Math.round((amounts[index] ?? 100000) * (part === 0 ? 1 : part === 1 ? 0.8 : 0.6)) * 100,
        paid: 0,
        status: index === 8 && part === 0 ? InvoiceStatus.Disputed : InvoiceStatus.Open,
        reference: `ERP-${8000 + index * 3 + part}`,
      });
    }
  });
  for (let month = 5; month >= 0; month--) {
    for (let week = 0; week < 4; week++) {
      const paymentDate = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
      paymentDate.setUTCMonth(paymentDate.getUTCMonth() - month);
      paymentDate.setUTCDate(Math.min(1 + week * 7, month === 0 ? Number(date.slice(-2)) : 28));
      const settledDate = paymentDate.toISOString().slice(0, 10);
      const amount = (420000 + (5 - month) * 63000 + week * 51000) * 100;
      const invoiceId = `settled-${month}-${week}`;
      const customerId = `customer-${week + 1}`;
      workspace.invoices.push({
        id: invoiceId,
        number: `INV-H${month}${week}`,
        customerId,
        issuedAt: offsetDate(settledDate, -35),
        dueAt: offsetDate(settledDate, -5),
        amount,
        paid: amount,
        status: InvoiceStatus.Open,
        reference: '',
      });
      workspace.payments.push({
        id: `payment-${month}-${week}`,
        customerId,
        amount,
        date: settledDate,
        reference: `HBL-${month}${week}9264`,
        description: `${workspace.customers[week]?.name ?? 'Customer'} settlement`,
        bank: 'HBL',
        method: PaymentMethod.BankTransfer,
        allocations: [{ invoiceId, amount }],
        status: PaymentStatus.Matched,
      });
    }
  }
  workspace.payments.unshift(
    {
      id: 'payment-review-1',
      customerId: '',
      amount: 85000000,
      date,
      reference: 'IBFT-928451',
      description: 'ALI TRADERS INV-2401',
      bank: 'HBL',
      method: PaymentMethod.BankTransfer,
      allocations: [],
      status: PaymentStatus.Unmatched,
    },
    {
      id: 'payment-review-2',
      customerId: '',
      amount: 45000000,
      date,
      reference: 'RAAST-18304',
      description: 'METRO CASH settlement',
      bank: 'Meezan Bank',
      method: PaymentMethod.Raast,
      allocations: [],
      status: PaymentStatus.Unmatched,
    },
    {
      id: 'payment-review-3',
      customerId: '',
      amount: 12500000,
      date: offsetDate(date, -1),
      reference: 'IBFT-928322',
      description: 'Online funds transfer',
      bank: 'HBL',
      method: PaymentMethod.BankTransfer,
      allocations: [],
      status: PaymentStatus.Unmatched,
    },
  );
  workspace.promises.push(
    {
      id: 'promise-1',
      customerId: 'customer-3',
      amount: 25000000,
      date: offsetDate(date, 2),
      createdAt: now.toISOString(),
      status: PromiseStatus.Pending,
      note: 'Confirmed over the phone. Transfer expected by afternoon.',
      baselineAllocations: [],
    },
    {
      id: 'promise-2',
      customerId: 'customer-6',
      amount: 36000000,
      date: offsetDate(date, 1),
      createdAt: now.toISOString(),
      status: PromiseStatus.Pending,
      note: 'Accounts team processing the payment.',
      baselineAllocations: [],
    },
    {
      id: 'promise-3',
      customerId: 'customer-1',
      amount: 50000000,
      date: offsetDate(date, -4),
      createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
      status: PromiseStatus.Broken,
      note: 'Promised a partial transfer last week.',
      baselineAllocations: [],
    },
  );
  for (const promise of workspace.promises) {
    promise.baselineAllocations = workspace.payments
      .filter(
        (payment) =>
          payment.customerId === promise.customerId && payment.status !== PaymentStatus.Reversed,
      )
      .map((payment) => ({
        paymentId: payment.id,
        amount: payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
      }));
  }
  const activity = [
    [CommandType.AllocatePayment, 'HBL settlement reconciled with 1 invoice', 'Hassan Ahmed'],
    [CommandType.CreatePromise, 'Al-Fatah Stores promised Rs 250,000', 'Sana Malik'],
    [
      CommandType.CreateInteraction,
      'Ali Traders · follow-up needed after a missed promise',
      'Adeel Khan',
    ],
    [CommandType.ImportPayments, '3 bank transactions imported for review', 'Hassan Ahmed'],
    [CommandType.UpdateCredit, 'Metro Cash & Carry credit limit reviewed', 'Hassan Ahmed'],
  ];
  activity.forEach(([action = '', detail = '', actor = ''], index) =>
    workspace.audit.push({
      id: `audit-${index}`,
      at: new Date(now.getTime() - (index * 23 + 8) * 60000).toISOString(),
      action,
      detail,
      actor,
      entityId: '',
    }),
  );
  workspace.interactions.push({
    id: 'interaction-1',
    customerId: 'customer-1',
    at: new Date(now.getTime() - 86400000).toISOString(),
    author: 'Adeel Khan',
    channel: CommunicationChannel.Phone,
    message: 'Accounts team requested another call tomorrow. Previous payment promise was missed.',
    outcome: InteractionOutcome.NoResponse,
    nextAction: 'Call the accounts manager',
    direction: MessageDirection.Outbound,
  });

  return workspace;
}
