import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLang } from '../../lib/i18n';
import Sheet from '../Sheet';

type Props = {
  open: boolean;
  /** The restaurant the link activates, for the sentence around it. */
  restaurant: string;
  token: string;
  onClose: () => void;
};

/** The activation link lives on the app's own origin, so it works from any device. */
export function inviteLink(token: string) {
  return `${window.location.origin}/activate/${token}`;
}

/**
 * The owner hands a new restaurant over with this link: whoever runs it opens
 * it, sets their own name, username and password, and becomes its admin.
 */
export default function InviteLinkDialog({
  open,
  restaurant,
  token,
  onClose,
}: Props) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const link = token ? inviteLink(token) : '';

  useEffect(() => {
    if (!open) return;
    setCopied(false);
  }, [open, token]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // A frame that refuses the clipboard still lets the field be selected.
      setCopied(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t('platform.inviteTitle')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          {t('common.done')}
        </button>
      }
    >
      <p className="text-[14px] leading-relaxed text-ink">
        {t('platform.inviteFor', { restaurant })}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        {t('platform.inviteHint')}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-2">
            {t('platform.inviteLink')}
          </span>
          <input
            className="field text-[13px]"
            dir="ltr"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
        </label>
        <button type="button" onClick={copy} className="btn-primary h-11 min-h-0">
          {copied ? <Check size={16} /> : <Link2 size={16} />}
          {copied ? t('platform.inviteCopied') : t('platform.inviteCopy')}
        </button>
      </div>
    </Sheet>
  );
}
