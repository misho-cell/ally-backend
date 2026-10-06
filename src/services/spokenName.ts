import type { RunLanguage } from './runLanguage';

/**
 * Row 283 (tester 42406): a contact saved as „💙" was named „your contact
 * saved as 💙" in the assistant's own sentences, but as the bare emoji in the
 * fixed lines — „💙: asked, waiting for the answer". A label with no letter in
 * it is not a name, so every fixed line says what it is instead.
 */
const HAS_A_LETTER = /\p{L}/u;

const SAVED_AS: Readonly<Record<RunLanguage, (label: string) => string>> = {
  ka: (label) => `შენი კონტაქტი „${label}"`,
  en: (label) => `Your contact saved as ${label}`,
  ru: (label) => `Ваш контакт «${label}»`,
  es: (label) => `Tu contacto guardado como ${label}`,
};

export function nameToSay(name: string, language: RunLanguage): string {
  const trimmed = name.trim();
  if (trimmed === '' || HAS_A_LETTER.test(trimmed)) return name;
  return (SAVED_AS[language] ?? SAVED_AS.ka)(trimmed);
}
