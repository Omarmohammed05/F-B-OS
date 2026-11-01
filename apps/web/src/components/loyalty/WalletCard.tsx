import { Check } from 'lucide-react';
import type { LoyaltyCard, LoyaltyProgram, LoyaltyTier } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useLang, type TranslationKey } from '../../lib/i18n';

const TIER_KEY: Record<LoyaltyTier, TranslationKey> = {
  bronze: 'loyalty.tier.bronze',
  silver: 'loyalty.tier.silver',
  gold: 'loyalty.tier.gold',
};

// Premium gold, matched to the Google Wallet pass: a metallic field with an
// espresso ornament. Arabic must never be letter-spaced — tracking breaks the
// joined script — so the small label style differs per language.
const INK = '#14110C';
const GOLD_FIELD =
  'linear-gradient(145deg, #E3C57C 0%, #C6A24A 36%, #A8842F 70%, #856520 100%)';

const ORNAMENT =
  '50,4 59.2,27.8 82.5,17.5 72.2,40.8 96,50 72.2,59.2 82.5,82.5 59.2,72.2 50,96 40.8,72.2 17.5,82.5 27.8,59.2 4,50 27.8,40.8 17.5,17.5 40.8,27.8';

type Props = {
  storeName: string;
  member: LoyaltyCard | null;
  program: LoyaltyProgram;
};

export default function WalletCard({ storeName, member, program }: Props) {
  const { t, lang } = useLang();
  const reward = lang === 'ar' ? program.reward_ar : program.reward_en;
  const target = member?.stamps_target ?? program.stamps_target;
  const label =
    lang === 'ar'
      ? 'text-[11px] font-semibold'
      : 'text-[10px] font-semibold uppercase tracking-[0.14em]';

  return (
    <div
      className="relative overflow-hidden rounded-[20px] p-4 shadow-[0_10px_30px_rgba(122,95,28,0.28)] sm:p-5"
      style={{ background: GOLD_FIELD, color: INK }}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="pointer-events-none absolute -top-9 -end-7 h-32 w-32 opacity-[0.14]"
        fill="none"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <polygon points={ORNAMENT} />
        <circle cx="50" cy="50" r="13" />
      </svg>

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/sufra-wallet-badge.png"
            alt=""
            className="h-7 w-7 shrink-0"
          />
          <p className="truncate text-[11px] font-semibold opacity-75">
            {storeName}
          </p>
        </div>
        {member ? (
          <span className="chip shrink-0 border border-[#14110C]/25 bg-[#14110C]/10 text-[#14110C]">
            {t(TIER_KEY[member.tier])}
          </span>
        ) : null}
      </div>

      <div className="relative mt-2 min-w-0">
        <p className="truncate text-[19px] font-bold tracking-tight">
          {member ? member.name : t('loyalty.card.none')}
        </p>
        {member ? (
          <p className="text-[12px] tabular-nums opacity-70" dir="ltr">
            {member.phone || '—'}
          </p>
        ) : null}
      </div>

      {member ? (
        <div className="relative">
          <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
            {Array.from({ length: target }).map((_, index) => {
              const filled = index < member.stamps;
              return (
                <span
                  key={index}
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    background: filled ? INK : 'transparent',
                    boxShadow: filled
                      ? 'none'
                      : 'inset 0 0 0 1.5px rgba(20,17,12,0.38)',
                    color: '#E3C57C',
                  }}
                >
                  {filled ? <Check size={13} strokeWidth={3} /> : null}
                </span>
              );
            })}
          </div>

          <p className="mt-2 text-[12px] font-medium opacity-80">
            {t('loyalty.card.stamps', {
              done: formatNumber(lang, member.stamps),
              target: formatNumber(lang, target),
            })}
          </p>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#14110C]/20 pt-3">
            <div className="min-w-0">
              <p className={`${label} opacity-70`}>{t('loyalty.card.points')}</p>
              <p className="text-[20px] font-bold tabular-nums leading-tight">
                {formatNumber(lang, member.points)}
              </p>
            </div>
            <div className="min-w-0 text-end">
              <p className={`${label} opacity-70`}>{t('loyalty.card.reward')}</p>
              <p className="truncate text-[13px] font-semibold">{reward}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="relative mt-4 text-[12px] opacity-75">
          {t('loyalty.emptyHint')}
        </p>
      )}
    </div>
  );
}
