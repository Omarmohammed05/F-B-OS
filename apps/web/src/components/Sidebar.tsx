import { Moon, Sun } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { Branch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { NAV_GROUPS } from '../lib/nav';
import { isOwner, ROLE_LABEL_KEY } from '../lib/roles';
import { useTheme } from '../lib/theme';
import BranchMenu from './BranchMenu';
import SetupCard from './SetupCard';

type Props = {
  storeName: string;
  branches: Branch[];
  activeBranchId: number;
  setup: { completed: number; total: number };
  onNavigate?: () => void;
};

export default function Sidebar({
  storeName,
  branches,
  activeBranchId,
  setup,
  onNavigate,
}: Props) {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const owner = isOwner(user?.role);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto border-e border-line bg-surface px-3 py-5">
      <div className="px-2">
        <span className="text-[20px] font-bold tracking-tight text-ink">
          {t('brand')}
        </span>
      </div>

      <BranchMenu
        storeName={storeName}
        branches={branches}
        activeId={activeBranchId}
        onNavigate={onNavigate}
      />

      <nav className="flex flex-col gap-4">
        {NAV_GROUPS.filter((group) => !group.ownerOnly || owner).map((group) => (
          <div key={group.labelKey}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
              {t(group.labelKey)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items
                .filter((item) => !item.ownerOnly || owner)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `nav-item ${isActive ? 'nav-item-active' : ''}`
                        }
                      >
                        <Icon size={18} strokeWidth={1.7} />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </NavLink>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        <SetupCard completed={setup.completed} total={setup.total} />

        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-field border border-line bg-surface-2 p-0.5">
            {(['ar', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`flex-1 rounded-[9px] py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                  lang === code
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2'
                }`}
              >
                {code === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('top.theme')}
            className="icon-btn h-9 w-9"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex items-center gap-2.5 border-t border-line pt-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            {(user?.name ?? storeName).trim().charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-ink">
              {user?.name ?? storeName}
            </span>
            <span className="block truncate text-[12px] text-ink-2">
              {user ? t(ROLE_LABEL_KEY[user.role]) : storeName}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
