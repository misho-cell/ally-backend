import { readFileSync } from 'fs';
import { join } from 'path';

import { renderPendingMessage } from '../pendingMessages';

/**
 * The real TBC case (the tester's 60161 [d], 15 Oct, 13:32). A scheduled check
 * in an English goal thread delivered a waiting introduction request into its
 * own Georgian request thread, and the card read „Lika Ose is asking you to
 * introduce them…" with English buttons.
 */
const REQUEST = {
  kind: 'intro_request',
  task_id: null,
  payload: { request_id: 6338, who: 'ლიკა', target_name: 'გიორგი', direct: false },
};

describe('a card delivered into another thread', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const deliver = chat.slice(chat.indexOf('async function deliverPendingMessages('));
  const helper = chat.slice(
    chat.indexOf('async function languageOfPendingTarget('),
    chat.indexOf('async function deliverPendingMessages('),
  );

  it('picks the thread it lands in before it is written', () => {
    const targetAt = deliver.indexOf('const target = await threadForPendingItem(');
    const renderAt = deliver.indexOf('const rendered = renderPendingMessage(');
    expect(targetAt).toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(targetAt);
    expect(deliver.slice(renderAt, renderAt + 160)).toContain(
      'await languageOfPendingTarget(target, threadId, language)',
    );
  });

  it('speaks the run’s language at home and the target thread’s elsewhere', () => {
    expect(helper).toContain('if (target === runThreadId) return runLanguage;');
    expect(helper).toContain('return threadLanguage(target).catch(');
  });

  it('keeps the run’s language, and says so, when the thread’s cannot be read', () => {
    expect(helper).toContain('[pending] could not read the target thread’s language:');
    expect(helper).toContain('return runLanguage;\n  });');
  });

  it('writes the same request in Georgian once the language is the thread’s', () => {
    const ka = renderPendingMessage(REQUEST, 'ka');
    const en = renderPendingMessage(REQUEST, 'en');
    expect(ka?.text).not.toContain('is asking you');
    expect(en?.text).toContain('is asking you');
  });
});
