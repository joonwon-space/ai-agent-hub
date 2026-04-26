const axios = require('axios');
const BaseAgent = require('./base');
const { extractWithOllama } = require('../services/ollama');
const prisma = require('../services/db');
const { decrypt } = require('../utils/crypto');

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

  async _getJiraConfig(userId) {
    const rows = await prisma.userSetting.findMany({
      where: { userId, key: { startsWith: 'jira_' } },
    });

    const config = {};
    for (const row of rows) {
      config[row.key] = row.encrypted ? decrypt(row.value) : row.value;
    }

    const required = ['jira_base_url', 'jira_email', 'jira_api_token', 'jira_project_key'];
    const missing = required.filter((k) => !config[k]);
    if (missing.length > 0) {
      throw new Error('Jira 설정이 없습니다. 설정 화면에서 먼저 입력해주세요.');
    }

    return config;
  }

  async preview(input, context) {
    const { overview, fileData } = input;
    if (!overview?.trim() && !fileData) throw new Error('작업 개요를 입력하거나 파일을 첨부해주세요.');

    const fields = await extractWithOllama(overview, fileData);
    return { fields };
  }

  async run(input, context) {
    const { overview, fileData, fields: previewedFields } = input;

    const config = await this._getJiraConfig(context.userId);
    const { jira_base_url: baseUrl, jira_email: email, jira_api_token: token, jira_project_key: projectKey } = config;

    const fields = previewedFields || (await extractWithOllama(overview, fileData));

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
