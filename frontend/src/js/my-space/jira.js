/**
 * jira.js — Jira workspace pane for My Space.
 *
 * Exposes: window.renderJiraPane(container, spaceId)
 *
 * Flow:
 *   1. User fills in overview textarea (+ optional file attachment)
 *   2. "미리보기 생성" → previewAgent('jira', input) → show preview card
 *   3. "Jira 이슈 생성" → runAgent('jira', { ...input, fields }) → show success card
 *   4. If Jira not configured → show settings-required card with /settings link
 *
 * Dependencies (globals via script tags):
 *   - previewAgent, runAgent, uploadFile — from api.js
 *   - el — from my-space/components.js
 *
 * IMPORTANT: Zero innerHTML usage. All DOM via createElement/textContent/appendChild.
 */

'use strict';

// ---------------------------------------------------------------------------
// Internal DOM helpers
// ---------------------------------------------------------------------------

/**
 * Clear a container safely (no innerHTML).
 * @param {HTMLElement} container
 */
function clearEl(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

/**
 * Build a spinner span (CSS must define .jira-spinner).
 * @returns {HTMLElement}
 */
function makeSpinner() {
  return el('span', { className: 'jira-spinner', attrs: { 'aria-hidden': 'true' } });
}

/**
 * Show an inline error message inside a container (appended, not replacing).
 * @param {HTMLElement} container
 * @param {string} message
 */
function appendInlineError(container, message) {
  const errEl = el('div', { className: 'jira-inline-error', textContent: message });
  container.appendChild(errEl);
}

// ---------------------------------------------------------------------------
// Settings-required card
// ---------------------------------------------------------------------------

/**
 * Replace the pane with a "Jira 설정이 필요합니다" warning card.
 * @param {HTMLElement} container
 */
function renderSettingsRequired(container) {
  clearEl(container);

  const card = el('div', { className: 'jira-settings-card' });

  const icon = el('div', { className: 'jira-settings-card__icon', textContent: '⚙️' });

  const heading = el('h2', {
    className: 'jira-settings-card__heading',
    textContent: 'Jira 설정이 필요합니다',
  });

  const body = el('p', {
    className: 'jira-settings-card__body',
    textContent:
      'Jira 이슈를 생성하려면 먼저 설정 페이지에서 아래 항목을 입력해야 합니다: ' +
      'base_url, email, api_token, project_key',
  });

  const link = el('a', {
    className: 'btn btn-primary',
    textContent: '설정으로 이동',
    attrs: { href: '/settings' },
  });

  card.appendChild(icon);
  card.appendChild(heading);
  card.appendChild(body);
  card.appendChild(link);
  container.appendChild(card);
}

// ---------------------------------------------------------------------------
// Preview card
// ---------------------------------------------------------------------------

/**
 * Build a label+value row for the preview card.
 * @param {string} label
 * @param {string} value
 * @returns {HTMLElement}
 */
function makePreviewRow(label, value) {
  const row = el('div', { className: 'jira-preview-row' });
  const keyEl = el('div', { className: 'jira-preview-key', textContent: label });
  const valEl = el('div', { className: 'jira-preview-val', textContent: value });
  row.appendChild(keyEl);
  row.appendChild(valEl);
  return row;
}

/**
 * Render the preview card after a successful previewAgent() call.
 * @param {HTMLElement} container
 * @param {Object} data — previewAgent response
 * @param {Function} onConfirm
 * @param {Function} onReset
 */
function renderPreviewCard(container, data, onConfirm, onReset) {
  const fields = data.fields || data;

  const divider = el('hr', { className: 'jira-divider' });
  container.appendChild(divider);

  const card = el('div', { className: 'jira-preview-card' });

  const heading = el('h3', {
    className: 'jira-preview-card__heading',
    textContent: 'AI 추출 결과 — 확인 후 생성하세요',
  });

  card.appendChild(heading);
  card.appendChild(makePreviewRow('Summary', fields.summary || ''));
  card.appendChild(makePreviewRow('Description', fields.description || ''));
  card.appendChild(makePreviewRow('Type', fields.issuetype || ''));
  card.appendChild(makePreviewRow('Priority', fields.priority || ''));

  container.appendChild(card);

  // Button row
  const btnRow = el('div', { className: 'jira-btn-row' });

  const confirmSpinner = makeSpinner();
  confirmSpinner.style.display = 'none';

  const confirmBtn = el('button', {
    className: 'btn btn-success',
    attrs: { type: 'button' },
  });
  confirmBtn.appendChild(confirmSpinner);
  confirmBtn.appendChild(document.createTextNode('Jira 이슈 생성'));
  confirmBtn.addEventListener('click', onConfirm);

  const resetBtn = el('button', {
    className: 'btn btn-secondary',
    textContent: '다시 작성',
    attrs: { type: 'button' },
    onClick: onReset,
  });

  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(resetBtn);
  container.appendChild(btnRow);
}

// ---------------------------------------------------------------------------
// Success card
// ---------------------------------------------------------------------------

/**
 * Render the success card after runAgent() returns.
 * @param {HTMLElement} container
 * @param {Object} data — runAgent response
 */
function renderSuccessCard(container, data) {
  const card = el('div', { className: 'jira-success-card' });

  const heading = el('h3', {
    className: 'jira-success-card__heading',
    textContent: 'Jira 이슈가 생성되었습니다 ✓',
  });
  card.appendChild(heading);

  if (data.key) {
    const keyRow = el('div', { className: 'jira-preview-row' });
    const keyLabel = el('div', { className: 'jira-preview-key', textContent: 'Issue Key' });
    const keyVal = el('div', { className: 'jira-preview-val', textContent: data.key });
    keyRow.appendChild(keyLabel);
    keyRow.appendChild(keyVal);
    card.appendChild(keyRow);
  }

  if (data.url || data.issueUrl) {
    const url = data.url || data.issueUrl;
    const urlRow = el('div', { className: 'jira-preview-row' });
    const urlLabel = el('div', { className: 'jira-preview-key', textContent: 'URL' });
    const urlLink = el('a', {
      className: 'jira-preview-val',
      textContent: url,
      attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' },
    });
    urlRow.appendChild(urlLabel);
    urlRow.appendChild(urlLink);
    card.appendChild(urlRow);
  }

  container.appendChild(card);
}

// ---------------------------------------------------------------------------
// Main pane renderer
// ---------------------------------------------------------------------------

/**
 * Render the Jira workspace pane into the given container.
 * @param {HTMLElement} container
 * @param {number} spaceId — currently unused but reserved for per-space config
 */
async function renderJiraPane(container, spaceId) {
  clearEl(container);

  // A-12: proactively check whether Jira is configured before rendering
  // the form. The previous implementation only surfaced the settings-gate
  // card AFTER a preview/run call failed, so users could fill in the form
  // and only then learn they couldn't submit. This fetch is cheap and
  // deterministic.
  try {
    const settingsRes = await authFetch('/api/settings');
    if (settingsRes && settingsRes.ok) {
      const settings = await settingsRes.json();
      const required = ['jira_base_url', 'jira_email', 'jira_api_token', 'jira_project_key'];
      const missing = required.filter((k) => !settings[k]);
      if (missing.length > 0) {
        renderSettingsRequired(container);
        return;
      }
    }
  } catch (_) {
    // network/settings endpoint failure — fall through to form render
    // and let the existing reactive gate take over on first preview call
  }

  // Pane wrapper
  const pane = el('div', { className: 'jira-pane' });

  // Header
  const header = el('div', { className: 'ms-pane__header' });
  const title = el('h2', { className: 'ms-pane__title', textContent: 'Jira 이슈 자동 생성' });
  const helper = el('p', {
    className: 'jira-helper-text',
    textContent: '작업 개요를 입력하면 AI가 Jira 이슈 필드를 자동으로 추출합니다.',
  });
  header.appendChild(title);
  header.appendChild(helper);
  pane.appendChild(header);

  // Form section
  const form = el('div', { className: 'jira-form' });

  // Overview label + textarea
  const overviewLabel = el('label', {
    className: 'jira-form__label',
    textContent: '작업 개요',
    attrs: { for: 'jira-overview' },
  });

  const overviewTextarea = el('textarea', {
    id: 'jira-overview',
    className: 'jira-form__textarea',
    attrs: {
      placeholder: '구현할 기능이나 수정할 버그를 설명하세요…',
      rows: '6',
    },
  });

  // File input label + input
  const fileLabel = el('label', {
    className: 'jira-form__label jira-form__label--optional',
    textContent: '첨부 파일 (선택)',
    attrs: { for: 'jira-file' },
  });

  const fileInput = el('input', {
    id: 'jira-file',
    className: 'jira-form__file',
    attrs: { type: 'file' },
  });

  // Stored file data from upload
  let fileData = null;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) {
      fileData = null;
      return;
    }
    try {
      fileData = await uploadFile(file);
    } catch (err) {
      fileData = null;
      appendInlineError(form, '파일 업로드에 실패했습니다: ' + (err.message || '알 수 없는 오류'));
    }
  });

  // Button row
  const btnRow = el('div', { className: 'jira-btn-row' });

  const previewSpinner = makeSpinner();
  previewSpinner.style.display = 'none';

  const previewBtn = el('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
  });
  previewBtn.appendChild(previewSpinner);
  previewBtn.appendChild(document.createTextNode('미리보기 생성'));

  btnRow.appendChild(previewBtn);

  form.appendChild(overviewLabel);
  form.appendChild(overviewTextarea);
  form.appendChild(fileLabel);
  form.appendChild(fileInput);
  form.appendChild(btnRow);
  pane.appendChild(form);

  // Dynamic results area (below form)
  const resultsArea = el('div', { className: 'jira-results' });
  pane.appendChild(resultsArea);

  container.appendChild(pane);

  // ---------------------------------------------------------------------------
  // Stored preview data
  // ---------------------------------------------------------------------------
  let previewedFields = null;

  /**
   * Reset state — clear results, re-enable preview button, clear stored data.
   */
  function resetToForm() {
    clearEl(resultsArea);
    previewedFields = null;
    previewBtn.disabled = false;
    previewBtn.lastChild.textContent = '미리보기 생성';
    previewSpinner.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // Preview handler
  // ---------------------------------------------------------------------------
  previewBtn.addEventListener('click', async () => {
    const overview = overviewTextarea.value.trim();
    if (!overview) {
      clearEl(resultsArea);
      appendInlineError(resultsArea, '작업 개요를 입력해주세요.');
      return;
    }

    clearEl(resultsArea);
    previewedFields = null;
    previewBtn.disabled = true;
    previewSpinner.style.display = 'inline-block';

    const input = { overview };
    if (fileData) {
      input.fileData = fileData;
    }

    let data;
    try {
      data = await previewAgent('jira', input);
    } catch (err) {
      previewBtn.disabled = false;
      previewSpinner.style.display = 'none';

      if (/Jira 설정이 없습니다|Jira 설정/i.test(err.message || '')) {
        renderSettingsRequired(resultsArea);
      } else {
        appendInlineError(resultsArea, '미리보기 생성 실패: ' + (err.message || '알 수 없는 오류'));
      }
      return;
    }

    previewBtn.disabled = false;
    previewSpinner.style.display = 'none';

    if (!data) {
      appendInlineError(resultsArea, '빈 응답이 반환되었습니다. 다시 시도해주세요.');
      return;
    }

    previewedFields = data.fields || data;

    // Confirm handler (defined here so it closes over current previewedFields)
    async function handleConfirm() {
      clearEl(resultsArea);

      const confirmSpinnerEl = makeSpinner();
      const confirmMsg = el('div', { className: 'jira-loading-msg' });
      confirmMsg.appendChild(confirmSpinnerEl);
      confirmMsg.appendChild(document.createTextNode(' Jira 이슈 생성 중…'));
      resultsArea.appendChild(confirmMsg);

      const runInput = { overview };
      if (fileData) {
        runInput.fileData = fileData;
      }
      runInput.fields = previewedFields;

      let result;
      try {
        result = await runAgent('jira', runInput);
      } catch (err) {
        clearEl(resultsArea);
        appendInlineError(resultsArea, 'Jira 이슈 생성 실패: ' + (err.message || '알 수 없는 오류'));
        return;
      }

      clearEl(resultsArea);
      if (result) {
        renderSuccessCard(resultsArea, result);
      } else {
        appendInlineError(resultsArea, '이슈가 생성되었지만 응답 데이터가 없습니다.');
      }
    }

    renderPreviewCard(resultsArea, data, handleConfirm, resetToForm);
  });
}

// ---------------------------------------------------------------------------
// Export as global
// ---------------------------------------------------------------------------
window.renderJiraPane = renderJiraPane;
