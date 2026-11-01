import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { tabItemsFor } from '../lib/nav';
import { isOwner } from '../lib/roles';

export default function TabBar() {
  const { t } = useLang();
  const { user } = useAuth();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex items-stretch">
        {tabItemsFor(isOwner(user?.role)).map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 ${
                    isActive ? 'text-[color:var(--accent)]' : 'text-ink-2'
                  }`
                }
              >
                <Icon size={20} strokeWidth={1.7} />
                <span className="truncate px-1">{t(item.labelKey)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
