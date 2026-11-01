import { Check } from 'lucide-react';
import type { LoyaltyCard, LoyaltyProgram, LoyaltyTier } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useLang, type TranslationKey } from '../../lib/i18n';

const TIER_KEY: Record<LoyaltyTier, TranslationKey> = {
  bronze: 'loyalty.tier.bronze',
  silver: 'loyalty.tier.silver',
  gold: 'loyalty.tier.gold',
};

type Props = {
  storeName: string;
  member: LoyaltyCard | null;
  program: LoyaltyProgram;
};

export default function WalletCard({ storeName, member, program }: Props) {
  const { t, lang } = useLang();
  const reward = lang === 'ar' ? program.reward_ar : program.reward_en;
  const target = member?.stamps_target ?? program.stamps_target;

  return (
    <div
      className="relative overflow-hidden rounded-[20px] p-4 text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] sm:p-5"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--accent) 86%, #000) 0%, color-mix(in srgb, var(--accent) 55%, #000) 100%)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
            {storeName}
          </p>
          <p className="mt-1 truncate text-[18px] font-bold tracking-tight">
            {member ? member.name : t('loyalty.card.none')}
          </p>
          {member ? (
            <p className="text-[12px] tabular-nums text-white/70" dir="ltr">
              {member.phone || '—'}
            </p>
          ) : null}
        </div>
        {member ? (
          <span className="chip shrink-0 bg-white/20 text-white">
            {t(TIER_KEY[member.tier])}
          </span>
        ) : null}
      </div>

      {member ? (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
            {Array.from({ length: target }).map((_, index) => {
              const filled = index < member.stamps;
              return (
                <span
                  key={index}
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    background: filled
                      ? 'rgba(255,255,255,0.92)'
                      : 'rgba(255,255,255,0.22)',
                    color: 'color-mix(in srgb, var(--accent) 55%, #000)',
                  }}
                >
                  {filled ? <Check size={13} strokeWidth={3} /> : null}
                </span>
              );
            })}
          </div>

          <p className="mt-2 text-[12px] font-medium text-white/80">
            {t('loyalty.card.stamps', {
              done: formatNumber(lang, member.stamps),
              target: formatNumber(lang, target),
            })}
          </p>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/20 pt-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
                {t('loyalty.card.points')}
              </p>
              <p className="text-[20px] font-bold tabular-nums leading-tight">
                {formatNumber(lang, member.points)}
              </p>
            </div>
            <div className="min-w-0 text-end">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
                {t('loyalty.card.reward')}
              </p>
              <p className="truncate text-[13px] font-semibold">{reward}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[12px] text-white/75">
          {t('loyalty.emptyHint')}
        </p>
      )}
    </div>
  );
}
