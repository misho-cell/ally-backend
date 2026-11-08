import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * #8878 (founder, 4 Nov 22:59): after the double yes nothing visible happened
 * for the two people. Now each gets a chat with the other: their assistants
 * open it in each person's name — a short greeting both ways, the asker's need
 * in one line — and from then on what one writes there reaches the other.
 *
 * These are the server's own lines until the tester writes the wording.
 */

type Line1 = (a: string) => string;
type Line2 = (a: string, b: string) => string;

const TITLE: Readonly<Record<RunLanguage, Line1>> = {
  ka: (other) => `${other} — გაცნობა`,
  en: (other) => `${other} — introduction`,
  ru: (other) => `${other} — знакомство`,
  es: (other) => `${other} — presentación`,
};

export function meetingTitle(language: RunLanguage, other: string): string {
  return (TITLE[language] ?? TITLE.ka)(other);
}

const WHAT_THIS_CHAT_IS: Readonly<Record<RunLanguage, Line2>> = {
  ka: (other, between) =>
    `ეს ჩატი შენსა და **${other}**-ს შორისაა — ${geoName(between, 'erg')} გაგაცნოთ. ` +
    `რასაც აქ დაწერ, ${geoName(other, 'dat')} მიუვა.`,
  en: (other, between) =>
    `This chat is between you and **${other}** — ${between} introduced you. ` +
    `What you write here reaches ${other}.`,
  ru: (other, between) =>
    `Этот чат — между тобой и **${other}**, вас познакомил ${between}. ` +
    `Что ты здесь напишешь, дойдёт до ${other}.`,
  es: (other, between) =>
    `Este chat es entre tú y **${other}** — os presentó ${between}. ` +
    `Lo que escribas aquí le llega a ${other}.`,
};

export function meetingOpening(language: RunLanguage, other: string, between: string): string {
  return (WHAT_THIS_CHAT_IS[language] ?? WHAT_THIS_CHAT_IS.ka)(other, between);
}

/**
 * Tester's report 8 Nov, C4: the shared chat opened with „Zura: Hello! Thanks
 * to Irakli… write to me" — words Zura never typed — and „Tornike: Hello…" on
 * Zura's side. Nobody's words are written in their name: each opening line is
 * the assistant's own, saying what happened.
 */
const ASKER_GREETS: Readonly<
  Record<RunLanguage, (asker: string, between: string, need: string | null) => string>
> = {
  ka: (asker, between, need) =>
    `${asker} შენთან ${geoName(between, 'gen')} გავლით დაგიკავშირდა.` +
    (need ? ` რაზეა საქმე: ${need}` : ''),
  en: (asker, between, need) =>
    `${asker} asked to be introduced to you through ${between}.` +
    (need ? ` What it is about: ${need}` : ''),
  ru: (asker, between, need) =>
    `${asker} попросил познакомить вас через ${between}.` + (need ? ` О чём речь: ${need}` : ''),
  es: (asker, between, need) =>
    `${asker} pidió que os presentaran a través de ${between}.` +
    (need ? ` De qué se trata: ${need}` : ''),
};

export function askerGreeting(
  language: RunLanguage,
  asker: string,
  between: string,
  need: string | null,
): string {
  return (ASKER_GREETS[language] ?? ASKER_GREETS.ka)(asker, between, need);
}

/** On the asker's side: that the target said yes — in the assistant's words, not theirs. */
const TARGET_GREETS: Readonly<Record<RunLanguage, Line2>> = {
  ka: (target) => `${target} გაცნობას დათანხმდა.`,
  en: (target) => `${target} agreed to the introduction.`,
  ru: (target) => `${target} согласился на знакомство.`,
  es: (target) => `${target} aceptó la presentación.`,
};

export function targetGreeting(language: RunLanguage, target: string, between: string): string {
  return (TARGET_GREETS[language] ?? TARGET_GREETS.ka)(target, between);
}

const INTRODUCER_TOLD: Readonly<Record<RunLanguage, Line2>> = {
  ka: (asker, target) => `${asker} და ${target} უკვე ერთ ჩატში არიან — გაცნობა შედგა. მადლობა!`,
  en: (asker, target) =>
    `${asker} and ${target} are now in one chat — the introduction is done. Thank you!`,
  ru: (asker, target) =>
    `${asker} и ${target} теперь в одном чате — знакомство состоялось. Спасибо!`,
  es: (asker, target) =>
    `${asker} y ${target} ya están en un mismo chat — la presentación está hecha. ¡Gracias!`,
};

export function introducerToldLine(language: RunLanguage, asker: string, target: string): string {
  return (INTRODUCER_TOLD[language] ?? INTRODUCER_TOLD.ka)(asker, target);
}

/** One line carried across: who wrote it, then their words. */
export function relayedLine(writer: string, text: string): string {
  return `**${writer}:** ${text.trim()}`;
}
