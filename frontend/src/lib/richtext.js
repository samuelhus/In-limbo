import DOMPurify from 'dompurify';

/**
 * Sanitizes rich text HTML before rendering (defense in depth — content
 * comes from trusted admins, but we sanitize anyway since it's rendered
 * with dangerouslySetInnerHTML).
 *
 * Video/audio embeds are stored as inert placeholder <div> elements with
 * data-* attributes (never a raw <iframe> or arbitrary src) — the actual
 * player is built client-side afterwards by hydrateRichTextEmbeds(), using
 * hardcoded, whitelisted embed-URL templates. This means sanitized content
 * never itself contains an iframe or executable embed markup.
 */
export function sanitizeRichText(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'div', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-embed-type', 'data-provider', 'data-embed-id', 'data-src'],
  });
}

/**
 * Strips HTML tags, used to validate that rich text content isn't
 * effectively empty (e.g. "<p></p>" from an empty editor).
 */
export function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Older posts were stored as plain text (rendered via whitespace-pre-wrap).
 * This converts that legacy plain text into paragraph/line-break HTML so it
 * displays correctly in the new rich-text renderer and editor, without
 * needing a database migration. If the content already looks like HTML
 * (contains a tag), it's passed through unchanged.
 */
export function legacyContentToHtml(text) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Parses a YouTube or Vimeo URL and returns { provider, embedId }, or null
 * if the URL doesn't match a recognized pattern.
 */
export function parseVideoUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();

  const ytMatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/
  );
  if (ytMatch) return { provider: 'youtube', embedId: ytMatch[1] };

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { provider: 'vimeo', embedId: vimeoMatch[1] };

  return null;
}

/**
 * Basic sanity check for an audio URL (must be http(s), no javascript:/data:
 * schemes). Doesn't strictly require a .mp3 extension since some hosts
 * serve audio without a file extension in the URL.
 */
export function isSafeAudioUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

// Hardcoded, whitelisted embed-URL templates — never built from arbitrary
// stored HTML/src, only from the provider+id data attributes we control.
function videoEmbedSrc(provider, embedId) {
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${embedId}`;
  if (provider === 'vimeo') return `https://player.vimeo.com/video/${embedId}`;
  return null;
}

/**
 * Client-side hydration: scans a rendered content container for embed
 * placeholder divs (inserted by the editor, surviving sanitization as inert
 * data-* attributes) and replaces them with the actual <iframe>/<audio>
 * player. Call this in a useEffect after setting the sanitized HTML.
 */
export function hydrateRichTextEmbeds(container) {
  if (!container) return;

  container.querySelectorAll('[data-embed-type="video"]').forEach((el) => {
    const provider = el.getAttribute('data-provider');
    const embedId = el.getAttribute('data-embed-id');
    const src = videoEmbedSrc(provider, embedId);
    if (!src || el.dataset.hydrated) return;
    el.dataset.hydrated = 'true';
    el.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'richtext-video-frame';
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = `${provider} video`;
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.frameBorder = '0';
    wrapper.appendChild(iframe);
    el.appendChild(wrapper);
  });

  container.querySelectorAll('[data-embed-type="audio"]').forEach((el) => {
    const src = el.getAttribute('data-src');
    if (!src || !isSafeAudioUrl(src) || el.dataset.hydrated) return;
    el.dataset.hydrated = 'true';
    el.innerHTML = '';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = src;
    audio.className = 'richtext-audio-player';
    el.appendChild(audio);
  });
}
