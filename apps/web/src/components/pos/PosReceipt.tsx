import type { OrderChannel, PaymentMethod } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { CHANNEL_KEY, PAYMENT_KEY } from '../../lib/orders';

/**
 * The guest's slip. It is drawn on screen only when the browser prints (the
 * `pos-receipt` block in `index.css`), so the till keeps its own layout and the
 * paper carries the ticket — the same `window.print()` the QR stand uses.
 *
 * A ticket rung up offline prints with its local number and a line saying it is
 * waiting to sync; the server's number replaces it on the ticket itself, never
 * on the slip already in the guest's hand.
 */
export type ReceiptTicket = {
  number: string;
  pending: boolean;
  channel: OrderChannel;
  table_no: number | null;
  payment_method: PaymentMethod | null;
  customer_name: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  placed_at: string;
};

type Props = {
  ticket: ReceiptTicket;
  storeName: string;
  branchName: string;
  currency: string;
};

export default function PosReceipt({
  ticket,
  storeName,
  branchName,
  currency,
}: Props) {
  const { t, lang } = useLang();
  const money = (value: number) => formatCurrency(lang, value, currency);
  const date = new Date(ticket.placed_at);

  return (
    <div className="pos-receipt" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <p className="receipt-store">{storeName}</p>
      {branchName ? <p className="receipt-line">{branchName}</p> : null}
      <p className="receipt-line">{date.toLocaleString()}</p>

      <div className="receipt-divider" />

      <div className="receipt-row receipt-number">
        <span>#{ticket.number}</span>
        <span>
          {ticket.channel === 'dine_in' && ticket.table_no
            ? `${t(CHANNEL_KEY[ticket.channel])} · ${ticket.table_no}`
            : t(CHANNEL_KEY[ticket.channel])}
        </span>
      </div>
      {ticket.customer_name ? (
        <p className="receipt-line">{ticket.customer_name}</p>
      ) : null}

      <div className="receipt-divider" />

      <ul className="receipt-items">
        {ticket.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="receipt-qty">{item.qty}×</span>
            <span className="receipt-name">{item.name}</span>
            <span className="receipt-amount">{money(item.price * item.qty)}</span>
          </li>
        ))}
      </ul>

      <div className="receipt-divider" />

      <div className="receipt-row">
        <span>{t('pos.subtotal')}</span>
        <span>{money(ticket.subtotal)}</span>
      </div>
      <div className="receipt-row">
        <span>{t('pos.taxShort')}</span>
        <span>{money(ticket.tax)}</span>
      </div>
      <div className="receipt-row receipt-total">
        <span>{t('pos.total')}</span>
        <span>{money(ticket.total)}</span>
      </div>

      <div className="receipt-divider" />

      <div className="receipt-row">
        <span>{t('pos.payment')}</span>
        <span>
          {ticket.payment_method ? t(PAYMENT_KEY[ticket.payment_method]) : '—'}
        </span>
      </div>

      {ticket.pending ? (
        <p className="receipt-pending">{t('receipt.pending')}</p>
      ) : null}

      <p className="receipt-thanks">{t('receipt.thanks')}</p>
    </div>
  );
}
