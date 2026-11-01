import type { Lang } from './i18n';

// Latin digits in both languages: operators read prices fastest that way.
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US');

export function formatNumber(lang: Lang, value: number, digits = 0) {
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrency(lang: Lang, value: number, currency = 'EGP') {
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value);
}

/** A `2026-11` month key as a month and year, in the reader's own language. */
export function formatMonth(lang: Lang, key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(lang), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year || 2000, (month || 1) - 1, 1));
}

export function formatDayShort(lang: Lang, iso: string) {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

export function formatDayLong(lang: Lang, iso: string) {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatClock(lang: Lang, iso: string | null) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale(lang), {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Minutes worked as "7h 35m" (Arabic letters, Latin digits like every figure). */
export function formatDuration(lang: Lang, minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const h = formatNumber(lang, hours);
  const m = formatNumber(lang, rest);
  if (!hours) return lang === 'ar' ? `${m} د` : `${m}m`;
  return lang === 'ar' ? `${h} س ${m} د` : `${h}h ${m}m`;
}

export function formatPercent(lang: Lang, value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(lang, value, 1)}%`;
}

// Ingredient costs are often fractions of a pound (0.038 for milk), so the
// recipe screens need more precision than a menu price.
export function formatMoney(
  lang: Lang,
  value: number,
  currency = 'EGP',
  digits = 2,
) {
  const scale = 10 ** digits;
  const hasFraction = Math.round(value * scale) % scale !== 0;
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency,
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value);
}
