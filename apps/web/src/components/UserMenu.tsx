import { LogOut, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { ROLE_LABEL_KEY } from '../lib/roles';

/** Who is signed in, with the way back into the tour and the way out. */
export default function UserMenu() {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const initial = (user.name || user.username || '?').trim().charAt(0);
  const roleKey = ROLE_LABEL_KEY[user.role] ?? 'team.role.cashier';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('auth.account')}
        aria-expanded={open}
        className="icon-btn"
      >
        <span className="text-[13px] font-bold uppercase">{initial}</span>
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-[240px] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[14px] font-semibold text-ink">
              {user.name}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-ink-2">
              {t(roleKey)}
              {user.username ? ` · ${user.username}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/onboarding');
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-start text-[13px] text-ink transition-colors duration-150 hover:bg-surface-2"
          >
            <Sparkles size={15} className="text-ink-2" />
            {t('auth.tour')}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut().then(() => navigate('/login', { replace: true }));
            }}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-start text-[13px] font-medium text-[color:var(--danger)] transition-colors duration-150 hover:bg-surface-2"
          >
            <LogOut size={15} />
            {t('auth.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
