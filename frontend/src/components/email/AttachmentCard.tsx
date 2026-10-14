import { FileText, Loader2, X } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Attachment tile from the design: image preview on top, name and size below.
 * Non-images show a file icon. Used in the reading view (as a link) and in
 * compose (with a remove button while uploading or before sending).
 */
export function AttachmentCard({
  filename,
  size,
  previewSrc,
  href,
  uploading = false,
  onRemove,
}: {
  filename: string;
  size: number;
  previewSrc?: string;
  href?: string;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  const body = (
    <>
      <div className="flex h-[118px] items-center justify-center overflow-hidden bg-muted">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated API images and local object URLs can't go through next/image
          <img src={previewSrc} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[13px]" title={filename}>
          {filename}
        </p>
        <p className="text-[11px] text-muted-foreground">{uploading ? 'Uploading…' : formatBytes(size)}</p>
      </div>
    </>
  );

  return (
    <div className="group relative w-[209px] shrink-0 overflow-hidden rounded-[10px] bg-field">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="block rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Open attachment ${filename}`}
        >
          {body}
        </a>
      ) : (
        body
      )}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-background/50" aria-hidden>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${filename}`}
          className={cn(
            'absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm outline-none',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
