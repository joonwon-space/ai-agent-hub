/**
 * markdown.js — Minimal, security-critical hand-rolled Markdown renderer.
 *
 * Security policy (STRICT — do not relax):
 *   - NO external libraries (no marked, markdown-it, DOMPurify)
 *   - NO innerHTML anywhere, including temporary assignments
 *   - All DOM built via document.createElement + textContent
 *   - URL allowlist: only http://, https://, /, # prefixes
 *   - Reject javascript:, data:, vbscript:, and any other scheme
 *   - Allowed elements: h1, h2, h3, p, br, strong, em, code, pre, ul, ol, li, blockquote, a
 *
 * Supported syntax:
 *   Block: # H1, ## H2, ### H3, - item, * item, 1. item,
 *          > blockquote, ``` fenced code, blank-line paragraph breaks
 *   Inline: **bold**, *italic*, `code`, [text](url)
 *
 * Usage:
 *   import { render } from './markdown.js';  // or access as global
 *   const fragment = render(markdownString);
 *   container.appendChild(fragment);
 *
 * Module size target: <300 lines. Keep it auditable.
 */

'use strict';

// ---------------------------------------------------------------------------
// URL safety checker (allowlist-only)
// ---------------------------------------------------------------------------

const SAFE_URL_PREFIXES = ['http://', 'https://', '/', '#'];

/**
 * Return true if the URL is safe to use as an href.
 * Only http/https/relative/anchor links are permitted.
 * Rejects javascript:, data:, vbscript:, and other schemes.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  // Reject empty
  if (trimmed.length === 0) return false;
  // Check against allowlist prefixes
  for (const prefix of SAFE_URL_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inline parser
// ---------------------------------------------------------------------------

/**
 * Parse inline markdown tokens in a text string and return a DocumentFragment.
 * Processes: **bold**, *italic*, `code`, [text](url)
 * Any unrecognized content is rendered as plain text.
 *
 * IMPORTANT: No innerHTML used — all nodes created via createElement/textContent.
 *
 * @param {string} text
 * @returns {DocumentFragment}
 */
function parseInline(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;

  // Pattern matches inline tokens in priority order:
  //   1. [text](url) links
  //   2. **bold**
  //   3. *italic*
  //   4. `code`
  const pattern = /\[([^\]]*)\]\(([^)]*)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Append plain text before this match
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // [text](url) — link
      const linkText = match[1];
      const linkUrl = match[2];
      if (isSafeUrl(linkUrl)) {
        const a = document.createElement('a');
        a.href = linkUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkText;
        frag.appendChild(a);
      } else {
        // Unsafe URL — render plain text (no anchor element)
        frag.appendChild(document.createTextNode(linkText));
      }
    } else if (match[3] !== undefined) {
      // **bold**
      const strong = document.createElement('strong');
      strong.textContent = match[3];
      frag.appendChild(strong);
    } else if (match[4] !== undefined) {
      // *italic*
      const em = document.createElement('em');
      em.textContent = match[4];
      frag.appendChild(em);
    } else if (match[5] !== undefined) {
      // `code`
      const code = document.createElement('code');
      code.textContent = match[5];
      frag.appendChild(code);
    }

    lastIndex = pattern.lastIndex;
  }

  // Append remaining plain text
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return frag;
}

// ---------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------

/**
 * Parse a fenced code block starting at lines[start].
 * Returns { node: HTMLElement, endIndex: number }.
 * @param {string[]} lines
 * @param {number} start - index of the opening ``` line
 * @returns {{ node: HTMLElement, endIndex: number }}
 */
function parseFencedCode(lines, start) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.appendChild(code);

  const codeLines = [];
  let i = start + 1;
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith('```')) {
      i++; // consume closing fence
      break;
    }
    codeLines.push(lines[i]);
    i++;
  }
  code.textContent = codeLines.join('\n');
  return { node: pre, endIndex: i };
}

/**
 * Parse a list block starting at lines[start].
 * Returns { node: HTMLElement, endIndex: number }.
 * @param {string[]} lines
 * @param {number} start - index of first list item
 * @param {boolean} isOrdered
 * @returns {{ node: HTMLElement, endIndex: number }}
 */
function parseList(lines, start, isOrdered) {
  const list = document.createElement(isOrdered ? 'ol' : 'ul');
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const unorderedMatch = !isOrdered && /^[-*]\s+(.*)/.exec(line);
    const orderedMatch = isOrdered && /^\d+\.\s+(.*)/.exec(line);
    const match = unorderedMatch || orderedMatch;

    if (!match) break;

    const li = document.createElement('li');
    li.appendChild(parseInline(match[1]));
    list.appendChild(li);
    i++;
  }

  return { node: list, endIndex: i };
}

/**
 * Accumulate consecutive paragraph lines and return a <p> element.
 * @param {string[]} paragraphLines
 * @returns {HTMLElement}
 */
function buildParagraph(paragraphLines) {
  const p = document.createElement('p');
  paragraphLines.forEach((line, idx) => {
    p.appendChild(parseInline(line));
    if (idx < paragraphLines.length - 1) {
      p.appendChild(document.createElement('br'));
    }
  });
  return p;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a markdown string into a DocumentFragment.
 * The returned fragment contains only safe, allowlisted DOM elements.
 * No innerHTML is used anywhere in this function or its callees.
 *
 * @param {string} markdownString
 * @returns {DocumentFragment}
 */
function render(markdownString) {
  const frag = document.createDocumentFragment();

  if (typeof markdownString !== 'string' || markdownString.length === 0) {
    return frag;
  }

  const lines = markdownString.split('\n');
  let i = 0;
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    frag.appendChild(buildParagraph(paragraphLines));
    paragraphLines = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      const { node, endIndex } = parseFencedCode(lines, i);
      frag.appendChild(node);
      i = endIndex;
      continue;
    }

    // Heading (# ## ###)
    const headingMatch = /^(#{1,3})\s+(.*)/.exec(line);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const tag = `h${level}`;
      const heading = document.createElement(tag);
      heading.appendChild(parseInline(headingMatch[2]));
      frag.appendChild(heading);
      i++;
      continue;
    }

    // Blockquote
    const blockquoteMatch = /^>\s?(.*)/.exec(line);
    if (blockquoteMatch) {
      flushParagraph();
      const bq = document.createElement('blockquote');
      bq.appendChild(parseInline(blockquoteMatch[1]));
      frag.appendChild(bq);
      i++;
      continue;
    }

    // Unordered list item
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const { node, endIndex } = parseList(lines, i, false);
      frag.appendChild(node);
      i = endIndex;
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const { node, endIndex } = parseList(lines, i, true);
      frag.appendChild(node);
      i = endIndex;
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    // Regular paragraph content
    paragraphLines.push(line);
    i++;
  }

  // Flush remaining paragraph lines
  flushParagraph();

  return frag;
}
