import { readFileSync } from 'fs';
import { join } from 'path';
import { genericStepCaption, toolStepCaption } from '../runLanguage';

/**
 * 3368 (AP-022, seat 180150): the check_my_inbox run (conv 45109) and the
 * list_status run (conv 45094) stored no steps. Neither tool had a Georgian
 * caption, and Georgian had no generic one, so nothing was kept.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('every tool leaves a step', () => {
  it('Georgian has a generic step, like every other language', () => {
    expect(genericStepCaption('ka')).toBe('⚙️ ვმუშაობ...');
    expect(toolStepCaption('check_my_inbox', 'en')).toBe(genericStepCaption('en'));
  });

  it('the caption falls back to it after the tool’s own', () => {
    const at = chat.indexOf('const progressMsg =');
    expect(chat.slice(at, at + 500)).toContain('TOOL_PROGRESS_MESSAGES[block.name] ??');
    expect(chat.slice(at, at + 500)).toContain('genericStepCaption(runLang(runId));');
  });

  it('the inbox and the goal list have their own Georgian step', () => {
    expect(chat).toContain("check_my_inbox: '📥 ვამოწმებ, რა გელოდება...',");
    expect(chat).toContain("list_status: '📋 მიზნების მდგომარეობას ვამოწმებ...',");
  });
});
