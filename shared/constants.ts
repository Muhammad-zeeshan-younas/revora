export const FINANCE = {
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  paisaPerRupee: 100,
  maximumAmount: 1_000_000_000_000,
  millisecondsPerDay: 86_400_000,
} as const;

export const COLLECTIONS = {
  maximumBatchRows: 1_000,
  maximumCsvBytes: 1_500_000,
  workerIntervalMs: 30_000,
  workerLeaseMs: 5 * 60_000,
  maximumReminderAgeMs: 24 * 60 * 60_000,
  earliestReminderHour: 8,
  latestReminderHour: 18,
  maximumDailyReminders: 100,
} as const;

export const SESSION = {
  cookieName: 'revora_session',
  durationMs: 8 * 60 * 60 * 1_000,
  invitationDurationMs: 48 * 60 * 60 * 1_000,
  passwordResetDurationMs: 30 * 60 * 1_000,
  minimumPasswordLength: 12,
} as const;
