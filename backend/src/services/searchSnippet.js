/**
 * searchSnippet.js — Server-side snippet extraction helper.
 *
 * Returns a plain-text excerpt of `text` centered around the first match
 * of `query` (case-insensitive). HTML escaping is left to the frontend.
 */

'use strict';

/**
 * Extract a contextual snippet of text around the first occurrence of query.
 *
 * @param {string|null|undefined} text     — source text
 * @param {string}               query    — search term (case-insensitive)
 * @param {number}               [contextChars=40] — chars to include each side of match
 * @param {number}               [maxLen=200]      — hard cap on returned length
 * @returns {string}
 */
function extractSnippet(text, query, contextChars = 40, maxLen = 200) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) {
    return text.slice(0, contextChars * 2).trim() + (text.length > contextChars * 2 ? '…' : '');
  }
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet.length > maxLen ? snippet.slice(0, maxLen) + '…' : snippet;
}

module.exports = { extractSnippet };
