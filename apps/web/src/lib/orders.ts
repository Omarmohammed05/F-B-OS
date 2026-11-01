import type { OrderChannel, PaymentMethod } from './api';
import type { TranslationKey } from './i18n';

export const CHANNEL_KEY: Record<OrderChannel, TranslationKey> = {
  dine_in: 'pos.dineIn',
  takeaway: 'pos.takeaway',
  delivery: 'pos.delivery',
};

export const PAYMENT_KEY: Record<PaymentMethod, TranslationKey> = {
  cash: 'pos.cash',
  card: 'pos.card',
  wallet: 'pos.wallet',
};
