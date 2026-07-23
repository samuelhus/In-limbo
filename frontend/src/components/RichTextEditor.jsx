import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { legacyContentToHtml } from '@/lib/richtext';

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
    const url = window.prompt('Link-URL (laat leeg om te verwijderen):', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="richtext-editor" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 mb-2" data-testid={`${testId}-toolbar`}>
        <ToolbarButton
          label="Vet"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>V</strong>
        </ToolbarButton>
        <ToolbarButton
          label="Cursief"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>C</em>
        </ToolbarButton>
        <ToolbarButton
          label="Opsomming"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Lijst
        </ToolbarButton>
        <ToolbarButton
          label="Genummerde lijst"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Lijst
        </ToolbarButton>
        <ToolbarButton
          label="Link toevoegen/wijzigen"
          active={editor.isActive('link')}
          onClick={setLink}
        >
          🔗 Link
        </ToolbarButton>
        <ToolbarButton
          label="Ongedaan maken"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label="Opnieuw"
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
