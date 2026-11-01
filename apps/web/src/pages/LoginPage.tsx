import { Lock, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';

export default function LoginPage() {
  const { t, lang, setLang } = useLang();
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Navigate to={user.needs_onboarding ? '/onboarding' : '/'} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(t('login.empty'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      const message = String(err);
      if (message.startsWith('403')) setError(t('login.inactive'));
      else if (message.startsWith('429')) setError(t('login.throttled'));
      else setError(t('login.failed'));
    } finally {
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
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Lock size={22} strokeWidth={1.7} />
          </span>
          <h1 className="mt-5 text-[26px] font-bold tracking-tight text-ink">
            {t('login.title')}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">
                {t('login.username')}
              </span>
              <div className="relative">
                <User
                  size={16}
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-2"
                />
                <input
                  className="field h-12 ps-9"
                  dir="ltr"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">
                {t('login.password')}
              </span>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-2"
                />
                <input
                  className="field h-12 ps-9"
                  dir="ltr"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
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
              className="btn-primary mt-1 h-12 w-full disabled:opacity-60"
            >
              {submitting ? t('login.signingIn') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="mt-4 rounded-field border border-line bg-surface px-4 py-3 text-center text-[12px] text-ink-2">
          {t('login.demo')}
        </p>
      </main>
    </div>
  );
}
