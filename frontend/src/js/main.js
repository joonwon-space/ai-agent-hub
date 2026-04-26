let agents = [];
let activeAgent = null;
let previewData = null;
let uploadedFileData = null;

async function init() {
  const me = await getMe();
  if (!me) {
    window.location.href = '/login';
    return;
  }
  const emailEl = document.getElementById('topbar-email');
  if (emailEl) emailEl.textContent = me.email;

  agents = await fetchAgents();
  renderSidebar();
}

function renderSidebar() {
  const el = document.getElementById('agent-list-items');
  if (!agents.length) {
    el.innerHTML = '<div style="padding:10px 12px;color:var(--text-muted);font-size:12px;">등록된 에이전트 없음</div>';
    return;
  }
  el.innerHTML = agents.map(a => `
    <div class="agent-item" data-name="${a.name}" onclick="selectAgent('${a.name}')">
      <div class="agent-item-name">${a.name}</div>
      <div class="agent-item-desc">${a.description}</div>
    </div>
  `).join('');
}

function selectAgent(name) {
  activeAgent = agents.find(a => a.name === name);
  previewData = null;
  uploadedFileData = null;

  document.querySelectorAll('.agent-item').forEach(el => {
    el.classList.toggle('active', el.dataset.name === name);
  });

  document.getElementById('placeholder').style.display = 'none';
  const panel = document.getElementById('agent-panel');
  panel.style.display = 'block';
  renderAgentPanel(panel);
}

function renderFileField(field) {
  return `
    <div class="form-group">
      <label>${field.label}</label>
      <input type="file" id="field-${field.key}-input" accept="${field.accept || '*'}"
        style="display:none;" onchange="handleFileSelect(event, '${field.key}')" />
      <div class="file-upload-area" id="field-${field.key}-area"
        onclick="document.getElementById('field-${field.key}-input').click()">
        <div class="file-upload-icon" id="field-${field.key}-icon">📎</div>
        <div class="file-upload-text">
          <div class="primary" id="field-${field.key}-name">클릭하여 파일 첨부</div>
          <div class="secondary">이미지, PDF, TXT, MD · 최대 10MB</div>
        </div>
      </div>
    </div>
  `;
}

function renderAgentPanel(panel) {
  const a = activeAgent;
  const isJira = a.name === 'jira';

  const formFields = a.inputSchema.map(field => {
    if (field.type === 'file') return renderFileField(field);
    if (field.type === 'textarea') {
      return `<div class="form-group"><label>${field.label}</label>
        <textarea id="field-${field.key}" placeholder="${field.placeholder || ''}"></textarea></div>`;
    }
    return `<div class="form-group"><label>${field.label}</label>
      <input type="${field.type || 'text'}" id="field-${field.key}" placeholder="${field.placeholder || ''}" /></div>`;
  }).join('');

  const actionButtons = isJira
    ? renderJiraActions()
    : `<div class="btn-row">
         <button class="btn btn-primary" id="btn-run" onclick="handleRun()">
           <span id="run-spinner" style="display:none;" class="spinner"></span>
           실행
         </button>
       </div>`;

  panel.innerHTML = `
    <div class="panel-title">${capitalize(a.name)} 에이전트</div>
    <div class="panel-desc">${a.description}</div>
    ${formFields}
    ${actionButtons}
    <div id="preview-section" style="display:none;"></div>
    <div id="result-section" style="display:none;"></div>
  `;
}

async function handleFileSelect(event, fieldKey) {
  const file = event.target.files[0];
  if (!file) return;

  const area = document.getElementById(`field-${fieldKey}-area`);
  const nameEl = document.getElementById(`field-${fieldKey}-name`);

  area.classList.add('uploading');
  nameEl.textContent = '업로드 중...';

  try {
    const data = await uploadFile(file);
    uploadedFileData = data;
    renderFilePreview(fieldKey, data);
  } catch (e) {
    uploadedFileData = null;
    nameEl.textContent = `오류: ${e.message}`;
    area.classList.remove('uploading', 'has-file');
  }
}

function renderFilePreview(fieldKey, data) {
  const area = document.getElementById(`field-${fieldKey}-area`);
  const icon = document.getElementById(`field-${fieldKey}-icon`);
  const nameEl = document.getElementById(`field-${fieldKey}-name`);

  area.classList.remove('uploading');
  area.classList.add('has-file');
  area.onclick = null;

  if (data.type === 'image') {
    icon.innerHTML = `<img class="file-thumb" src="data:${data.mimeType};base64,${data.content}" alt="preview" />`;
  } else if (data.type === 'pdf') {
    icon.textContent = '📄';
  } else {
    icon.textContent = '📝';
  }

  nameEl.textContent = data.filename;
  nameEl.insertAdjacentHTML('afterend',
    `<div class="secondary">${data.type.toUpperCase()} · 첨부 완료</div>`);

  area.insertAdjacentHTML('beforeend',
    `<button class="file-clear-btn" onclick="clearFile(event, '${fieldKey}')" title="파일 제거">✕</button>`);
}

function clearFile(event, fieldKey) {
  event.stopPropagation();
  uploadedFileData = null;

  const area = document.getElementById(`field-${fieldKey}-area`);
  const icon = document.getElementById(`field-${fieldKey}-icon`);
  const nameEl = document.getElementById(`field-${fieldKey}-name`);
  const input = document.getElementById(`field-${fieldKey}-input`);

  area.classList.remove('has-file');
  area.onclick = () => input.click();
  icon.textContent = '📎';
  nameEl.textContent = '클릭하여 파일 첨부';
  const secondary = nameEl.nextElementSibling;
  if (secondary && secondary.classList.contains('secondary')) {
    secondary.textContent = '이미지, PDF, TXT, MD · 최대 10MB';
  }
  const clearBtn = area.querySelector('.file-clear-btn');
  if (clearBtn) clearBtn.remove();
  input.value = '';
}

function getFormInput() {
  const input = {};
  activeAgent.inputSchema.forEach(field => {
    if (field.type === 'file') return;
    const el = document.getElementById(`field-${field.key}`);
    if (el) input[field.key] = el.value.trim();
  });
  if (uploadedFileData) input.fileData = uploadedFileData;
  return input;
}

async function handleRun() {
  const input = getFormInput();
  const btn = document.getElementById('btn-run');
  const spinner = document.getElementById('run-spinner');

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  document.getElementById('result-section').style.display = 'none';

  try {
    const data = await runAgent(activeAgent.name, input);
    renderSuccess(data);
  } catch (e) {
    renderError(e.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

function renderSuccess(data) {
  const sec = document.getElementById('result-section');
  sec.style.display = 'block';

  let content = '';
  if (data.issueUrl) {
    content = `<a class="result-link" href="${data.issueUrl}" target="_blank">🔗 ${data.issueKey} — Jira에서 보기</a>`;
  } else {
    content = `<pre style="font-size:12px;color:var(--text-muted);white-space:pre-wrap;">${esc(JSON.stringify(data, null, 2))}</pre>`;
  }

  sec.innerHTML = `
    <hr class="divider" />
    <div class="result-box success">
      <div class="result-label success">✓ 성공</div>
      ${content}
    </div>
  `;
}

function renderError(msg) {
  const sec = document.getElementById('result-section');
  sec.style.display = 'block';
  sec.innerHTML = `
    <hr class="divider" />
    <div class="result-box error">
      <div class="result-label error">✗ 오류</div>
      <div class="result-error-msg">${esc(msg)}</div>
    </div>
  `;
}

function resetPreview() {
  previewData = null;
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'none';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
