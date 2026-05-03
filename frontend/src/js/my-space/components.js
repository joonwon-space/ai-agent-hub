/**
 * components.js — Small DOM helper functions for My Space pages.
 *
 * IMPORTANT: Zero innerHTML usage. All content built with createElement/textContent.
 */

'use strict';

/**
 * Generic element factory.
 * @param {string} tag
 * @param {Object} [props] — className, id, dataset, style, onClick, textContent, type, href, etc.
 * @param {Array<HTMLElement|string>} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
  const elem = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') {
      elem.className = value;
    } else if (key === 'textContent') {
      elem.textContent = value;
    } else if (key === 'onClick') {
      elem.addEventListener('click', value);
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        elem.dataset[dk] = dv;
      }
    } else if (key === 'style') {
      for (const [sk, sv] of Object.entries(value)) {
        elem.style[sk] = sv;
      }
    } else if (key === 'attrs') {
      for (const [ak, av] of Object.entries(value)) {
        elem.setAttribute(ak, av);
      }
    } else {
      // for id, type, href, value, placeholder, disabled, etc.
      elem[key] = value;
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      elem.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      elem.appendChild(child);
    }
  }

  return elem;
}

/**
 * Render a template selection card for the onboarding screen.
 *
 * @param {{ template: string, label: string, description: string, emoji: string, onClick: Function }} opts
 * @returns {HTMLElement}
 */
function renderTemplateCard({ template, label, description, emoji, onClick }) {
  const card = el('button', {
    className: `template-card template-card--${template}`,
    attrs: { type: 'button', 'data-template': template },
    onClick,
  });

  const iconEl = el('div', { className: 'template-card__icon', textContent: emoji });
  const labelEl = el('div', { className: 'template-card__label', textContent: label });
  const descEl = el('div', { className: 'template-card__desc', textContent: description });

  card.appendChild(iconEl);
  card.appendChild(labelEl);
  card.appendChild(descEl);

  return card;
}

/**
 * Render a diary entry card for the dashboard list.
 *
 * @param {{ entry: Object, onClick: Function }} opts
 * @returns {HTMLElement}
 */
function renderDiaryCard({ entry, onClick }) {
  const card = el('div', {
    className: 'diary-card',
    dataset: { id: String(entry.id) },
    onClick,
  });

  // Date line
  const dateStr = entry.entryDate
    ? new Date(entry.entryDate).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const dateEl = el('div', { className: 'diary-card__date', textContent: dateStr });

  // Title line
  const titleEl = el('div', { className: 'diary-card__title', textContent: entry.title || '' });

  // Mood badge (optional)
  const moodEmojis = { happy: '😊', sad: '😔', angry: '😤', tired: '😴' };
  let moodEl = null;
  if (entry.mood && moodEmojis[entry.mood]) {
    moodEl = el('span', { className: 'diary-card__mood', textContent: moodEmojis[entry.mood] });
  }

  // Body preview (first 80 chars)
  const preview = (entry.body || '').slice(0, 80) + ((entry.body || '').length > 80 ? '…' : '');
  const bodyEl = el('div', { className: 'diary-card__preview', textContent: preview });

  card.appendChild(dateEl);
  const titleRow = el('div', { className: 'diary-card__title-row' });
  titleRow.appendChild(titleEl);
  if (moodEl) titleRow.appendChild(moodEl);
  card.appendChild(titleRow);
  card.appendChild(bodyEl);

  return card;
}
