import { readFileSync } from 'fs';
import { SystemPromptService } from './system-prompt.service';

jest.mock('fs', () => ({ readFileSync: jest.fn() }));

const mockedReadFileSync = readFileSync as jest.Mock;

describe('SystemPromptService', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('loads the template file and substitutes {{now}}', () => {
    process.env = { ...ORIGINAL_ENV, AGENT_PROMPT_FILE: 'prompts/test.md' };
    mockedReadFileSync.mockReturnValue('Hello, it is {{now}} right now.');

    const service = new SystemPromptService();
    const rendered = service.render({ now: '2026-05-30T00:00:00.000Z' });

    expect(rendered).toBe('Hello, it is 2026-05-30T00:00:00.000Z right now.');
  });

  it('leaves unknown placeholders untouched', () => {
    mockedReadFileSync.mockReturnValue('{{now}} / {{unknown}}');

    const service = new SystemPromptService();
    const rendered = service.render({ now: 'X' });

    expect(rendered).toBe('X / {{unknown}}');
  });

  it('falls back to the default template when the file cannot be read', () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const service = new SystemPromptService();
    const rendered = service.render({ now: '2026-05-30T00:00:00.000Z' });

    expect(rendered).toContain(
      'You are a scheduling assistant inside the Saku app.',
    );
    expect(rendered).toContain('2026-05-30T00:00:00.000Z');
    expect(rendered).not.toContain('{{now}}');
  });

  it('falls back to the default template when the file is empty', () => {
    mockedReadFileSync.mockReturnValue('   ');

    const service = new SystemPromptService();
    const rendered = service.render({ now: 'N' });

    expect(rendered).toContain(
      'You are a scheduling assistant inside the Saku app.',
    );
  });
});
