/**
 * search.js — My Space unified search module.
 *
 * Exposes: window.search = { query, render, navigate }
 *
 * Dependencies:
 *   - authFetch (from auth.js, loaded as global script tag)
 *   - Must be loaded BEFORE my-space.js
 *
 * Rules: zero innerHTML usage. All DOM built via createElement/textContent.
 */

'use strict';

(function (global) {
  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  /**
   * Fetch search results from the backend.
   *
   * @param {string} q      — search query (1–100 chars)
   * @param {number} [limit=10] — max results per group (1–50)
   * @returns {Promise<{ query: string, total: number, groups: { diary: Array, recipe: Array, note: Array } }>}
   * @throws {{ status: number, error: string, details?: object }} on non-OK
   */
  async function query(q, limit) {
    const limitParam = limit !== undefined ? limit : 10;
    const url =
      '/api/my-space/search?q=' +
      encodeURIComponent(q) +
      '&limit=' +
      encodeURIComponent(limitParam);

    const res = await authFetch(url);
    // authFetch returns null on 401 (redirect already triggered)
    if (!res) return null;

    if (!res.ok) {
      let body = {};
      try {
        body = await res.json();
      } catch (_) {
        // ignore parse error
      }
      const err = { status: res.status, error: body.error || 'Search failed', details: body.details };
      throw err;
    }

    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Highlight helper
  // ---------------------------------------------------------------------------

  /**
   * Build a DocumentFragment with the query string highlighted via <mark> elements.
   * Never uses innerHTML. Splits on case-insensitive match.
   *
   * @param {string} text
   * @param {string} searchQuery
   * @returns {DocumentFragment}
   */
  function buildHighlightedFragment(text, searchQuery) {
    const frag = document.createDocumentFragment();
    if (!text || !searchQuery) {
      frag.appendChild(document.createTextNode(text || ''));
      return frag;
    }

    const lower = text.toLowerCase();
    const qLower = searchQuery.toLowerCase();
    let cursor = 0;

    while (cursor < text.length) {
      const idx = lower.indexOf(qLower, cursor);
      if (idx === -1) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
        break;
      }
      // Text before match
      if (idx > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
      }
      // Match wrapped in <mark>
      const mark = document.createElement('mark');
      mark.className = 'ms-search-mark';
      mark.textContent = text.slice(idx, idx + searchQuery.length);
      frag.appendChild(mark);
      cursor = idx + searchQuery.length;
    }

    return frag;
  }

  // ---------------------------------------------------------------------------
  // Navigate
  // ---------------------------------------------------------------------------

  /**
   * Navigate to a search result's edit page.
   *
   * @param {{ id: number, spaceId: number }} result
   * @param {'diary'|'recipe'|'note'} type
   */
  function navigateToResult(result, type) {
    switch (type) {
      case 'diary':
        window.location.href = '/my-space/diary/' + result.id + '?spaceId=' + result.spaceId;
        break;
      case 'recipe':
        window.location.href = '/my-space/recipes/' + result.id + '/view?spaceId=' + result.spaceId;
        break;
      case 'note':
        window.location.href = '/my-space/notes/' + result.id + '?spaceId=' + result.spaceId;
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Result card builder
  // ---------------------------------------------------------------------------

  const TYPE_LABELS = {
    diary: '일기',
    recipe: '레시피',
    note: '노트',
  };

  /**
   * Format a date string as a short locale date.
   * @param {string} dateStr
   * @returns {string}
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  /**
   * Build a search result card element.
   *
   * @param {object} result
   * @param {'diary'|'recipe'|'note'} type
   * @param {string} searchQuery
   * @param {Function} navigateFn
   * @returns {HTMLElement}
   */
  function buildResultCard(result, type, searchQuery, navigateFn) {
    const card = document.createElement('div');
    card.className = 'ms-search-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    card.addEventListener('click', () => navigateFn(result, type));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateFn(result, type);
      }
    });

    // Badge
    const badge = document.createElement('span');
    badge.className = 'ms-search-badge ms-search-badge--' + type;
    badge.textContent = TYPE_LABELS[type] || type;
    card.appendChild(badge);

    // Body
    const body = document.createElement('div');
    body.className = 'ms-search-card__body';

    // Title — use name for recipe, title for diary/note
    const titleText = type === 'recipe' ? result.name : result.title;
    const titleEl = document.createElement('div');
    titleEl.className = 'ms-search-card__title';
    titleEl.appendChild(buildHighlightedFragment(titleText || '', searchQuery));
    body.appendChild(titleEl);

    // Snippet
    if (result.snippet) {
      const snippetEl = document.createElement('div');
      snippetEl.className = 'ms-search-card__snippet';
      snippetEl.appendChild(buildHighlightedFragment(result.snippet, searchQuery));
      body.appendChild(snippetEl);
    }

    // Footer: spaceName + date
    const footer = document.createElement('div');
    footer.className = 'ms-search-card__footer';

    const spaceNameEl = document.createElement('span');
    spaceNameEl.textContent = result.spaceName || '';
    footer.appendChild(spaceNameEl);

    const sep = document.createElement('span');
    sep.textContent = ' · ';
    footer.appendChild(sep);

    const dateEl = document.createElement('span');
    dateEl.textContent = formatDate(result.updatedAt);
    footer.appendChild(dateEl);

    body.appendChild(footer);
    card.appendChild(body);

    return card;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Render search results into the given container element.
   *
   * @param {HTMLElement} container
   * @param {{ query: string, total: number, groups: { diary: Array, recipe: Array, note: Array } }} response
   * @param {Function} navigateFn — called with (result, type) on card click
   */
  function renderSearchResults(container, response, navigateFn) {
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // A-10: defensive check — bail if the input has been cleared since
    // the request started. Belt-and-suspenders alongside the page-level
    // currentQuery race-cancellation.
    const input = document.getElementById('ms-search-input');
    if (input && (!input.value || input.value.trim() === '')) {
      container.hidden = true;
      const mainContent = document.getElementById('ms-main-content');
      if (mainContent) mainContent.hidden = false;
      return;
    }

    if (!response || response.total === 0) {
      const empty = document.createElement('div');
      empty.className = 'ms-search-empty';
      empty.textContent = '검색 결과 없음';
      container.appendChild(empty);
      return;
    }

    const searchQuery = response.query || '';
    const groupDefs = [
      { key: 'diary', label: '일기' },
      { key: 'recipe', label: '레시피' },
      { key: 'note', label: '노트' },
    ];

    for (const { key, label } of groupDefs) {
      const items = response.groups[key];
      if (!items || items.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'ms-search-group';

      // Group header
      const header = document.createElement('div');
      header.className = 'ms-search-group__header';
      header.textContent = label + ' (' + items.length + ')';
      section.appendChild(header);

      // Result cards
      for (const result of items) {
        const card = buildResultCard(result, key, searchQuery, navigateFn);
        section.appendChild(card);
      }

      container.appendChild(section);
    }
  }

  // ---------------------------------------------------------------------------
  // Expose global
  // ---------------------------------------------------------------------------
  global.search = {
    query,
    render: renderSearchResults,
    navigate: navigateToResult,
  };
}(window));
