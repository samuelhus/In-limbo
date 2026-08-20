import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Snellere polling zolang dit gespreksvenster openstaat (PRD_direct_messaging.md
// §9: "10-15 seconden") — i.t.t. de 60 sec-badge-poll elders in de app
// (MessagesTab.jsx, Header.jsx).
const POLL_MS = 12_000;
const MAX_MESSAGE_LENGTH = 2000;

function formatTime(iso, lang = 'nl') {
  const locale = lang === 'fr' ? 'fr-BE' : 'nl-BE';
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function GesprekDetail() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'nl').slice(0, 2);
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null); // null = laden, false = niet gevonden/geen toegang
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);

  const loadConversation = useCallback(async () => {
    try {
      const { data } = await api.get(`/conversations/${id}`);
      setConversation(data);
    } catch {
      setConversation(false);
    }
  }, [id]);

  const loadMessages = useCallback(async () => {
    try {
      // Geen infinite-scroll/paginering in v1 — bij het verwachte lage,
      // B2B-achtige berichtvolume (PRD §9) volstaat 1 pagina van 200.
      const { data } = await api.get(`/conversations/${id}/messages`, { params: { limit: 200 } });
      setMessages(data.items);
    } catch { /* silent, zelfde patroon als de polling elders in de app */ }
  }, [id]);

  const markRead = useCallback(async () => {
    try { await api.patch(`/conversations/${id}/read`); } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    loadConversation();
    loadMessages();
    markRead();
  }, [loadConversation, loadMessages, markRead]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadMessages();
      markRead();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadMessages, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (conversation === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground" data-testid="gesprek-loading">
        {t('common.loading')}
      </div>
    );
  }
  if (conversation === false) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24" data-testid="gesprek-not-found">
        {t('messages.not_found')}
      </div>
    );
  }

  // Asymmetrieregel (PRD §3): de aanvrager mag pas reageren nadat de
  // aanbieder als eerste een bericht stuurde. De server handhaaft dit al
  // (send_message geeft 403), hier enkel om de invoer proactief uit te
  // schakelen i.p.v. de gebruiker een mislukte poging te laten doen.
  const isOfferer = user?.id === conversation.offererUserId;
  const offererHasSent = messages.some((m) => m.senderId === conversation.offererUserId);
  const waitingForOfferer = !isOfferer && !offererHasSent;
  const blocked = conversation.blockedByOther;
  const canSend = !waitingForOfferer && !blocked;

  const send = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      await api.post(`/conversations/${id}/messages`, { text: trimmed });
      setText('');
      await loadMessages();
    } catch (err) {
      setSendError(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex flex-col" style={{ minHeight: '75vh' }} data-testid="gesprek-page">
      <Link
        to="/berichten"
        className="text-xs text-muted-foreground hover:text-foreground industrial-link mb-4 inline-block"
        data-testid="gesprek-back-link"
      >
        ← {t('messages.title')}
      </Link>

      <div className="mb-6">
        <p className="overline mb-1">{conversation.listingTitle}</p>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="gesprek-other-party">
          {conversation.otherPartyName || t('messages.unknown_party')}
        </h1>
      </div>

      <div
        className="flex-1 overflow-y-auto border border-border divide-y divide-border mb-4"
        data-testid="gesprek-messages"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground p-4" data-testid="gesprek-no-messages">
            {t('messages.no_messages_yet')}
          </p>
        )}
        {messages.map((m) => {
          const isMine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`p-4 ${isMine ? 'bg-muted/30' : ''}`} data-testid={`gesprek-message-${m.id}`}>
              <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatTime(m.createdAt, lang)}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {blocked && (
        <p className="text-sm text-destructive mb-2" data-testid="gesprek-blocked-notice">
          {t('messages.blocked_notice')}
        </p>
      )}
      {waitingForOfferer && !blocked && (
        <p className="text-sm text-muted-foreground mb-2" data-testid="gesprek-waiting-notice">
          {t('messages.waiting_for_offerer')}
        </p>
      )}
      {sendError && <p className="text-destructive text-sm mb-2" data-testid="gesprek-send-error">{sendError}</p>}

      <form onSubmit={send} data-testid="gesprek-compose-form">
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={!canSend || sending}
            placeholder={t('messages.input_placeholder')}
            rows={2}
            className="flex-1 border border-border bg-background px-3 py-2 text-sm resize-none disabled:opacity-50"
            data-testid="gesprek-input"
          />
          <button
            type="submit"
            disabled={!canSend || sending || !text.trim()}
            className="btn-primary !py-2 text-xs"
            data-testid="gesprek-send-btn"
          >
            {t('messages.send_btn')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-right mt-1">
          {t('messages.char_count', { count: text.length })}
        </p>
      </form>
    </div>
  );
}
