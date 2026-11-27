import DOMPurify from 'dompurify';

/**
 * HTML safe to show in Ghostify pages: no scripts, styles, forms, frames or event handlers, and
 * links open in a new tab. Used for article content and feedgrab's in-feed item HTML.
 */
export function sanitizeHtml(html: string): string {
  const purify = DOMPurify(window);
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noreferrer');
    }
  });
  return purify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
  });
}
