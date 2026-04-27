const axios = require('axios');

async function extractWithOllama(overview, fileData) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';

  const jsonInstruction = `아래 JSON 형식으로만 응답해. 다른 설명 없이 JSON만:
{
  "summary": "한 줄 요약 제목 (한국어)",
  "description": "상세 설명 (한국어, 2-4문장)",
  "issuetype": "Bug 또는 Story 또는 Task 중 하나",
  "priority": "Highest 또는 High 또는 Medium 또는 Low 중 하나"
}`;

  let prompt;
  let requestBody;

  if (fileData && fileData.type === 'image') {
    prompt = `다음 작업 개요와 첨부된 이미지를 분석해서 Jira 이슈 필드를 JSON으로 추출해줘.

작업 개요:
${overview || '(이미지 참고)'}

${jsonInstruction}`;

    requestBody = {
      model,
      prompt,
      images: [fileData.content],
      stream: false,
    };
  } else {
    let contextBlock = '';
    if (fileData && (fileData.type === 'pdf' || fileData.type === 'text')) {
      contextBlock = `\n\n첨부 파일 내용 (${fileData.filename}):\n${fileData.content.slice(0, 4000)}`;
    }

    prompt = `다음 작업 개요를 분석해서 Jira 이슈 필드를 JSON으로 추출해줘.

작업 개요:
${overview || '(첨부 파일 참고)'}${contextBlock}

${jsonInstruction}`;

    requestBody = { model, prompt, stream: false };
  }

  const response = await axios.post(`${ollamaHost}/api/generate`, requestBody, {
    timeout: 30000,
  });

  const raw = response.data.response.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM 응답에서 JSON을 파싱할 수 없습니다.');

  const parsed = JSON.parse(jsonMatch[0]);

  const validTypes = ['Bug', 'Story', 'Task'];
  const validPriorities = ['Highest', 'High', 'Medium', 'Low'];
  if (!validTypes.includes(parsed.issuetype)) parsed.issuetype = 'Task';
  if (!validPriorities.includes(parsed.priority)) parsed.priority = 'Medium';

  return parsed;
}

module.exports = { extractWithOllama };
