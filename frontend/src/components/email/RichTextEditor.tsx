'use client';

import TextAlign from '@tiptap/extension-text-align';
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/hooks/useHydrated';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const ALIGN_ICONS: Record<string, LucideIcon> = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };

function ToolButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          // Keep the editor selection: the button must not steal focus on mouse down.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn('size-7 rounded-full text-muted-foreground hover:text-foreground', active && 'bg-primary-soft text-primary-soft-foreground')}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />;

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canIndent: e.can().sinkListItem('listItem'),
      canOutdent: e.can().liftListItem('listItem'),
      heading: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      align: ['center', 'right', 'justify'].find((a) => e.isActive({ textAlign: a })) ?? 'left',
    }),
  });
  const chain = () => editor.chain().focus();
  const AlignIcon = ALIGN_ICONS[s.align] ?? AlignLeft;

  return (
    <div role="toolbar" aria-label="Text formatting" className="mx-3 mt-1 flex flex-wrap items-center gap-0.5 rounded-full bg-background px-3 py-1.5">
      <ToolButton label="Undo" icon={Undo2} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton label="Redo" icon={Redo2} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      <Divider />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Text style" className="h-7 w-10 rounded-full gap-0 text-muted-foreground">
                <Type className="size-4" aria-hidden />
                <ChevronDown className="size-3" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Text style</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuRadioGroup
            value={s.heading}
            onValueChange={(v) => {
              if (v === 'p') chain().setParagraph().run();
              else chain().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <DropdownMenuRadioItem value="p">Normal</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="h1">Heading 1</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="h2">Heading 2</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="h3">Heading 3</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton label="Bold" icon={Bold} active={s.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton label="Italic" icon={Italic} active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton label="Underline" icon={UnderlineIcon} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <Divider />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Alignment" className="h-7 w-10 rounded-full gap-0 text-muted-foreground">
                <AlignIcon className="size-4" aria-hidden />
                <ChevronDown className="size-3" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Alignment</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuRadioGroup value={s.align} onValueChange={(v) => chain().setTextAlign(v).run()}>
            {(['left', 'center', 'right', 'justify'] as const).map((a) => {
              const Icon = ALIGN_ICONS[a]!;
              return (
                <DropdownMenuRadioItem key={a} value={a} className="capitalize">
                  <Icon aria-hidden />
                  {a}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton label="Numbered list" icon={ListOrdered} active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton label="Bulleted list" icon={List} active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton label="Increase indent" icon={IndentIncrease} disabled={!s.canIndent} onClick={() => chain().sinkListItem('listItem').run()} />
      <ToolButton label="Decrease indent" icon={IndentDecrease} disabled={!s.canOutdent} onClick={() => chain().liftListItem('listItem').run()} />
      <Divider />

      <ToolButton label="Quote" icon={Quote} active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton label="Strikethrough" icon={Strikethrough} active={s.strike} onClick={() => chain().toggleStrike().run()} />
    </div>
  );
}

type EditorProps = {
  /** Receives the HTML and whether the editor has any visible text. */
  onChange: (html: string, isEmpty: boolean) => void;
  invalid?: boolean;
  id: string;
};

/**
 * Rich-text body for the compose form. Emits HTML limited to what the
 * server's sanitizer allows (bold, italic, underline, strike, headings,
 * lists, quotes, links, alignment). The editor reads Math.random() while
 * rendering, so it only mounts after hydration.
 */
export function RichTextEditor(props: EditorProps) {
  const hydrated = useHydrated();
  return hydrated ? <EditorSurface {...props} /> : <EditorFrame invalid={props.invalid} />;
}

function EditorFrame({ invalid, children }: { invalid?: boolean; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-field pb-2 transition-shadow focus-within:ring-3 focus-within:ring-ring/30',
        invalid && 'ring-2 ring-destructive/40 focus-within:ring-destructive/40',
      )}
    >
      {children ?? <div className="min-h-[400px]" aria-busy="true" />}
    </div>
  );
}

function EditorSurface({ onChange, invalid, id }: EditorProps) {
  const editor = useEditor({
    // Only mounted after hydration (see RichTextEditor), so rendering immediately is safe.
    immediatelyRender: true,
    // StarterKit v3 already includes Underline and Link.
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Message body',
        class:
          'min-h-[300px] px-5 py-4 text-sm leading-6 outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML(), e.isEmpty),
  });

  return (
    <EditorFrame invalid={invalid}>
      {editor ? (
        <>
          {/* The design labels the area above the toolbar; the textbox itself is named via aria-label. */}
          <p className="px-5 pt-3.5 pb-1 text-sm text-muted-foreground" aria-hidden>
            Type Your Reply...
          </p>
          <Toolbar editor={editor} />
          <EditorContent editor={editor} />
        </>
      ) : undefined}
    </EditorFrame>
  );
}
