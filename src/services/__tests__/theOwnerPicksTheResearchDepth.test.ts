/**
 * Misho, 26 Nov (point 2): the owner decides how many companies, how many
 * people at each and how deep the search goes; tokens are spent by size.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderPendingMessage } from '../pendingMessages';
import {
  DEPTH_SIZES,
  depthCard,
  depthCardItem,
  depthStartedLine,
  depthNamedIn,
  depthPickOf,
  depthTapOf,
  RESEARCH_DEPTH_KIND,
  ResearchDepth,
} from '../researchDepth';

/** WhatsApp's limit for a reply button's title. */
const WHATSAPP_BUTTON_CHARS = 20;

describe('the three depths', () => {
  it('grow in companies, people at each, and reach', () => {
    const [quick, normal, deep] = [
      ResearchDepth.Quick,
      ResearchDepth.Normal,
      ResearchDepth.Deep,
    ].map((d) => DEPTH_SIZES[d]);
    expect([quick.companies, normal.companies, deep.companies]).toEqual([5, 10, 20]);
    expect([quick.peoplePerCompany, normal.peoplePerCompany, deep.peoplePerCompany]).toEqual([
      2, 3, 5,
    ]);
    expect([quick.farLevels, normal.farLevels, deep.farLevels]).toEqual([false, false, true]);
  });

  it('are offered on a card with three buttons that fit WhatsApp, in Georgian', () => {
    const card = depthCard('ka');
    expect(card.text).toContain('რამდენად ღრმად მოვძებნო სრულად?');
    expect(card.text).toContain('• სწრაფი — 5 კომპანია, თითოეულში 2 ადამიანი');
    expect(card.text).toContain(
      '• ღრმა — 20 კომპანია, თითოეულში 5 ადამიანი, ნაცნობები 3-5 ხელამდე',
    );
    expect(card.text).toContain('მით მეტ ტოკენს ხარჯავს');
    expect(card.choices).toEqual(['სწრაფი', 'ჩვეულებრივი', 'ღრმა']);
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(depthCard(language).choices.every((c) => c.length <= WHATSAPP_BUTTON_CHARS)).toBe(
        true,
      );
    }
  });

  it('renders as the reply’s own card', () => {
    const card = renderPendingMessage(depthCardItem(), 'en');
    expect(card?.choices).toEqual(['Quick', 'Standard', 'Deep']);
    expect(card?.ref.kind).toBe(RESEARCH_DEPTH_KIND);
  });

  it('reads a tap in any language, and nothing else', () => {
    expect(depthTapOf('ღრმა')).toBe(ResearchDepth.Deep);
    expect(depthTapOf(' Standard ')).toBe(ResearchDepth.Normal);
    expect(depthTapOf('быстро')).toBe(ResearchDepth.Quick);
    expect(depthTapOf('ღრმა ძიება')).toBe(ResearchDepth.Deep);
    expect(depthTapOf('ღრმა ძიება მინდა ახლა')).toBeNull();
    expect(depthTapOf('ღრმად მოძებნე ფოტოგრაფი')).toBeNull();
  });

  it('reads a pick written in a sentence, in any form of the word (Lika, 27 Nov)', () => {
    expect(depthPickOf('სწრაფი ძიებით მომეცი ჯერ შედეგები')).toBe(ResearchDepth.Quick);
    expect(depthPickOf('სწრაფად მოძებნე')).toBe(ResearchDepth.Quick);
    expect(depthPickOf('ღრმად მოძებნე, ყველა დონეზე')).toBe(ResearchDepth.Deep);
    expect(depthPickOf('ჩვეულებრივით გააგრძელე')).toBe(ResearchDepth.Normal);
    expect(depthPickOf('a quick one, please')).toBe(ResearchDepth.Quick);
    expect(depthPickOf('давай быстрый поиск')).toBe(ResearchDepth.Quick);
    expect(depthNamedIn('სწრაფი თუ ღრმა, არ ვიცი')).toBeNull();
    expect(depthNamedIn('ქალაქი თბილისი')).toBeNull();
  });

  it('says it started, by the depth picked', () => {
    expect(depthStartedLine('ka', ResearchDepth.Deep)).toBe(
      'კარგი, ვიწყებ: ღრმა. როცა დასრულდება, აქვე მოგწერ.',
    );
  });
});

describe('the research runs at the picked size', () => {
  const research = readFileSync(join(__dirname, '..', 'fullResearch.service.ts'), 'utf8');
  const web = readFileSync(join(__dirname, '..', 'researchWeb.ts'), 'utf8');
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('reaches three to five handshakes only when deep', () => {
    expect(research).toContain(
      'levels.filter((spec) => spec.level !== ResearchLevel.Further || sizeOf(request).farLevels)',
    );
  });

  it('names as many companies, people and pages as the depth says', () => {
    expect(web).toContain('sizeOf(request).companies');
    expect(web).toContain('sizeOf(request).peoplePerCompany');
    expect(web).toContain('sizeOf(request).headLookups');
    expect(web).toContain('sizeOf(request).pagesRead');
    expect(research).toContain('size: sizeOf(request),');
  });

  it('starts only on the owner’s pick, which the server answers', () => {
    expect(chat).toContain('const depth = tapped ?? depthNamedIn(userMessage);');
    expect(chat).toContain(
      'tapped !== null ? takeHeldResearch(threadId) : takeHeldResearchWith(threadId, userMessage);',
    );
    expect(chat).toContain('startFullResearch(research, threadId, depth);');
    expect(chat).toContain(
      'runFullResearch({ userId, threadId, taskId, words, ownerLine, withheld, askedAt, depth })',
    );
  });
});
