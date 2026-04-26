const axios = require('axios');
const BaseAgent = require('./base');

class JiraAgent extends BaseAgent {
  constructor() {
    super();
    this.name = 'jira';
    this.description = 'Jira 이슈를 AI로 자동 생성합니다. 작업 개요를 입력하면 summary, description, 타입, 우선순위를 추출하여 이슈를 만듭니다.';
    this.inputSchema = [
      {
        key: 'overview',
        label: '작업 개요',
        type: 'textarea',
        placeholder: '작업 내용을 자유롭게 설명해주세요. AI가 Jira 이슈 필드를 자동으로 추출합니다.',
      },
      {
        key: 'file',
        label: '파일 첨부 (선택)',
        type: 'file',
        accept: 'image/*,.pdf,.txt,.md',
        required: false,
      },
    ];
  }

  async _extractWithOllama(overview, fileData) {
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

    const response = await axios.post(`${ollamaHost}/api/generate`, requestBody);

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

  async preview(input) {
    const { overview, fileData } = input;
    if (!overview?.trim() && !fileData) throw new Error('작업 개요를 입력하거나 파일을 첨부해주세요.');

    const fields = await this._extractWithOllama(overview, fileData);
    return { fields };
  }

  async run(input) {
    const { overview, fileData, fields: previewedFields } = input;

    const fields = previewedFields || (await this._extractWithOllama(overview, fileData));

    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    const projectKey = process.env.JIRA_PROJECT_KEY;

    if (!baseUrl || !email || !token || !projectKey) {
      throw new Error('Jira 환경변수(JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY)를 설정해주세요.');
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    const body = {
      fields: {
        project: { key: projectKey },
        summary: fields.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: fields.description }],
            },
          ],
        },
        issuetype: { name: fields.issuetype },
        priority: { name: fields.priority },
      },
    };

    const response = await axios.post(`${baseUrl}/rest/api/3/issue`, body, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    const issueKey = response.data.key;
    const issueUrl = `${baseUrl}/browse/${issueKey}`;

    return { issueKey, issueUrl, fields };
  }
}

module.exports = JiraAgent;
