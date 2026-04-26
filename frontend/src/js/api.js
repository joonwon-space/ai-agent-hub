const BASE_URL = '/api';

async function fetchAgents() {
  const res = await authFetch(`${BASE_URL}/agents`);
  if (!res) return [];
  if (!res.ok) throw new Error('에이전트 목록 로드 실패');
  return res.json();
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await authFetch(`${BASE_URL}/upload`, { method: 'POST', body: formData });
  if (!res) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '업로드 실패');
  return data;
}

async function previewAgent(agentName, input) {
  const res = await authFetch(`${BASE_URL}/agents/${agentName}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '미리보기 실패');
  return data;
}

async function runAgent(agentName, input) {
  const res = await authFetch(`${BASE_URL}/agents/${agentName}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '실행 실패');
  return data;
}
