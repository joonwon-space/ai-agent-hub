/**
 * aiAssist.js — AI 자연어 입력 → 필드 자동 채우기 공유 패널
 *
 * createRecipeAiPanel(onApply) — 레시피 AI 패널 생성
 * createDiaryAiPanel(onApply)  — 일기 AI 패널 생성
 *
 * onApply(fields) — 결과를 폼에 채우는 콜백 (호출자가 구현)
 *
 * Zero-innerHTML guarantee: 모든 DOM은 createElement/textContent.
 */

'use strict';

function createAiPanel({ endpoint, placeholder, renderPreview, onApply }) {
  let collapsed = true;
  let lastResult = null;

  // -------------------------------------------------------------------------
  // Root element
  // -------------------------------------------------------------------------
  const el = document.createElement('div');
  el.className = 'ms-ai-assist';

  // -------------------------------------------------------------------------
  // Header (toggle)
  // -------------------------------------------------------------------------
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'ms-ai-assist__header';
  header.setAttribute('aria-expanded', 'false');

  const headerIcon = document.createElement('span');
  headerIcon.textContent = '✨';
  headerIcon.setAttribute('aria-hidden', 'true');
  header.appendChild(headerIcon);

  const headerText = document.createElement('span');
  headerText.textContent = ' AI로 채우기 (beta)';
  header.appendChild(headerText);

  const chevron = document.createElement('span');
  chevron.className = 'ms-ai-assist__chevron';
  chevron.textContent = '▾'; // ▾
  chevron.setAttribute('aria-hidden', 'true');
  header.appendChild(chevron);

  el.appendChild(header);

  // -------------------------------------------------------------------------
  // Body (collapsible)
  // -------------------------------------------------------------------------
  const body = document.createElement('div');
  body.className = 'ms-ai-assist__body ms-ai-assist__body--hidden';

  const textarea = document.createElement('textarea');
  textarea.className = 'ms-ai-assist__textarea';
  textarea.placeholder = placeholder;
  textarea.rows = 4;
  textarea.maxLength = 5000;
  body.appendChild(textarea);

  const analyzeBtn = document.createElement('button');
  analyzeBtn.type = 'button';
  analyzeBtn.className = 'ms-ai-assist__btn btn btn-secondary btn-sm';
  analyzeBtn.textContent = 'AI 분석';
  body.appendChild(analyzeBtn);

  const spinner = document.createElement('div');
  spinner.className = 'ms-ai-assist__spinner ms-ai-assist__spinner--hidden';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', '분석 중');
  const spinnerDot = document.createElement('span');
  spinnerDot.className = 'ms-ai-assist__spinner-dot';
  spinner.appendChild(spinnerDot);
  body.appendChild(spinner);

  const errorMsg = document.createElement('p');
  errorMsg.className = 'ms-ai-assist__error ms-ai-assist__error--hidden';
  errorMsg.setAttribute('role', 'alert');
  body.appendChild(errorMsg);

  const preview = document.createElement('div');
  preview.className = 'ms-ai-assist__preview ms-ai-assist__preview--hidden';

  const previewTitle = document.createElement('p');
  previewTitle.className = 'ms-ai-assist__preview-title';
  previewTitle.textContent = 'AI 추출 결과 미리보기';
  preview.appendChild(previewTitle);

  const previewContent = document.createElement('div');
  previewContent.className = 'ms-ai-assist__preview-content';
  preview.appendChild(previewContent);

  const actions = document.createElement('div');
  actions.className = 'ms-ai-assist__actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'ms-ai-assist__apply-btn btn btn-primary btn-sm';
  applyBtn.textContent = '이 내용으로 채우기';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ms-ai-assist__close-btn btn btn-secondary btn-sm';
  closeBtn.textContent = '닫기';

  actions.appendChild(applyBtn);
  actions.appendChild(closeBtn);
  preview.appendChild(actions);

  body.appendChild(preview);
  el.appendChild(body);

  // -------------------------------------------------------------------------
  // Toggle logic
  // -------------------------------------------------------------------------
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    body.classList.toggle('ms-ai-assist__body--hidden', collapsed);
    header.setAttribute('aria-expanded', String(!collapsed));
    chevron.textContent = collapsed ? '▾' : '▴';
  });

  // -------------------------------------------------------------------------
  // Analyze
  // -------------------------------------------------------------------------
  analyzeBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;

    setLoading(true);
    hideError();
    hidePreview();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });

      const json = await res.json();

      if (!res.ok) {
        showError(json.error || '분석에 실패했습니다.');
        return;
      }

      lastResult = json.data;
      showPreview(json.data);
    } catch (_) {
      showError('AI 서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  });

  // -------------------------------------------------------------------------
  // Apply / Close
  // -------------------------------------------------------------------------
  applyBtn.addEventListener('click', () => {
    if (lastResult) {
      onApply(lastResult);
      hidePreview();
      collapsed = true;
      body.classList.add('ms-ai-assist__body--hidden');
      header.setAttribute('aria-expanded', 'false');
      chevron.textContent = '▾';
    }
  });

  closeBtn.addEventListener('click', () => {
    hidePreview();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function setLoading(on) {
    analyzeBtn.disabled = on;
    spinner.classList.toggle('ms-ai-assist__spinner--hidden', !on);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('ms-ai-assist__error--hidden');
  }

  function hideError() {
    errorMsg.textContent = '';
    errorMsg.classList.add('ms-ai-assist__error--hidden');
  }

  function showPreview(fields) {
    previewContent.textContent = '';
    renderPreview(fields, previewContent);
    preview.classList.remove('ms-ai-assist__preview--hidden');
  }

  function hidePreview() {
    preview.classList.add('ms-ai-assist__preview--hidden');
  }

  function destroy() {
    el.remove();
  }

  return { el, destroy };
}

// ---------------------------------------------------------------------------
// Preview renderers
// ---------------------------------------------------------------------------

function renderRecipePreview(fields, container) {
  const rows = [
    ['이름', fields.name],
    ['카테고리', fields.category],
    ['난이도', fields.difficulty === 'easy' ? '쉬움' : fields.difficulty === 'medium' ? '보통' : '어려움'],
    ['조리시간', fields.cookTimeMin != null ? `${fields.cookTimeMin}분` : null],
    ['인분', fields.servings != null ? `${fields.servings}인분` : null],
    ['설명', fields.description],
  ];

  for (const [label, value] of rows) {
    if (!value) continue;
    const row = document.createElement('div');
    row.className = 'ms-ai-assist__preview-row';

    const lbl = document.createElement('span');
    lbl.className = 'ms-ai-assist__preview-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'ms-ai-assist__preview-value';
    val.textContent = String(value);

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }

  if (Array.isArray(fields.ingredients) && fields.ingredients.length > 0) {
    const row = document.createElement('div');
    row.className = 'ms-ai-assist__preview-row';

    const lbl = document.createElement('span');
    lbl.className = 'ms-ai-assist__preview-label';
    lbl.textContent = '재료';

    const val = document.createElement('span');
    val.className = 'ms-ai-assist__preview-value';
    val.textContent = fields.ingredients.map((i) => `${i.name} ${i.amount || ''}`.trim()).join(', ');

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }

  if (Array.isArray(fields.steps) && fields.steps.length > 0) {
    const row = document.createElement('div');
    row.className = 'ms-ai-assist__preview-row';

    const lbl = document.createElement('span');
    lbl.className = 'ms-ai-assist__preview-label';
    lbl.textContent = '조리순서';

    const val = document.createElement('span');
    val.className = 'ms-ai-assist__preview-value';
    val.textContent = `${fields.steps.length}단계`;

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }
}

function renderDiaryPreview(fields, container) {
  const moodMap = {
    happy: '행복', sad: '슬픔', anxious: '불안', angry: '화남', neutral: '평온',
  };

  const rows = [
    ['제목', fields.title],
    ['기분', moodMap[fields.mood] || fields.mood],
    ['본문', fields.body ? fields.body.slice(0, 80) + (fields.body.length > 80 ? '…' : '') : null],
  ];

  for (const [label, value] of rows) {
    if (!value) continue;
    const row = document.createElement('div');
    row.className = 'ms-ai-assist__preview-row';

    const lbl = document.createElement('span');
    lbl.className = 'ms-ai-assist__preview-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.className = 'ms-ai-assist__preview-value';
    val.textContent = String(value);

    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function createRecipeAiPanel(onApply) {
  return createAiPanel({
    endpoint: '/api/ai/assist/recipe',
    placeholder: '재료, 조리법, 인분 등을 자유롭게 적어주세요…',
    renderPreview: renderRecipePreview,
    onApply,
  });
}

function createDiaryAiPanel(onApply) {
  return createAiPanel({
    endpoint: '/api/ai/assist/diary',
    placeholder: '오늘 있었던 일, 느낀 점 등을 자유롭게 적어주세요…',
    renderPreview: renderDiaryPreview,
    onApply,
  });
}
