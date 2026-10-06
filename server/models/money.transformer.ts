import { FINANCE } from '../../shared/constants';

export const moneyTransformer = {
  to(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0 || value > FINANCE.maximumAmount) {
      throw new Error('Money must be a safe integer amount in paisa.');
    }

    return value;
  },
  from(value: string | number): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > FINANCE.maximumAmount) {
      throw new Error('Stored money is outside the supported range.');
    }

    return amount;
  },
};

export const signedMoneyTransformer = {
  to(value: number): number {
    if (!Number.isSafeInteger(value) || Math.abs(value) > FINANCE.maximumAmount) {
      throw new Error('Signed money must be a safe integer amount in paisa.');
    }

    return value;
  },
  from(value: string | number): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || Math.abs(amount) > FINANCE.maximumAmount) {
      throw new Error('Stored signed money is outside the supported range.');
    }

    return amount;
  },
};
