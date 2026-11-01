import { KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type InviteInfo } from '../lib/api';
import { useLang } from '../lib/i18n';

/**
 * The page a restaurant's activation link opens.
 *
 * The platform owner never sets a password for somebody else: the holder of the
 * link opens it here, picks their own name, username and password, and the API
 * makes that account the restaurant's admin and signs them in.
 */
export default function ActivatePage() {
  const { t, lang, setLang } = useLang();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .inviteInfo(token)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const restaurant = info
    ? lang === 'ar'
      ? info.restaurant_ar
      : info.restaurant_en
    : '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || password.length < 8) {
      setError(t('team.credentials'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.acceptInvite(token, {
        name: name.trim(),
        username: username.trim(),
        password,
      });
      // The API set the session cookie; a clean load reads it into the app.
      window.location.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already been used')) setError(t('activate.used'));
      else if (message.includes('already in use')) setError(t('activate.taken'));
      else if (message.startsWith('403')) setError(t('activate.blocked'));
      else if (message.startsWith('422')) setError(t('team.credentials'));
      else if (message.startsWith('429')) setError(t('login.throttled'));
      else setError(t('activate.failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-5 sm:px-8">
        <span className="text-[20px] font-bold tracking-tight text-ink">
          {t('brand')}
        </span>
        <button
          type="button"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          aria-label={t('top.language')}
          className="btn-quiet h-10 min-h-0 px-3 text-[13px]"
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-4 pb-16">
        <div className="card p-6 sm:p-8">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <KeyRound size={22} strokeWidth={1.7} />
          </span>

          {loading ? (
            <div className="mt-5 flex flex-col gap-2">
              <div className="skeleton h-6 w-2/3 rounded-field" />
              <div className="skeleton h-10 rounded-field" />
              <div className="skeleton h-10 rounded-field" />
            </div>
          ) : invalid ? (
            <>
              <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink">
                {t('activate.invalid')}
              </h1>
              <p className="mt-1 text-[14px] text-ink-2">
                {t('activate.invalidHint')}
              </p>
              <Link to="/login" className="btn-primary mt-5 h-11 min-h-0">
                {t('login.title')}
              </Link>
            </>
          ) : info?.is_used ? (
            <>
              <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink">
                {t('activate.used')}
              </h1>
              <p className="mt-1 text-[14px] text-ink-2">
                {t('activate.usedHint')}
              </p>
              <Link to="/login" className="btn-primary mt-5 h-11 min-h-0">
                {t('login.title')}
              </Link>
            </>
          ) : info?.is_blocked ? (
            <>
              <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink">
                {t('activate.blocked')}
              </h1>
              <p className="mt-1 text-[14px] text-ink-2">
                {t('activate.blockedHint')}
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink">
                {t('activate.title')}
              </h1>
              <p className="mt-1 text-[14px] text-ink-2">
                {t('activate.subtitle', { restaurant })}
              </p>

              <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-ink-2">
                    {t('activate.name')}
                  </span>
                  <input
                    className="field h-11"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(null);
                    }}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-ink-2">
                    {t('activate.username')}
                  </span>
                  <input
                    className="field h-11"
                    dir="ltr"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="username"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setError(null);
                    }}
                    maxLength={60}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-ink-2">
                    {t('activate.password')}
                  </span>
                  <input
                    className="field h-11"
                    dir="ltr"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                    maxLength={200}
                  />
                  <span className="mt-1 block text-[12px] text-ink-2">
                    {t('activate.passwordHint')}
                  </span>
                </label>

                {error ? (
                  <p
                    role="alert"
                    className="text-[13px] font-medium text-[color:var(--danger)]"
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary mt-1 h-12 min-h-0"
                >
                  {submitting ? t('menu.saving') : t('activate.submit')}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[12px] text-ink-2">
          {t('activate.alreadyHave')}{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-medium text-[color:var(--accent)]"
          >
            {t('login.title')}
          </button>
        </p>
      </main>
    </div>
  );
}
