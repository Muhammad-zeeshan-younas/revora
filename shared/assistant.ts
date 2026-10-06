import { FINANCE } from './constants';
import { ReplyCategory } from './enums';
import { offsetDate } from './finance';

enum ReplyAmountUnit {
  Crore = 'crore',
  Lakh = 'lakh',
  Lac = 'lac',
  Thousand = 'thousand',
  K = 'k',
}

const DISPUTE_REPLY_PATTERN = /dispute|incorrect|wrong amount|galat/;
const PAYMENT_CONFIRMATION_PATTERN = /paid|transferred|sent payment|bhej diya/;
const INVOICE_REQUEST_PATTERN = /invoice copy|send invoice/;
const PAYMENT_PROMISE_PATTERN = /will pay|transfer kar|pay by|payment on|kar doon|pay tomorrow/;
const REPLY_AMOUNT_PATTERN =
  /(?:rs\.?\s*|pkr\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(lakh|lac|crore|k\b|thousand)?/;
const ISO_DATE_IN_MESSAGE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;
const ISO_DATES_IN_MESSAGE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const TOMORROW_REPLY_PATTERN = /tomorrow|kal\b/;
const TODAY_REPLY_PATTERN = /today|aaj/;

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const AMOUNT_MULTIPLIERS: Record<ReplyAmountUnit, number> = {
  [ReplyAmountUnit.Crore]: 10_000_000,
  [ReplyAmountUnit.Lakh]: 100_000,
  [ReplyAmountUnit.Lac]: 100_000,
  [ReplyAmountUnit.Thousand]: 1_000,
  [ReplyAmountUnit.K]: 1_000,
};

export interface ReplyAnalysis {
  category: ReplyCategory;
  amount: number | null;
  date: string | null;
  explanation: string;
}

function classifyReply(message: string): ReplyCategory {
  if (DISPUTE_REPLY_PATTERN.test(message)) {
    return ReplyCategory.Dispute;
  }

  if (PAYMENT_CONFIRMATION_PATTERN.test(message)) {
    return ReplyCategory.PaymentConfirmation;
  }

  if (INVOICE_REQUEST_PATTERN.test(message)) {
    return ReplyCategory.InvoiceRequest;
  }

  if (PAYMENT_PROMISE_PATTERN.test(message)) {
    return ReplyCategory.PromiseToPay;
  }

  return ReplyCategory.GeneralQuestion;
}

function extractAmount(message: string): number | null {
  const withoutDates = message.replace(ISO_DATES_IN_MESSAGE_PATTERN, '');
  const match = REPLY_AMOUNT_PATTERN.exec(withoutDates);
  const amountText = match?.[1];

  if (!amountText) {
    return null;
  }

  const unit = match[2] as ReplyAmountUnit | undefined;
  const multiplier = unit ? AMOUNT_MULTIPLIERS[unit] : 1;
  const rupees = Number(amountText.replaceAll(',', '')) * multiplier;

  return Math.round(rupees * FINANCE.paisaPerRupee);
}

function extractPromiseDate(message: string, currentDate: string): string | null {
  const explicitDate = ISO_DATE_IN_MESSAGE_PATTERN.exec(message)?.[1];

  if (explicitDate) {
    return explicitDate;
  }

  const weekday = WEEKDAYS.findIndex((day) => message.includes(day));

  if (weekday >= 0) {
    const currentWeekday = new Date(`${currentDate}T00:00:00Z`).getUTCDay();
    const daysUntilNextWeekday = (weekday - currentWeekday + WEEKDAYS.length) % WEEKDAYS.length;

    return offsetDate(currentDate, daysUntilNextWeekday || WEEKDAYS.length);
  }

  if (TOMORROW_REPLY_PATTERN.test(message)) {
    return offsetDate(currentDate, 1);
  }

  return TODAY_REPLY_PATTERN.test(message) ? currentDate : null;
}

export function analyzeReply(message: string, currentDate: string): ReplyAnalysis {
  const normalizedMessage = message.toLowerCase();
  const category = classifyReply(normalizedMessage);

  return {
    category,
    amount: category === ReplyCategory.PromiseToPay ? extractAmount(normalizedMessage) : null,
    date: extractPromiseDate(normalizedMessage, currentDate),
    explanation:
      'Rule-based draft. Verify the amount and date with the customer before recording a promise.',
  };
}
