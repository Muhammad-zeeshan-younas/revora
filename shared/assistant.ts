import { ReplyCategory } from './enums';
import { offsetDate } from './finance';

export interface ReplyAnalysis {
  category:
    | ReplyCategory.PromiseToPay
    | ReplyCategory.PaymentConfirmation
    | ReplyCategory.Dispute
    | ReplyCategory.InvoiceRequest
    | ReplyCategory.GeneralQuestion;
  amount: number | null;
  date: string | null;
  explanation: string;
}
export function analyzeReply(message: string, date: string): ReplyAnalysis {
  const text = message.toLowerCase();
  const category = /dispute|incorrect|wrong amount|galat/.test(text)
    ? ReplyCategory.Dispute
    : /paid|transferred|sent payment|bhej diya/.test(text)
      ? ReplyCategory.PaymentConfirmation
      : /invoice copy|send invoice/.test(text)
        ? ReplyCategory.InvoiceRequest
        : /will pay|transfer kar|pay by|payment on|kar doon|pay tomorrow/.test(text)
          ? ReplyCategory.PromiseToPay
          : ReplyCategory.GeneralQuestion;
  const amountText = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  const match =
    /(?:rs\.?\s*|pkr\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(lakh|lac|crore|k\b|thousand)?/.exec(
      amountText,
    );
  const multiplier =
    match?.[2] === 'crore'
      ? 10_000_000
      : ['lakh', 'lac'].includes(match?.[2] ?? '')
        ? 100_000
        : ['k', 'thousand'].includes(match?.[2] ?? '')
          ? 1000
          : 1;
  const amount = match?.[1]
    ? Math.round(Number(match[1].replaceAll(',', '')) * multiplier * 100)
    : null;
  let promisedDate: string | null = /tomorrow|kal\b/.test(text)
    ? offsetDate(date, 1)
    : /today|aaj/.test(text)
      ? date
      : null;
  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (explicit) {
    promisedDate = explicit;
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days.findIndex((item) => text.includes(item));
  if (day >= 0) {
    promisedDate = offsetDate(date, (day - new Date(`${date}T00:00:00Z`).getUTCDay() + 7) % 7 || 7);
  }

  return {
    category,
    amount: category === ReplyCategory.PromiseToPay ? amount : null,
    date: promisedDate,
    explanation:
      'Rule-based draft. Verify the amount and date with the customer before recording a promise.',
  };
}
