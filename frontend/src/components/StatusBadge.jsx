import React from 'react';
import { useTranslation } from 'react-i18next';

const STYLES = {
  beschikbaar: { bg: '#ADEBB3', text: '#1A4D22', border: '#7BC987' },
  herbestemd:  { bg: '#DBEAFE', text: '#1E3A8A', border: '#3B82F6' },
  in_magazijn: { bg: '#BBF7D0', text: '#14532D', border: '#86EFAC' },
  gearchiveerd:{ bg: '#E5E5E0', text: '#444',    border: '#888'    },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const { t } = useTranslation();
  const s = STYLES[status] || STYLES.beschikbaar;
  const sizeCls =
    size === 'lg'  ? 'text-sm px-3 py-1'      :
    size === 'xs'  ? 'text-[10px] px-1.5 py-0.5' :
                     'text-xs px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center font-medium tracking-wide uppercase ${sizeCls}`}
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, borderRadius: 2, fontFamily: 'Archivo, sans-serif', letterSpacing: '0.06em' }}
      data-testid={`status-badge-${status}`}
    >
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}