const BASE_URL = '/api';

async function fetchAgents() {
  const res = await fetch(`${BASE_URL}/agents`);
  if (!res.ok) throw new Error('에이전트 목록 로드 실패');
  return res.json();
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '업로드 실패');
  return data;
}

async function previewAgent(agentName, input) {
  const res = await fetch(`${BASE_URL}/agents/${agentName}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '미리보기 실패');
  return data;
}

async function runAgent(agentName, input) {
  const res = await fetch(`${BASE_URL}/agents/${agentName}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '실행 실패');
  return data;
}
