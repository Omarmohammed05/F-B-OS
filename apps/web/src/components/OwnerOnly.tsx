import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { isOwner } from '../lib/roles';

/**
 * The platform owner's screens. The API refuses these routes to anyone else
 * anyway; this only keeps a typed URL from showing an empty page.
 */
export default function OwnerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLang();

  if (!isOwner(user?.role)) {
    return (
      <div className="card mx-auto flex max-w-[520px] flex-col items-center gap-2 p-8 text-center">
        <ShieldAlert size={22} className="text-ink-2" />
        <p className="text-[15px] font-semibold text-ink">{t('owner.refused')}</p>
        <p className="text-[13px] text-ink-2">{t('owner.refusedHint')}</p>
      </div>
    );
  }
  return <>{children}</>;
}
