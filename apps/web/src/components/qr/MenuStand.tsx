import { useLang } from '../../lib/i18n';

type Props = {
  storeName: string;
  branchName: string;
  table: number | null;
  url: string;
  /** The QR code as an SVG document, drawn from the public link. */
  svg: string;
};

/**
 * The printable stand on the table: the store, "scan to order" and the code.
 *
 * It is the only thing on the sheet when printed (`index.css` hides the rest),
 * so the QR is large enough to scan from a phone at arm's length.
 */
export default function MenuStand({
  storeName,
  branchName,
  table,
  url,
  svg,
}: Props) {
  const { t } = useLang();

  return (
    <div className="qr-stand card flex flex-col items-center gap-3 p-6 text-center print:border-0 print:shadow-none">
      <div>
        <p className="text-[20px] font-bold tracking-tight text-ink">
          {storeName}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-2">{branchName}</p>
      </div>

      {table ? (
        <p
          className="chip text-[13px]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {t('qr.table')} {table}
        </p>
      ) : null}

      <div className="rounded-[18px] bg-white p-3">
        {svg ? (
          <div
            className="h-[220px] w-[220px] [&>svg]:h-full [&>svg]:w-full"
            // The SVG is produced locally from this branch's own link.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="skeleton h-[220px] w-[220px]" />
        )}
      </div>

      <p className="text-[15px] font-semibold text-ink">{t('qr.scan')}</p>
      <p className="break-all text-[11px] text-ink-2" dir="ltr">
        {url}
      </p>
    </div>
  );
}
