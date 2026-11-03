import { readFileSync } from 'fs';
import { join } from 'path';
import { blockStep, rowSteps, runIndexOf, TraceStepType } from '../runTrace.service';

/** Misho, 3 Nov: the whole road of one answer, for prompt debugging. */
const AT = '2026-11-03T09:00:00.000Z';
const row = (over: Partial<Parameters<typeof rowSteps>[0]>): Parameters<typeof rowSteps>[0] => ({
  role: 'assistant',
  kind: 'message',
  content: '',
  content_json: null,
  created_at: new Date(AT),
  ...over,
});

describe('a run’s steps, read from what the server stores', () => {
  it('reads reasoning, text, a tool call and its result from the stored blocks', () => {
    const steps = rowSteps(
      row({
        content_json: [
          {
            type: 'thinking',
            thinking: 'The owner named Nino; search by name first.',
            signature: 'x',
          },
          { type: 'text', text: 'ვეძებ.' },
          { type: 'tool_use', name: 'search_contact_by_name', input: { name_query: 'ნინო' } },
        ],
      }),
    );
    expect(steps.map((s) => s.type)).toEqual([
      TraceStepType.Reasoning,
      TraceStepType.Text,
      TraceStepType.ToolCall,
    ]);
    expect(steps[2]).toMatchObject({
      tool: 'search_contact_by_name',
      input: '{"name_query":"ნინო"}',
    });
  });

  it('skips the empty reasoning block a run without the summary stores', () => {
    expect(blockStep({ type: 'thinking', thinking: '', signature: 'x' }, AT)).toBeNull();
  });

  it('redacts phones in tool results and clips a very long one', () => {
    const step = blockStep(
      { type: 'tool_result', content: `{"phone":"+995555123456","note":"${'x'.repeat(7000)}"}` },
      AT,
    );
    expect(step?.text).not.toContain('555123456');
    expect(step?.text).toContain('more chars]');
  });

  it('marks the owner’s line, the server’s events and captions', () => {
    expect(rowSteps(row({ role: 'user', content: 'ვინ არის ნინო?' }))[0].type).toBe(
      TraceStepType.OwnerLine,
    );
    expect(rowSteps(row({ role: 'user', kind: 'event', content: '[მოვლენა] …' }))[0].type).toBe(
      TraceStepType.ServerEvent,
    );
    expect(rowSteps(row({ kind: 'caption', content: '🔍 ვეძებ' }))[0].type).toBe(
      TraceStepType.Caption,
    );
  });
});

describe('which run a row belongs to', () => {
  const starts = [Date.parse('2026-11-03T09:00:05Z'), Date.parse('2026-11-03T09:10:00Z')];

  it('gives the owner’s line to the run that starts right after it', () => {
    const line = row({ role: 'user', created_at: new Date('2026-11-03T09:00:02Z') });
    expect(runIndexOf(line, starts)).toBe(0);
    const later = row({ role: 'user', created_at: new Date('2026-11-03T09:09:58Z') });
    expect(runIndexOf(later, starts)).toBe(1);
  });

  it('gives the assistant’s rows to the latest run started before them', () => {
    expect(runIndexOf(row({ created_at: new Date('2026-11-03T09:05:00Z') }), starts)).toBe(0);
    expect(runIndexOf(row({ created_at: new Date('2026-11-03T09:11:00Z') }), starts)).toBe(1);
    expect(runIndexOf(row({ created_at: new Date('2026-11-03T08:00:00Z') }), starts)).toBe(-1);
  });
});

describe('the trace route', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const block = routes.slice(routes.indexOf("adminRouter.get('/threads/:id/trace'"));
  const body = block.slice(0, block.indexOf('\n});\n'));

  it('is behind the founder-only reader gate and validates its input', () => {
    expect(body).toContain('const readerGate = pilotReaderAllowed(req);');
    expect(body).toContain('if (!readerGate.allowed && !(await isTestSeatThread(threadId))) {');
    expect(body).toContain('res.status(403)');
    expect(body).toContain('`runs must be 1-${MAX_TRACE_RUNS}`');
  });
});
