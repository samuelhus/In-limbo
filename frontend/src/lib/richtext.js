import DOMPurify from 'dompurify';

/**
 * Sanitizes rich text HTML before rendering (defense in depth — content
 * comes from trusted admins, but we sanitize anyway since it's rendered
 * with dangerouslySetInnerHTML).
 */
export function sanitizeRichText(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
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
