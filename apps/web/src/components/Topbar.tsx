import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { isOwner } from '../lib/roles';
import { useTheme } from '../lib/theme';
import NotificationsMenu from './NotificationsMenu';
import UserMenu from './UserMenu';

type Props = {
  onOpenMenu: () => void;
  onOpenPos: () => void;
};

export default function Topbar({ onOpenMenu, onOpenPos }: Props) {
  const { t, lang, toggleLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const owner = isOwner(user?.role);

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t('nav.dashboard')}
          className="icon-btn lg:hidden"
        >
          <Menu size={18} />
        </button>

        <label className="relative hidden flex-1 items-center md:flex md:max-w-[360px]">
          <Search
            size={16}
            className="pointer-events-none absolute start-3 text-ink-2"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('top.search')}
            className="field ps-9"
            aria-label={t('top.search')}
          />
        </label>

        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={t('top.language')}
            className="btn-quiet h-11 min-h-0 px-3 text-[13px]"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('top.theme')}
            className="icon-btn"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {/* The owner never rings up a ticket: the till shortcut is noise. */}
          {owner ? null : <NotificationsMenu />}
          <UserMenu />
          {owner ? null : (
            <button
              type="button"
              onClick={onOpenPos}
              className="btn-primary hidden sm:inline-flex"
            >
              {t('top.openPos')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
