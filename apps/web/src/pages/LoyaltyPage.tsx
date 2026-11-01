import { Check, Gift, Plus, Stamp, Trash2, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import WalletCard from '../components/loyalty/WalletCard';
import { api, type LoyaltyData, type LoyaltyProgram } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useLang, type TranslationKey } from '../lib/i18n';
import { useAppData } from '../lib/store';

type Draft = {
  stamps_target: string;
  points_per_currency: string;
  reward_ar: string;
  reward_en: string;
};

const TIER_KEY: Record<string, TranslationKey> = {
  bronze: 'loyalty.tier.bronze',
  silver: 'loyalty.tier.silver',
  gold: 'loyalty.tier.gold',
};

const TIER_TONE: Record<string, string> = {
  bronze: '#B07B4F',
  silver: '#8E8E93',
  gold: '#C8961E',
};

function toDraft(program: LoyaltyProgram): Draft {
  return {
    stamps_target: String(program.stamps_target),
    points_per_currency: String(program.points_per_currency),
    reward_ar: program.reward_ar,
    reward_en: program.reward_en,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink-2">
        {text}
      </span>
      {children}
    </label>
  );
}

export default function LoyaltyPage() {
  const { t, lang } = useLang();
  const { data } = useAppData();
  const currency = data?.tenant.currency ?? 'EGP';
  const storeName =
    (lang === 'ar' ? data?.tenant.name_ar : data?.tenant.name_en) ?? '';

  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [enrollId, setEnrollId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    api
      .loyalty()
      .then((result) => {
        if (cancelled) return;
        setLoyalty(result);
        setDraft(toDraft(result.program));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const apply = (next: LoyaltyData) => {
    setLoyalty(next);
    setDraft(toDraft(next.program));
    setActionError(null);
    setFormError(null);
    setEnrollId('');
  };

  const runCard = (id: number, task: Promise<LoyaltyData>) => {
    setBusyId(id);
    setActionError(null);
    task
      .then(apply)
      .catch((err) =>
        setActionError(
          String(err).includes('409') ? t('loyalty.cardFull') : t('loyalty.actionError'),
        ),
      )
      .finally(() => setBusyId(null));
  };

  const openWallet = (id: number) => {
    setBusyId(id);
    setActionError(null);
    api
      .loyaltyWalletLink(id)
      .then(({ save_url }) => window.open(save_url, '_blank', 'noopener'))
      .catch(() => setActionError(t('loyalty.wallet.error')))
      .finally(() => setBusyId(null));
  };

  const toggleProgram = () => {
    if (!loyalty) return;
    setBusy(true);
    setActionError(null);
    api
      .updateLoyaltyProgram({ is_active: !loyalty.program.is_active })
      .then(apply)
      .catch(() => setActionError(t('loyalty.actionError')))
      .finally(() => setBusy(false));
  };

  const enroll = () => {
    const customerId = Number(enrollId);
    if (!customerId) return;
    setBusy(true);
    setActionError(null);
    api
      .enrollLoyaltyCard(customerId)
      .then(apply)
      .catch(() => setActionError(t('loyalty.actionError')))
      .finally(() => setBusy(false));
  };

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError(null);
  };

  const dirty = Boolean(
    draft && loyalty && JSON.stringify(draft) !== JSON.stringify(toDraft(loyalty.program)),
  );

  const saveProgram = () => {
    if (!draft) return;
    const target = Number(draft.stamps_target);
    const rate = Number(draft.points_per_currency);
    const rewardAr = draft.reward_ar.trim();
    const rewardEn = draft.reward_en.trim();

    if (!rewardAr || !rewardEn) {
      setFormError(t('loyalty.required'));
      return;
    }
    if (
      !Number.isInteger(target) ||
      target < 2 ||
      target > 20 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 10
    ) {
      setFormError(t('loyalty.invalid'));
      return;
    }

    setSaving(true);
    setFormError(null);
    api
      .updateLoyaltyProgram({
        stamps_target: target,
        points_per_currency: rate,
        reward_ar: rewardAr,
        reward_en: rewardEn,
      })
      .then((next) => {
        apply(next);
        setSaved(true);
      })
      .catch(() => setFormError(t('loyalty.invalid')))
      .finally(() => setSaving(false));
  };

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
          {t('loyalty.title')}
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">{t('loyalty.subtitle')}</p>
      </div>
      {loyalty ? (
        <button
          type="button"
          onClick={toggleProgram}
          disabled={busy}
          aria-pressed={loyalty.program.is_active}
          className="btn-quiet h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
        >
          <span
            className="relative inline-block h-5 w-9 rounded-full transition-colors"
            style={{
              background: loyalty.program.is_active
                ? 'var(--success)'
                : 'var(--line)',
            }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              style={{ insetInlineStart: loyalty.program.is_active ? 18 : 2 }}
            />
          </span>
          {loyalty.program.is_active
            ? t('loyalty.active')
            : t('loyalty.paused')}
        </button>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="card p-5">
          <div className="skeleton h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
          <div className="skeleton mt-2 h-10 rounded-field" />
        </div>
      </div>
    );
  }

  if (loadFailed || !loyalty || !draft) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-[14px] text-ink-2">{t('loyalty.loadError')}</p>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px]"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const { cards, summary, program, available } = loyalty;
  const member = cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={t('loyalty.summary.members')}
          value={formatNumber(lang, summary.members)}
        />
        <Stat
          label={t('loyalty.summary.stamps')}
          value={formatNumber(lang, summary.stamps_in_progress)}
        />
        <Stat
          label={t('loyalty.summary.ready')}
          value={formatNumber(lang, summary.rewards_ready)}
        />
        <Stat
          label={t('loyalty.summary.redeemed')}
          value={formatNumber(lang, summary.rewards_redeemed)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">
                {t('loyalty.card.preview')}
              </h2>
              {member ? (
                <span className="text-[12px] text-ink-2">
                  {t('loyalty.card.redeemed', {
                    count: formatNumber(lang, member.rewards_redeemed),
                  })}
                </span>
              ) : null}
            </div>
            <WalletCard storeName={storeName} member={member} program={program} />

            {member ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="chip"
                    style={{
                      color: TIER_TONE[member.tier],
                      background: `color-mix(in srgb, ${TIER_TONE[member.tier]} 14%, transparent)`,
                    }}
                  >
                    {t(TIER_KEY[member.tier])}
                    <span className="tabular-nums">
                      {formatNumber(lang, member.points)}
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-2">
                    {member.next_tier
                      ? t('loyalty.card.toNext', {
                          points: formatNumber(lang, member.next_tier.points),
                          tier: t(TIER_KEY[member.next_tier.tier]),
                        })
                      : t('loyalty.card.topTier')}
                  </span>
                </div>
                {member.reward_ready ? (
                  <button
                    type="button"
                    onClick={() =>
                      runCard(member.id, api.redeemLoyaltyCard(member.id))
                    }
                    disabled={busyId === member.id}
                    className="btn-primary h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
                  >
                    <Gift size={16} />
                    {t('loyalty.card.rewardReady')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      runCard(member.id, api.stampLoyaltyCard(member.id))
                    }
                    disabled={busyId === member.id}
                    className="btn-quiet h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
                  >
                    <Stamp size={16} />
                    {t('loyalty.stamp')}
                  </button>
                )}
                {loyalty.wallet.enabled ? (
                  <button
                    type="button"
                    onClick={() => openWallet(member.id)}
                    disabled={busyId === member.id}
                    className="btn-quiet h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
                  >
                    <Wallet size={16} />
                    {t('loyalty.wallet.save')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="text-[15px] font-semibold text-ink">
              {t('loyalty.enroll')}
            </h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
              {t('loyalty.enrollHint')}
            </p>
            {available.length === 0 ? (
              <p className="mt-3 text-[13px] font-medium text-ink-2">
                {t('loyalty.allEnrolled')}
              </p>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <select
                  className="field"
                  value={enrollId}
                  onChange={(event) => setEnrollId(event.target.value)}
                  aria-label={t('loyalty.enroll')}
                >
                  <option value="">{t('loyalty.enrollPlaceholder')}</option>
                  {available.map((guest) => (
                    <option key={guest.id} value={guest.id}>
                      {guest.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={enroll}
                  disabled={!enrollId || busy}
                  className="btn-primary h-11 min-h-0 shrink-0 px-3 text-[14px] disabled:opacity-50"
                >
                  <Plus size={16} />
                  {t('loyalty.enroll')}
                </button>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-[15px] font-semibold text-ink">
              {t('loyalty.tier')}
            </h2>
            <div className="mt-2 flex flex-col gap-1.5">
              {(['gold', 'silver', 'bronze'] as const).map((tier) => (
                <div
                  key={tier}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span
                    className="chip"
                    style={{
                      color: TIER_TONE[tier],
                      background: `color-mix(in srgb, ${TIER_TONE[tier]} 14%, transparent)`,
                    }}
                  >
                    {t(TIER_KEY[tier])}
                  </span>
                  <span className="tabular-nums font-medium text-ink">
                    {formatNumber(lang, summary.tiers[tier])}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card overflow-hidden">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <p className="text-[15px] font-semibold text-ink">
                {t('loyalty.empty')}
              </p>
              <p className="text-[13px] text-ink-2">{t('loyalty.emptyHint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[14px]">
                <thead>
                  <tr className="table-head">
                    <th className="px-4 py-2.5 text-start font-semibold">
                      {t('loyalty.member')}
                    </th>
                    <th className="px-4 py-2.5 text-start font-semibold">
                      {t('loyalty.progress')}
                    </th>
                    <th className="px-4 py-2.5 text-start font-semibold">
                      {t('loyalty.card.points')}
                    </th>
                    <th className="w-28 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr
                      key={card.id}
                      className="border-t border-line align-middle"
                      style={
                        member?.id === card.id
                          ? { background: 'var(--accent-soft)' }
                          : undefined
                      }
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(card.id)}
                          className="flex flex-col items-start text-start"
                        >
                          <span className="font-medium text-ink hover:underline">
                            {card.name}
                          </span>
                          <span className="text-[12px] text-ink-2" dir="ltr">
                            {card.phone || '—'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums text-ink" dir="ltr">
                            {formatNumber(lang, card.stamps)}/
                            {formatNumber(lang, card.stamps_target)}
                          </span>
                          {card.reward_ready ? (
                            <span
                              className="chip"
                              style={{
                                color: 'var(--success)',
                                background:
                                  'color-mix(in srgb, var(--success) 14%, transparent)',
                              }}
                            >
                              {t('loyalty.card.rewardReady')}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex gap-1" aria-hidden>
                          {Array.from({ length: card.stamps_target }).map(
                            (_, index) => (
                              <span
                                key={index}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    index < card.stamps
                                      ? 'var(--accent)'
                                      : 'var(--line)',
                                }}
                              />
                            ),
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {formatNumber(lang, card.points)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {card.reward_ready ? (
                            <button
                              type="button"
                              onClick={() =>
                                runCard(card.id, api.redeemLoyaltyCard(card.id))
                              }
                              disabled={busyId === card.id}
                              aria-label={t('loyalty.redeem')}
                              className="icon-btn h-9 w-9 disabled:opacity-50"
                              style={{ color: 'var(--success)' }}
                            >
                              <Gift size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                runCard(card.id, api.stampLoyaltyCard(card.id))
                              }
                              disabled={busyId === card.id}
                              aria-label={t('loyalty.stamp')}
                              className="icon-btn h-9 w-9 disabled:opacity-50"
                            >
                              <Stamp size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              runCard(card.id, api.removeLoyaltyCard(card.id))
                            }
                            disabled={busyId === card.id}
                            aria-label={t('loyalty.remove')}
                            className="icon-btn h-9 w-9 text-ink-2 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {actionError ? (
            <p className="border-t border-line px-4 py-2.5 text-[13px] font-medium text-[color:var(--danger)]">
              {actionError}
            </p>
          ) : null}
        </section>
      </div>

      <section className="card mx-auto w-full max-w-[820px] p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-ink">
          {t('loyalty.program')}
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
          {t('loyalty.programHint')}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Label text={t('loyalty.stampsTarget')}>
            <input
              className="field tabular-nums"
              inputMode="numeric"
              dir="ltr"
              value={draft.stamps_target}
              onChange={(event) => update({ stamps_target: event.target.value })}
            />
          </Label>
          <Label text={t('loyalty.pointsRate', { currency })}>
            <input
              className="field tabular-nums"
              inputMode="decimal"
              dir="ltr"
              value={draft.points_per_currency}
              onChange={(event) =>
                update({ points_per_currency: event.target.value })
              }
            />
          </Label>
          <Label text={t('loyalty.rewardAr')}>
            <input
              className="field"
              dir="rtl"
              value={draft.reward_ar}
              onChange={(event) => update({ reward_ar: event.target.value })}
            />
          </Label>
          <Label text={t('loyalty.rewardEn')}>
            <input
              className="field"
              dir="ltr"
              value={draft.reward_en}
              onChange={(event) => update({ reward_en: event.target.value })}
            />
          </Label>
        </div>

        {!program.is_active ? (
          <p className="mt-3 text-[13px] font-medium text-[color:var(--warning)]">
            {t('loyalty.pausedHint')}
          </p>
        ) : null}
        {formError ? (
          <p className="mt-3 text-[13px] font-medium text-[color:var(--danger)]">
            {formError}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={saveProgram}
            disabled={!dirty || saving}
            className="btn-primary h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
          >
            {saving ? t('loyalty.saving') : t('loyalty.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(program));
              setFormError(null);
            }}
            disabled={!dirty || saving}
            className="btn-quiet h-11 min-h-0 px-4 text-[14px] disabled:opacity-50"
          >
            {t('loyalty.discard')}
          </button>
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--success)]">
              <Check size={15} />
              {t('loyalty.saved')}
            </span>
          ) : dirty ? (
            <span className="text-[13px] font-medium text-ink-2">
              {t('loyalty.unsaved')}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
