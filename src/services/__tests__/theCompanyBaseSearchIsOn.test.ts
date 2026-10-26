import { readFileSync } from 'fs';
import { join } from 'path';

/** #7525 part 1 / D847: the company base is loaded live (§67), so its search is on. */
describe('the company base search', () => {
  it('is ON and in the tool list', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('export const COMPANY_SEARCH_TOOL_ON = true;');
    expect(chat).toContain('...(COMPANY_SEARCH_TOOL_ON ? [FIND_COMPANIES_FOR_NEED_TOOL] : [])');
  });
});
