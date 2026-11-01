import { useEffect, useState } from 'react';
import { useLang } from '../../lib/i18n';

/**
 * The minutes still on the kitchen's clock, ticking on the guest's own phone
 * between reads. The API sends the number; this only spends it, so a guest who
 * leaves the page open sees the wait shrink instead of freeze.
 */
export default function TimeLeft({
  minutes,
  className = '',
}: {
  minutes: number;
  className?: string;
}) {
  const { t } = useLang();
  const [left, setLeft] = useState(minutes);

  useEffect(() => {
    setLeft(minutes);
    if (minutes <= 0) return;
    const timer = window.setInterval(
      () => setLeft((value) => (value > 0 ? value - 1 : 0)),
      60000,
    );
    return () => window.clearInterval(timer);
  }, [minutes]);

  return (
    <span className={className}>
      {left > 0 ? t('track.left', { minutes: left }) : t('track.almost')}
    </span>
  );
}
