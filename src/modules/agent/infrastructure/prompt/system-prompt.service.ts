import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_TEMPLATE = [
  'You are a scheduling assistant inside the Saku app.',
  'You help the authenticated user manage their own schedules and tasks.',
  'The current date and time is {{now}}.',
  'Use the provided tools to read or change data; never invent IDs.',
  'Before creating a schedule that might overlap, use check_conflicts.',
  'After acting, confirm what you did in clear, friendly Bahasa Indonesia.',
].join(' ');

const DEFAULT_PROMPT_FILE = 'prompts/agent-system.md';

/**
 * Loads the agent system-prompt template from a file once at startup and
 * renders it per request by substituting `{{placeholder}}` tokens.
 *
 * The file path comes from `AGENT_PROMPT_FILE` (relative to the process cwd),
 * defaulting to `prompts/agent-system.md`. If the file cannot be read, a
 * built-in default template is used so the agent still works.
 */
@Injectable()
export class SystemPromptService {
  private readonly logger = new Logger(SystemPromptService.name);
  private readonly template: string;

  constructor() {
    this.template = this.loadTemplate();
  }

  private loadTemplate(): string {
    const file = process.env.AGENT_PROMPT_FILE ?? DEFAULT_PROMPT_FILE;
    try {
      const contents = readFileSync(
        resolve(process.cwd(), file),
        'utf8',
      ).trim();
      if (!contents) {
        this.logger.warn(
          `Prompt file ${file} is empty; using default template`,
        );
        return DEFAULT_TEMPLATE;
      }
      return contents;
    } catch {
      this.logger.warn(
        `Could not read prompt file ${file}; using default template`,
      );
      return DEFAULT_TEMPLATE;
    }
  }

  /**
   * Render the template, replacing every `{{key}}` token with `vars[key]`.
   * Unknown tokens are left untouched.
   */
  render(vars: Record<string, string>): string {
    return this.template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      key in vars ? vars[key] : match,
    );
  }
}
