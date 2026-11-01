import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n';

export default function NotFound() {
  const { t } = useLang();

  return (
    <section className="card mx-auto mt-8 w-full max-w-[520px] p-8 text-center">
      <p className="text-[15px] font-semibold text-ink">{t('notFound.title')}</p>
      <p className="mt-1 text-[13px] text-ink-2">{t('notFound.body')}</p>
      <Link to="/" className="btn-primary mt-5">
        {t('notFound.back')}
      </Link>
    </section>
  );
}
