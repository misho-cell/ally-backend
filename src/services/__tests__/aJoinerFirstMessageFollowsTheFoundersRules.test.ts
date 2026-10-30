import { readFileSync } from 'fs';
import { join } from 'path';
import { FactAboutMe, FactOrigin } from '../factsAboutMe.service';
import { joinerRulesEventBody, mostImportantMissingStep, researchedWorkFact } from '../joinerBrief';
import { SetupStep } from '../setupState.service';

/**
 * #7729 / #7757, the founder's rules for a joiner's first message (box 78825,
 * 30 Oct): a true researched line or none, what Netai is for them, one offer
 * answered in one word, and only the one missing step that matters most.
 */
const fact = (field: string, value: string, extra: Partial<FactAboutMe> = {}): FactAboutMe => ({
  id: 1,
  field,
  value,
  origin: FactOrigin.Research,
  source_url: 'https://example.ge/team',
  date: '2026-10-01',
  status: 'confirmed',
  ...extra,
});

describe('the researched line about their work', () => {
  it('is a confirmed fact with a page behind it, never a guess', () => {
    expect(researchedWorkFact([fact('occupation', 'commercial director')])).toBe(
      'commercial director',
    );
    expect(researchedWorkFact([fact('occupation', 'x', { status: 'possible' })])).toBeNull();
    expect(researchedWorkFact([fact('occupation', 'x', { source_url: null })])).toBeNull();
    expect(researchedWorkFact([fact('city', 'Batumi')])).toBeNull();
  });

  it('prefers what they do over where', () => {
    expect(
      researchedWorkFact([fact('employer', 'Alpha Logistics'), fact('occupation', 'director')]),
    ).toBe('director');
  });

  it('is handed to the model, or the model is told to skip the line', () => {
    expect(joinerRulesEventBody({ workFact: 'director', missingStep: null })).toContain(
      '„director"',
    );
    expect(joinerRulesEventBody({ workFact: null, missingStep: null })).toContain(
      'ეს ნაწილი გამოტოვე',
    );
  });
});

describe('the one missing step', () => {
  it('is contacts first, then notifications, then the home-screen app', () => {
    const all = [SetupStep.Install, SetupStep.Notifications, SetupStep.Contacts];
    expect(mostImportantMissingStep(all)).toBe(SetupStep.Contacts);
    expect(mostImportantMissingStep([SetupStep.Install, SetupStep.Notifications])).toBe(
      SetupStep.Notifications,
    );
    expect(mostImportantMissingStep([SetupStep.Connector])).toBeNull();
  });

  it('comes with its link', () => {
    const contacts = joinerRulesEventBody({ workFact: null, missingStep: SetupStep.Contacts });
    expect(contacts).toContain('get_contacts_upload_link');
    const push = joinerRulesEventBody({ workFact: null, missingStep: SetupStep.Notifications });
    expect(push).toContain('https://www.netai.guru/setup');
    expect(push).not.toContain('get_contacts_upload_link');
  });
});

describe('what the message never does', () => {
  const body = joinerRulesEventBody({ workFact: null, missingStep: SetupStep.Install });

  it('never leads with a member who needs them, names nobody, says no welcome back', () => {
    expect(body).toContain('არ დაიწყო „აქ ვიღაცას ზუსტად შენ სჭირდები"-თი');
    expect(body).toContain('არ ახსენო სხვა წევრი');
    expect(body).toContain('„კეთილი იყოს შენი დაბრუნება"');
    expect(body).toContain('„შენ"-ით');
    expect(body).not.toContain('get_invite_link');
  });

  it('reaches real joiners only after Misho’s own yes (D44)', () => {
    const service = readFileSync(join(__dirname, '..', 'joinerFirstMessage.service.ts'), 'utf8');
    expect(service).toContain('const REAL_JOINER_TEXT = JoinerText.MatchedNeed;');
    expect(service).toContain('const SEAT_JOINER_TEXT = JoinerText.FoundersRules;');
  });

  it('does not send the contacts line a second time', () => {
    const line = readFileSync(join(__dirname, '..', 'contactsMissingLine.service.ts'), 'utf8');
    expect(line).toContain("AND j.props->>'missing_step' = $6");
  });
});
