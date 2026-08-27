import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { legacyContentToHtml, parseVideoUrl, isSafeAudioUrl } from '@/lib/richtext';
import { VideoEmbed, AudioEmbed } from '@/lib/richtextEmbeds';

function ToolbarButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`px-2.5 py-1.5 text-sm border border-border transition-colors disabled:opacity-40 ${
        active ? 'bg-foreground text-background border-foreground' : 'bg-surface text-foreground hover:border-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Minimal WYSIWYG editor (bold, italic, bulleted/numbered lists, links).
 *
 * Props:
 * - value: string — HTML content (or legacy plain text, auto-converted)
 * - onChange: (html: string) => void
 * - maxLength: number — soft character limit (counts visible text, not HTML)
 * - testId: string — data-testid prefix for the toolbar buttons
 */
export default function RichTextEditor({ value, onChange, maxLength = 5000, testId = 'richtext' }) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      VideoEmbed,
      AudioEmbed,
    ],
    content: legacyContentToHtml(value),
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  // Keep editor in sync if `value` changes externally (e.g. switching between
  // editing two different posts without unmounting the component).
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const nextHtml = legacyContentToHtml(value);
    if (nextHtml !== currentHtml && nextHtml !== `<p>${value}</p>`) {
      // Only reset if genuinely different post content (avoid cursor jumps while typing)
      const isSameText = editor.getText() === (value || '').replace(/<[^>]+>/g, '');
      if (!isSameText) {
        editor.commands.setContent(nextHtml, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  const charCount = editor.getText().length;
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt(t('richtext_editor.link_prompt'), previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertVideo = () => {
    const url = window.prompt(t('richtext_editor.video_prompt'), 'https://');
    if (!url) return;
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      alert(t('richtext_editor.video_invalid'));
      return;
    }
    editor.chain().focus().insertContent({ type: 'videoEmbed', attrs: parsed }).run();
  };

  const insertAudio = () => {
    const url = window.prompt(t('richtext_editor.audio_prompt'), 'https://');
    if (!url) return;
    if (!isSafeAudioUrl(url)) {
      alert(t('richtext_editor.audio_invalid'));
      return;
    }
    editor.chain().focus().insertContent({ type: 'audioEmbed', attrs: { src: url.trim() } }).run();
  };

  return (
    <div className="richtext-editor" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 mb-2" data-testid={`${testId}-toolbar`}>
        <ToolbarButton
          label={t('richtext_editor.bold')}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>V</strong>
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.italic')}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>C</em>
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.bullet_list')}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Lijst
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.ordered_list')}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Lijst
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.link_button')}
          active={editor.isActive('link')}
          onClick={setLink}
        >
          🔗 Link
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.video_button')}
          onClick={insertVideo}
        >
          🎬 Video
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.audio_button')}
          onClick={insertAudio}
        >
          🔊 Audio
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.undo')}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label={t('richtext_editor.redo')}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          ↷
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="richtext-content-editable input-flat" />
      <p className="text-xs text-muted-foreground mt-1">
        {charCount}/{maxLength}
      </p>
    </div>
  );
}
