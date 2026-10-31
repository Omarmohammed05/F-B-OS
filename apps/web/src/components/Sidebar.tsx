import { ChevronDown, Globe, Moon, Store, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { NAV_GROUPS } from '../lib/nav';
import { useTheme } from '../lib/theme';
import SetupCard from './SetupCard';

type Props = {
  storeName: string;
  plan: string;
  setup: { completed: number; total: number };
  onNavigate?: () => void;
};

export default function Sidebar({ storeName, plan, setup, onNavigate }: Props) {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const [storeOpen, setStoreOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto border-e border-line bg-surface px-3 py-5">
      <div className="px-2">
        <span className="text-[20px] font-bold tracking-tight text-ink">
          {t('brand')}
        </span>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setStoreOpen((open) => !open)}
          aria-expanded={storeOpen}
          aria-label={t('store.switch')}
          className="flex w-full items-center gap-2.5 rounded-field border border-line bg-surface-2 px-3 py-2.5 text-start transition-colors duration-150 hover:bg-line/40"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Store size={16} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">
              {storeName}
            </span>
            <span className="block truncate text-[12px] text-ink-2">
              {plan}
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-ink-2" />
        </button>
        {storeOpen ? (
          <div className="absolute inset-x-0 top-full z-40 mt-1.5 rounded-field border border-line bg-surface p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => setStoreOpen(false)}
              className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-start text-[13px] font-medium text-ink hover:bg-surface-2"
            >
              <Store size={15} className="text-ink-2" />
              {storeName}
            </button>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-2 rounded-[8px] px-2.5 py-2 text-start text-[13px] text-ink-2"
            >
              {t('store.addBranch')}
            </button>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
              {t(group.labelKey)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2">
            <Globe size={15} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-ink">
              {t('store.owner')}
            </span>
            <span className="block truncate text-[12px] text-ink-2">
              {storeName}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
