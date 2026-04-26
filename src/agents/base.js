class BaseAgent {
  constructor() {
    this.name = '';
    this.description = '';
    // [{key, label, type, placeholder}]
    this.inputSchema = [];
  }

  async run(input) {
    throw new Error(`Agent "${this.name}" must implement run()`);
  }

  async preview(input) {
    throw new Error(`Agent "${this.name}" does not support preview`);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

module.exports = BaseAgent;
