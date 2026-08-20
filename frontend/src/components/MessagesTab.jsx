import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMessages } from '@/contexts/MessagesContext';

export default function MessagesTab() {
  const { t } = useTranslation();
  // Gedeelde poll + "onmiddellijk verversen na lezen"-state (fase 9), zie
  // MessagesContext.jsx — vervangt de eigen polling die hier vroeger stond.
  const { hasUnread } = useMessages();

  return (
    <Link
      to="/berichten"
      className="relative p-2 hover:bg-muted transition-colors"
      aria-label={t('messages.open')}
      data-testid="messages-tab"
    >
      <MessageCircle className="w-5 h-5" />
      {hasUnread && (
        // Fase 9: geen cijfer meer, enkel een stip — de badge toont dat er
        // minstens 1 ongelezen bericht is, niet hoeveel precies.
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full"
          data-testid="messages-tab-badge"
        />
      )}
    </Link>
  );
}
