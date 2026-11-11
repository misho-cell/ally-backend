import { MAIN_MODEL, QUICK_MODEL, noThinkingFor, oneToolChoice } from '../aiModels';

/**
 * Misho, 11 Nov („ყველაფერი ავწიოთ"): every Claude route moves to the current
 * generation, and each short call keeps running without thinking in the form
 * its model accepts — Sonnet 5.5 refuses `disabled` and a forced tool.
 */
describe('the current models', () => {
  it('are Sonnet 5.5 for the main work and Haiku 5.5 for the short calls', () => {
    expect(MAIN_MODEL).toBe('claude-sonnet-5-5');
    expect(QUICK_MODEL).toBe('claude-haiku-5-5');
  });

  it('turn thinking off in the form each model accepts', () => {
    expect(noThinkingFor('claude-sonnet-5-5')).toEqual({ thinking: { type: 'between_tools' } });
    expect(noThinkingFor('claude-haiku-5-5')).toEqual({ thinking: { type: 'disabled' } });
    expect(noThinkingFor('claude-sonnet-5')).toEqual({ thinking: { type: 'disabled' } });
    expect(noThinkingFor('claude-haiku-4-5-20251001')).toEqual({});
  });

  it('ask for one tool by name only where the model allows forcing it', () => {
    expect(oneToolChoice('claude-sonnet-5-5', 'verdict')).toEqual({ type: 'auto' });
    expect(oneToolChoice('claude-haiku-5-5', 'verdict')).toEqual({ type: 'tool', name: 'verdict' });
    expect(oneToolChoice('claude-sonnet-5', 'verdict')).toEqual({ type: 'tool', name: 'verdict' });
  });
});
