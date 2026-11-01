import { Copy, Printer, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import MenuStand from '../components/qr/MenuStand';
import { api, type QrMenuData } from '../lib/api';
import { useLang } from '../lib/i18n';

/**
 * The QR menu link and the stand that carries it.
 *
 * One public link per branch; a table number in the query string is what makes
 * the guest's ticket arrive on the right table. Printing opens the browser's
 * sheet with only the stand on it (`index.css`).
 */
export default function QrMenuPage() {
  const { t, lang } = useLang();
  const [data, setData] = useState<QrMenuData | null>(null);
  const [failed, setFailed] = useState(false);
  const [table, setTable] = useState(0);
  const [copied, setCopied] = useState(false);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .qrMenu()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = useMemo(() => {
    if (!data) return '';
    const base = `${window.location.origin}${data.path}`;
    return table ? `${base}?table=${table}` : base;
  }, [data, table]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 0, width: 220 })
      .then((next) => {
        if (!cancelled) setSvg(next);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A browser that refuses the clipboard still shows the link below.
    }
  };

  if (failed) {
    return (
      <div className="card p-6">
        <p className="text-[15px] font-semibold text-ink">{t('qr.failed')}</p>
      </div>
    );
  }

  const storeName = data
    ? lang === 'ar'
      ? data.store.name_ar
      : data.store.name_en
    : '';
  const branchName = data
    ? lang === 'ar'
      ? data.branch.name_ar
      : data.branch.name_en
    : '';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink sm:text-[30px]">
          {t('qr.title')}
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">{t('qr.subtitle')}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          <div className="card flex flex-col gap-3 p-4">
            <label
              htmlFor="qr-table"
              className="text-[13px] font-medium text-ink-2"
            >
              {t('qr.table')}
            </label>
            <select
              id="qr-table"
              value={table}
              onChange={(event) => setTable(Number(event.target.value))}
              className="field"
            >
              <option value={0}>{t('qr.general')}</option>
              {Array.from(
                { length: data?.tables ?? 0 },
                (_, index) => index + 1,
              ).map((number) => (
                <option key={number} value={number}>
                  {t('qr.table')} {number}
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-relaxed text-ink-2">
              {table ? t('qr.tableHint') : t('qr.generalHint')}
            </p>

            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                dir="ltr"
                aria-label={t('qr.link')}
                className="field flex-1 text-[13px]"
              />
              <button
                type="button"
                onClick={copy}
                className="btn-quiet shrink-0 px-3"
              >
                <Copy size={16} />
                {copied ? t('qr.copied') : t('qr.copy')}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <QrCode size={16} />
              {t('qr.howTitle')}
            </p>
            <ol className="mt-2 flex list-decimal flex-col gap-1 ps-5 text-[13px] leading-relaxed text-ink-2">
              <li>{t('qr.howOne')}</li>
              <li>{t('qr.howTwo')}</li>
              <li>{t('qr.howThree')}</li>
            </ol>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <MenuStand
            storeName={storeName}
            branchName={branchName}
            table={table || null}
            url={url}
            svg={svg}
          />
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data || !svg}
            className="btn-primary no-print"
          >
            <Printer size={17} />
            {t('qr.print')}
          </button>
        </div>
      </div>
    </div>
  );
}
