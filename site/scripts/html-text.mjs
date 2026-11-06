// Plain-text views of built HTML for the tests and the readiness check (Security PR 1, CodeQL js/bad-tag-filter,
// js/incomplete-multi-character-sanitization, js/double-escaping). Every removal repeats until nothing changes, so a
// removal can never leave a new tag behind, and the end-tag patterns accept any case and "</script >" forms.
// These read our own build output for assertions; nothing here sanitizes untrusted input for display.

/** Applies `re` (global) until the string stops changing. */
export function replaceUntilStable(s, re, by = '') {
  let prev;
  do {
    prev = s;
    s = s.replace(re, by);
  } while (s !== prev);
  return s;
}

/** Removes every <script> element (any case, end tag with optional whitespace or attributes). */
export const stripScripts = (h, by = '') => replaceUntilStable(h, /<script[\s\S]*?<\/script[^>]*>/gi, by);

/** Removes every <style> element (any case, end tag with optional whitespace or attributes). */
export const stripStyles = (h, by = '') => replaceUntilStable(h, /<style[\s\S]*?<\/style[^>]*>/gi, by);

/** Removes every tag. */
export const stripTags = (h, by = '') => replaceUntilStable(h, /<[^>]+>/g, by);

/** Decodes the entities the build emits; &amp; last, so "&amp;lt;" reads "&lt;" and never "<". */
export const decodeEntities = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
