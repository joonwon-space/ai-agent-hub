function renderJiraActions() {
  return `<div class="btn-row">
    <button class="btn btn-primary" id="btn-preview" onclick="handlePreview()">
      <span id="preview-spinner" style="display:none;" class="spinner"></span>
      미리보기 생성
    </button>
  </div>`;
}

async function handlePreview() {
  const input = getFormInput();
  const btn = document.getElementById('btn-preview');
  const spinner = document.getElementById('preview-spinner');

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'none';

  try {
    const data = await previewAgent(activeAgent.name, input);
    previewData = data;
    renderPreview(data);
  } catch (e) {
    renderError(e.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

async function handleConfirm() {
  if (!previewData) return;

  const input = getFormInput();
  const btn = document.getElementById('btn-confirm');
  const spinner = document.getElementById('confirm-spinner');

  btn.disabled = true;
  spinner.style.display = 'inline-block';

  try {
    const data = await runAgent(activeAgent.name, { ...input, fields: previewData.fields });
    renderSuccess(data);
  } catch (e) {
    renderError(e.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

function renderPreview(data) {
  const fields = data.fields;
  const sec = document.getElementById('preview-section');
  sec.style.display = 'block';

  const typeClass = `badge-${fields.issuetype.toLowerCase()}`;
  const prioClass = `badge-${fields.priority.toLowerCase()}`;

  sec.innerHTML = `
    <hr class="divider" />
    <div class="preview-card">
      <h3>AI 추출 결과 — 확인 후 생성하세요</h3>
      <div class="preview-row">
        <div class="preview-key">Summary</div>
        <div class="preview-val">${esc(fields.summary)}</div>
      </div>
      <div class="preview-row">
        <div class="preview-key">Description</div>
        <div class="preview-val">${esc(fields.description)}</div>
      </div>
      <div class="preview-row">
        <div class="preview-key">Type</div>
        <div class="preview-val"><span class="badge ${typeClass}">${fields.issuetype}</span></div>
      </div>
      <div class="preview-row">
        <div class="preview-key">Priority</div>
        <div class="preview-val"><span class="badge ${prioClass}">${fields.priority}</span></div>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-success" id="btn-confirm" onclick="handleConfirm()">
        <span id="confirm-spinner" style="display:none;" class="spinner"></span>
        Jira 이슈 생성
      </button>
      <button class="btn btn-secondary" onclick="resetPreview()">다시 작성</button>
    </div>
  `;
}
