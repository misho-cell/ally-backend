import { geoName } from './georgianCase';
import { georgianScriptName } from './georgianScriptName';
import { phoneDigits } from './phone';
import { firstEmailIn, firstPhoneIn } from './privacyScrub';
import { RunLanguage } from './runLanguage';

/**
 * The tester's battery (6 Nov, C1, C3, C6, C7): the go-between agreed and typed
 * the person's number or e-mail into the answer, and the owner read „I could not
 * find the number — ask him yourself". An introduction handed over only a number
 * found in the go-between's phonebook; what they typed was masked or dropped.
 * D587 / #6360 already hands over a number a helper typed with their own hand on
 * an ask — the introduction now follows the same rule. A member target is still
 * asked first (#8945). For a target off Netai it wins over a phonebook number
 * (tester's report 8 Nov, C5: the go-between's new number was lost to the old one).
 */
export enum TypedContactKind {
  Phone = 'phone',
  Email = 'email',
}

export interface TypedContact {
  readonly kind: TypedContactKind;
  readonly value: string;
}

/** The contact the go-between typed in their own lines: a number first, else an e-mail. */
export function typedContactIn(ownLines: string | null): TypedContact | null {
  const text = ownLines ?? '';
  const phone = firstPhoneIn(text);
  if (phone !== null) return { kind: TypedContactKind.Phone, value: phone };
  const email = firstEmailIn(text);
  return email === null ? null : { kind: TypedContactKind.Email, value: email };
}

function contactLink(contact: TypedContact): string {
  if (contact.kind === TypedContactKind.Email) {
    return `[${contact.value}](mailto:${contact.value})`;
  }
  const digits = phoneDigits(contact.value);
  return `[+${digits}](tel:+${digits}) [WhatsApp](https://wa.me/${digits})`;
}

/** What the owner reads: whose contact it is, who wrote it, and the contact itself. */
export function typedContactLine(
  language: RunLanguage,
  mediatorName: string,
  targetName: string,
  contact: TypedContact,
): string {
  const link = contactLink(contact);
  switch (language) {
    case 'en':
      return `${mediatorName} agreed and wrote ${targetName}'s contact in the answer: ${link}`;
    case 'ru':
      return `${mediatorName} согласился и написал в ответе контакт ${targetName}: ${link}`;
    case 'es':
      return `${mediatorName} aceptó y escribió en su respuesta el contacto de ${targetName}: ${link}`;
    default: {
      const mediator = georgianScriptName(mediatorName);
      const target = georgianScriptName(targetName);
      return (
        `${geoName(mediator, 'erg')} თანხმობა გამოთქვა და პასუხში ${geoName(target, 'gen')} ` +
        `კონტაქტი დაწერა: ${link}`
      );
    }
  }
}

/** What the go-between reads: the yes and the contact they typed went to the owner. */
export function typedContactMediatorLine(
  language: RunLanguage,
  requesterName: string,
  targetName: string,
): string {
  switch (language) {
    case 'en':
      return `Thank you! I have told ${requesterName} you said yes, and passed on ${targetName}'s contact you wrote.`;
    case 'ru':
      return `Спасибо! Я сказал ${requesterName}, что ты согласился, и передал контакт ${targetName}, который ты написал.`;
    case 'es':
      return `¡Gracias! Le he dicho a ${requesterName} que aceptas y le he pasado el contacto de ${targetName} que escribiste.`;
    default:
      return (
        `მადლობა! ${geoName(requesterName, 'dat')} ვაცნობე შენი თანხმობა და გადავეცი ` +
        `${geoName(targetName, 'gen')} კონტაქტი, რომელიც დაწერე.`
      );
  }
}
