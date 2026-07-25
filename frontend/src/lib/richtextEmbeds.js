import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Stores a video embed as an inert placeholder node (provider + embedId
 * only — never a raw iframe/src). The actual player is built client-side on
 * the published page via hydrateRichTextEmbeds() in @/lib/richtext, using
 * hardcoded, whitelisted embed-URL templates. In the editor itself this just
 * shows a static label, not a live preview.
 */
export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      provider: { default: null },
      embedId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-type="video"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-embed-type': 'video',
        'data-provider': node.attrs.provider,
        'data-embed-id': node.attrs.embedId,
        class: 'richtext-embed-video richtext-embed-placeholder',
      }),
      ['span', { class: 'richtext-embed-label' }, `▶ ${node.attrs.provider} video (${node.attrs.embedId})`],
    ];
  },
});

/**
 * Stores an audio embed as an inert placeholder node (mp3/audio URL only).
 * Hydrated into a real <audio controls> element client-side, same pattern
 * as VideoEmbed.
 */
export const AudioEmbed = Node.create({
  name: 'audioEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-type="audio"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-embed-type': 'audio',
        'data-src': node.attrs.src,
        class: 'richtext-embed-audio richtext-embed-placeholder',
      }),
      ['span', { class: 'richtext-embed-label' }, `🔊 Audio: ${node.attrs.src}`],
    ];
  },
});
