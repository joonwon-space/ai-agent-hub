/**
 * deleteSpaceModal.js — Delete-confirm modal for My Space.
 *
 * Exposes: window.deleteSpaceModal = { show, hide }
 *
 * show({ space, onConfirm }):
 *   Builds modal DOM via createElement only (zero innerHTML/outerHTML).
 *   Requires user to type the exact space.name before the danger button enables.
 *   Dismiss via: backdrop click, Esc key, cancel button, or successful confirm.
 *
 * hide():
 *   Removes the modal from DOM, restores focus to the previously active element.
 *   Safe to call when no modal is open.
 *
 * Re-entry safe: calling show() while one is open hides the previous first.
 */

'use strict';

(function () {
  /** @type {HTMLElement|null} Current backdrop element */
  let _currentBackdrop = null;

  /** @type {Element|null} Element that had focus before modal opened */
  let _previousFocus = null;

  /** @type {AbortController|null} For cleanup of keyboard listeners */
  let _abortController = null;

  /**
   * Hide and remove the current modal from the DOM.
   * Restores focus to the previously focused element.
   */
  function hide() {
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
    if (_currentBackdrop && _currentBackdrop.parentNode) {
      _currentBackdrop.parentNode.removeChild(_currentBackdrop);
    }
    _currentBackdrop = null;
    if (_previousFocus && typeof _previousFocus.focus === 'function') {
      _previousFocus.focus();
    }
    _previousFocus = null;
  }

  /**
   * Show the delete confirm modal.
   *
   * @param {{ space: { id: number, name: string }, onConfirm: function }} opts
   */
  function show({ space, onConfirm }) {
    // Re-entry safe: hide any existing modal first
    if (_currentBackdrop) {
      hide();
    }

    // Remember which element had focus so we can restore on close
    _previousFocus = document.activeElement;

    // AbortController for keyboard listener cleanup
    _abortController = new AbortController();
    const { signal } = _abortController;

    // -------------------------------------------------------------------------
    // Build DOM — zero innerHTML
    // -------------------------------------------------------------------------

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ms-modal-backdrop';

    // Card (stops click propagation so it doesn't dismiss)
    const card = document.createElement('div');
    card.className = 'ms-modal-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ms-modal-title');

    // Title
    const title = document.createElement('h3');
    title.className = 'ms-modal-card__title';
    title.id = 'ms-modal-title';
    title.textContent = '공간 삭제';

    // Body paragraph — renders space.name safely via textContent
    const body = document.createElement('p');
    body.className = 'ms-modal-card__body';
    body.textContent = `${space.name} 을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.`;

    // Warning box
    const warning = document.createElement('div');
    warning.className = 'ms-modal-card__warning';
    warning.textContent = '공간 안의 모든 콘텐츠(일기/레시피/노트/Jira 워크스페이스)가 함께 삭제됩니다.';

    // Label for confirmation input
    const label = document.createElement('label');
    label.className = 'ms-modal-card__label';
    label.textContent = '확인을 위해 공간 이름을 정확히 입력하세요';
    label.setAttribute('for', 'ms-modal-confirm-input');

    // Confirmation input
    const input = document.createElement('input');
    input.className = 'ms-modal-card__input';
    input.id = 'ms-modal-confirm-input';
    input.type = 'text';
    input.placeholder = '공간 이름을 정확히 입력하세요';
    input.autocomplete = 'off';

    // Actions row
    const actions = document.createElement('div');
    actions.className = 'ms-modal-card__actions';

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = '취소';

    // Danger (confirm delete) button — initially disabled
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '삭제';
    deleteBtn.disabled = true;

    // -------------------------------------------------------------------------
    // Assemble
    // -------------------------------------------------------------------------
    actions.appendChild(cancelBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(warning);
    card.appendChild(label);
    card.appendChild(input);
    card.appendChild(actions);

    backdrop.appendChild(card);

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    // Enable/disable delete button based on name match
    input.addEventListener('input', function () {
      deleteBtn.disabled = input.value !== space.name;
    }, { signal });

    // Backdrop click → hide (but not when clicking inside the card)
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) {
        hide();
      }
    }, { signal });

    // Card click stops propagation to backdrop
    card.addEventListener('click', function (e) {
      e.stopPropagation();
    }, { signal });

    // Cancel button
    cancelBtn.addEventListener('click', function () {
      hide();
    }, { signal });

    // Delete button
    deleteBtn.addEventListener('click', function () {
      if (deleteBtn.disabled) return;
      onConfirm(space);
      hide();
    }, { signal });

    // Keyboard handler on document for Esc + Enter
    document.addEventListener('keydown', function (e) {
      if (!_currentBackdrop) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        hide();
        return;
      }
      if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        if (input.value === space.name) {
          onConfirm(space);
          hide();
        }
      }
    }, { signal });

    // -------------------------------------------------------------------------
    // Mount
    // -------------------------------------------------------------------------
    document.body.appendChild(backdrop);
    _currentBackdrop = backdrop;

    // Focus the input after mounting
    setTimeout(function () {
      if (_currentBackdrop) {
        input.focus();
      }
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Expose global
  // ---------------------------------------------------------------------------
  window.deleteSpaceModal = { show, hide };
}());
