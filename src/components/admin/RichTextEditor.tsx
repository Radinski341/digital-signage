"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./MediaPicker";
import { safeHref } from "@/modules/security";
const ManagedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => ({ "data-media-id": attributes.mediaId }),
      },
    };
  },
});
export default function RichTextEditor({
  value,
  onChange,
  media,
  format = "json",
  includeImages = true,
  label = "Formatted content",
}: {
  value: any;
  onChange: (value: any) => void;
  media: any[];
  format?: "json" | "html";
  includeImages?: boolean;
  label?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, validate: (url) => Boolean(safeHref(url)) },
      }),
      ManagedImage,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: ({ editor }) =>
      onChange(format === "html" ? editor.getHTML() : editor.getJSON()),
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = value || { type: "doc", content: [{ type: "paragraph" }] };
    const current = format === "html" ? editor.getHTML() : editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value, format]);
  if (!editor) return <div className="admin-skeleton" />;
  const tools = [
    ["Bold", () => editor.chain().focus().toggleBold().run()],
    ["Italic", () => editor.chain().focus().toggleItalic().run()],
    ["Underline", () => editor.chain().focus().toggleUnderline().run()],
    ["Heading", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ["Bullets", () => editor.chain().focus().toggleBulletList().run()],
    ["Numbered", () => editor.chain().focus().toggleOrderedList().run()],
    ["Quote", () => editor.chain().focus().toggleBlockquote().run()],
    [
      "Link",
      () => {
        const href = window.prompt("Link destination (https://… or /page)");
        if (href && safeHref(href))
          editor.chain().focus().setLink({ href }).run();
      },
    ],
    ["Undo", () => editor.chain().focus().undo().run()],
    ["Redo", () => editor.chain().focus().redo().run()],
  ] as const;
  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
        {tools.map(([label, action]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant="ghost"
            onClick={action}
          >
            {label}
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {includeImages && (
        <MediaPicker
          media={media}
          label="Insert an inline image"
          buttonLabel="Insert inline image"
          onChange={(id, asset) => {
            const m = asset || media.find((m) => m.id === id);
            if (m)
              editor
                .chain()
                .focus()
                .setImage({ src: m.url, alt: m.alt, mediaId: m.id } as any)
                .run();
          }}
        />
      )}
    </div>
  );
}
