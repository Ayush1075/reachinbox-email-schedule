import { convert } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';

/**
 * Exactly what the compose editor's toolbar can produce. Anything else
 * (scripts, event handlers, iframes, arbitrary styles) is stripped before the
 * body is stored, so it is safe both in recipients' inboxes and when the
 * dashboard renders it back.
 */
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'], '*': ['style'] },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, ALLOWED);
}

/** Plain-text alternative sent alongside the HTML part. */
export function htmlToPlainText(html: string): string {
  return convert(html, { wordwrap: 100, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] });
}

/** One-line excerpt for list rows. */
export function bodyPreview(body: string, isHtml: boolean, max = 160): string {
  const text = (isHtml ? convert(body, { wordwrap: false, selectors: [{ selector: 'ul', options: { itemPrefix: '• ' } }] }) : body).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
