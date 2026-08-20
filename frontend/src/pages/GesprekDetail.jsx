import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useMessages } from '@/contexts/MessagesContext';
import { cloudinaryThumb, cloudinaryPdfUrl, uploadImageWithMeta, uploadFileWithMeta } from '@/lib/cloudinary';

// Snellere polling zolang dit gespreksvenster openstaat (PRD_direct_messaging.md
// §9: "10-15 seconden") — i.t.t. de 60 sec-badge-poll elders in de app
// (MessagesTab.jsx, Header.jsx).
const POLL_MS = 12_000;
const MAX_MESSAGE_LENGTH = 2000;

// Cumulatieve bijlage-limiet per Conversation (PRD §6.2) — zelfde waarden
// als backend/models.py::MAX_CONVERSATION_ATTACHMENTS/_BYTES. Enkel voor
// een vroege, client-side check vóór het uploaden; de server is en blijft
// de bron van waarheid (send_message telt dit hoe dan ook nog eens af).
const MAX_CONVERSATION_ATTACHMENTS = 5;
const MAX_CONVERSATION_ATTACHMENT_BYTES = 20 * 1024 * 1024;

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
  const { refresh: refreshBadge } = useMessages();
  const [conversation, setConversation] = useState(null); // null = laden, false = niet gevonden/geen toegang
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [handling, setHandling] = useState(false);
  const [handleError, setHandleError] = useState('');
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
    try {
      await api.patch(`/conversations/${id}/read`);
      // Fase 9: laat de navigatiebadge onmiddellijk verdwijnen zodra alles
      // gelezen is, i.p.v. tot 60 sec te wachten op de volgende poll
      // (MessagesTab.jsx/Header.jsx pollen anders zelf pas later opnieuw).
      refreshBadge();
    } catch { /* silent */ }
  }, [id, refreshBadge]);

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

  // Lopend verbruik = wat het gesprek al aan bijlagen heeft (server) + wat
  // nog in de wachtrij staat om met het volgende bericht mee te gaan.
  const attachmentCount = (conversation.attachmentCount || 0) + pendingPhotos.length + pendingFiles.length;
  const attachmentBytes = (conversation.attachmentBytes || 0)
    + pendingPhotos.reduce((s, a) => s + a.bytes, 0)
    + pendingFiles.reduce((s, a) => s + a.bytes, 0);

  const send = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      await api.post(`/conversations/${id}/messages`, {
        text: trimmed,
        photos: pendingPhotos,
        files: pendingFiles,
      });
      setText('');
      setPendingPhotos([]);
      setPendingFiles([]);
      await loadMessages();
      await loadConversation(); // ververst attachmentCount/attachmentBytes
    } catch (err) {
      setSendError(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  // Bijlagen (fase 8, PRD §6.2) — client-side check vóór het uploaden, om
  // de gebruiker niet nodeloos te laten wachten op een upload die de server
  // toch zou weigeren. `runningCount`/`runningBytes` volgen lokaal binnen
  // de lus, omdat React-state pas ná deze functie effectief bijwerkt.
  const onPhotosPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setAttachmentError('');
    setUploading(true);
    let runningCount = attachmentCount;
    let runningBytes = attachmentBytes;
    const uploaded = [];
    try {
      for (const f of files) {
        if (runningCount + 1 > MAX_CONVERSATION_ATTACHMENTS || runningBytes + f.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
          setAttachmentError(t('messages.attachment_limit_reached'));
          break;
        }
        const meta = await uploadImageWithMeta(f);
        uploaded.push(meta);
        runningCount += 1;
        runningBytes += meta.bytes;
      }
    } catch (err) {
      setAttachmentError(err.message || t('messages.attachment_upload_failed'));
    } finally {
      if (uploaded.length) setPendingPhotos((p) => [...p, ...uploaded]);
      setUploading(false);
    }
  };

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError('');
    if (attachmentCount + 1 > MAX_CONVERSATION_ATTACHMENTS || attachmentBytes + file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
      setAttachmentError(t('messages.attachment_limit_reached'));
      return;
    }
    setUploading(true);
    try {
      const meta = await uploadFileWithMeta(file);
      setPendingFiles((p) => [...p, meta]);
    } catch (err) {
      setAttachmentError(err.message || t('messages.attachment_upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  const removePendingPhoto = (idx) => setPendingPhotos((p) => p.filter((_, i) => i !== idx));
  const removePendingFile = (idx) => setPendingFiles((p) => p.filter((_, i) => i !== idx));

  // Blokkeren (fase 8, PRD §6.4) — met bevestigingsdialoog, in beide
  // richtingen (blokkeren én weer opheffen). Na de PATCH herladen we het
  // volledige, verrijkte gespreksdetail i.p.v. de PATCH-response zelf te
  // gebruiken: /block en /unblock geven enkel het kale Conversation-object
  // terug, zonder listingTitle/otherPartyName (zie routes/conversations.py).
  const toggleBlock = async () => {
    const willBlock = !conversation.blockedByMe;
    const name = conversation.otherPartyName || t('messages.unknown_party');
    const confirmMsg = willBlock
      ? t('messages.confirm_block', { name })
      : t('messages.confirm_unblock', { name });
    if (!window.confirm(confirmMsg)) return;
    setBlocking(true);
    setBlockError('');
    try {
      await api.patch(`/conversations/${id}/${willBlock ? 'block' : 'unblock'}`);
      await loadConversation();
    } catch (err) {
      setBlockError(formatApiError(err));
    } finally {
      setBlocking(false);
    }
  };

  // "Afgehandeld" (fase 9) — puur organisatorisch (groepering in de
  // gesprekslijst), los van blokkeren/verwijderen. Geen bevestigingsdialoog
  // nodig: omkeerbaar met 1 klik, geen dataverlies zoals bij verwijderen.
  const toggleHandled = async () => {
    const willHandle = !conversation.handledByMe;
    setHandling(true);
    setHandleError('');
    try {
      await api.patch(`/conversations/${id}/${willHandle ? 'mark-handled' : 'unmark-handled'}`);
      await loadConversation();
    } catch (err) {
      setHandleError(formatApiError(err));
    } finally {
      setHandling(false);
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

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="overline mb-1">{conversation.listingTitle}</p>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="gesprek-other-party">
            {conversation.otherPartyName || t('messages.unknown_party')}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={toggleHandled}
            disabled={handling}
            className="btn-secondary !py-1.5 px-3 text-xs"
            data-testid="gesprek-handled-btn"
          >
            {conversation.handledByMe ? t('messages.mark_active_btn') : t('messages.mark_handled_btn')}
          </button>
          <button
            onClick={toggleBlock}
            disabled={blocking}
            className="btn-secondary !py-1.5 px-3 text-xs"
            data-testid="gesprek-block-btn"
          >
            {conversation.blockedByMe ? t('messages.unblock_btn') : t('messages.block_btn')}
          </button>
        </div>
      </div>
      {handleError && <p className="text-destructive text-sm mb-4" data-testid="gesprek-handle-error">{handleError}</p>}
      {blockError && <p className="text-destructive text-sm mb-4" data-testid="gesprek-block-error">{blockError}</p>}

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
          // Duidelijk onderscheid wie wat schreef (fase 9): naam + kleur per
          // spreker (groen = ik, blauw = de andere partij — hergebruikt de
          // bestaande status-kleuren uit tailwind.config.js), i.p.v. enkel
          // een subtiele achtergrondtint.
          const senderName = isMine ? conversation.viewerName : conversation.otherPartyName;
          const hasAttachments = (m.photos && m.photos.length > 0) || (m.files && m.files.length > 0);
          return (
            <div
              key={m.id}
              className={`p-3 border-l-4 ${isMine ? 'border-[#34D399] bg-muted/20' : 'border-[#3B82F6]'}`}
              data-testid={`gesprek-message-${m.id}`}
            >
              <p className={`text-xs font-semibold ${isMine ? 'text-[#166534]' : 'text-[#1E3A8A]'}`}>
                {senderName || t('messages.unknown_party')}
                <span className="text-muted-foreground font-normal"> · {formatTime(m.createdAt, lang)}</span>
              </p>
              <p className="text-sm whitespace-pre-wrap mt-0.5">{m.text}</p>
              {hasAttachments && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.photos.map((p, i) => (
                    <a key={`photo-${i}`} href={p.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={cloudinaryThumb(p.url, 200, 200)}
                        alt=""
                        className="w-20 h-20 object-cover"
                        data-testid={`gesprek-message-${m.id}-photo-${i}`}
                      />
                    </a>
                  ))}
                  {m.files.map((f, i) => {
                    const filename = decodeURIComponent(f.url.split('/').pop().split('?')[0]) || `bestand-${i + 1}`;
                    return (
                      <a
                        key={`file-${i}`}
                        href={cloudinaryPdfUrl(f.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="industrial-link text-xs bg-muted px-2 py-1 self-start"
                        data-testid={`gesprek-message-${m.id}-file-${i}`}
                      >
                        {filename}
                      </a>
                    );
                  })}
                </div>
              )}
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
        <div className="flex items-center gap-3 mb-2">
          <label className="text-xs text-muted-foreground hover:text-foreground cursor-pointer industrial-link">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPhotosPicked}
              className="hidden"
              disabled={!canSend || uploading}
              data-testid="gesprek-photo-input"
            />
            {uploading ? t('messages.uploading') : t('messages.add_photo')}
          </label>
          <label className="text-xs text-muted-foreground hover:text-foreground cursor-pointer industrial-link">
            <input
              type="file"
              accept="application/pdf"
              onChange={onFilePicked}
              className="hidden"
              disabled={!canSend || uploading}
              data-testid="gesprek-file-input"
            />
            {t('messages.add_file')}
          </label>
        </div>
        {attachmentError && (
          <p className="text-sm text-destructive mb-2" data-testid="gesprek-attachment-error">{attachmentError}</p>
        )}
        {(pendingPhotos.length > 0 || pendingFiles.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2" data-testid="gesprek-pending-attachments">
            {pendingPhotos.map((p, i) => (
              <div key={`pending-photo-${i}`} className="relative w-16 h-16 bg-muted overflow-hidden">
                <img src={cloudinaryThumb(p.url, 200, 200)} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePendingPhoto(i)}
                  className="absolute top-0 right-0 bg-background/90 text-xs px-1 leading-tight"
                  data-testid={`gesprek-remove-pending-photo-${i}`}
                  aria-label={t('common.remove')}
                >
                  ×
                </button>
              </div>
            ))}
            {pendingFiles.map((f, i) => {
              const filename = decodeURIComponent(f.url.split('/').pop().split('?')[0]) || `bestand-${i + 1}`;
              return (
                <div key={`pending-file-${i}`} className="flex items-center gap-1 bg-muted px-2 py-1 text-xs">
                  <span className="truncate max-w-[8rem]">{filename}</span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`gesprek-remove-pending-file-${i}`}
                    aria-label={t('common.remove')}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
