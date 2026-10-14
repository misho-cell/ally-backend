import { RunLanguage } from './runLanguage';

/**
 * 0266 part 1 (the tester's 58043): the never-opened line („… აპი ჯერ არ
 * გაუხსნია … მაინც გავუგზავნო?") came with no buttons, 2 of 2. These are the
 * founder's words relayed through the box (58017), with the other languages
 * offered beside them.
 *
 * OWNER-FACING (D44): Misho said yes to these labels on 14 October 2026
 * („ჩემგან ყველა დავალებაზე კია და გააკეთე ყველა").
 */
export const DORMANT_CHOICES_ON = true;

const DORMANT_CHOICES: Readonly<Record<RunLanguage, readonly [string, string]>> = {
  ka: ['მაინც გაუგზავნე', 'სხვა გზა ვეძებოთ'],
  en: ['Send it anyway', "Let's find another way"],
  ru: ['Всё равно отправить', 'Поищем другой путь'],
  es: ['Envíalo de todos modos', 'Busquemos otro camino'],
};

/** The never-opened line's two buttons; none while the switch is off. */
export function dormantChoices(
  language: RunLanguage,
  on: boolean = DORMANT_CHOICES_ON,
): string[] | undefined {
  return on ? [...(DORMANT_CHOICES[language] ?? DORMANT_CHOICES.ka)] : undefined;
}

/** Every language's labels: approved text, so the button editor leaves them alone. */
export function allDormantLabels(): string[] {
  return Object.values(DORMANT_CHOICES).flat();
}
