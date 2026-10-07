/**
 * 2577 (the MASTER TEST RUN, 3 sightings; D648): an answer card printed a
 * reworded answer in the helper's own voice — „<name>: მყავს ნანახი",
 * „შემიძლია", „ვიცნობ" — without quotes, so the owner read „I know" as if
 * Netai were saying it. A reworded answer in the first person is shown in
 * quotes, as the helper's words, which is what it is.
 */
const KA_FIRST_PERSON_RE =
  /(?:^|[\s,.;:!?—-])(მყავს|მაქვს|შემიძლია|ვიცნობ|ვიცი|ვნახე|ვარ|მინდა|გავაცნობ|დაგეხმარები|მეცოდინება|ვიცოდი)(?=$|[\s,.;:!?—-])/u;
const EN_FIRST_PERSON_RE = /\b(?:I|I'm|I've|I'll|I'd|my|me)\b/u;
const RU_FIRST_PERSON_RE = /(?:^|[\s,.;:!?—-])(?:я|мне|меня|мой|моя|могу|знаю)(?=$|[\s,.;:!?—-])/iu;

export function speaksInFirstPerson(answer: string): boolean {
  return (
    KA_FIRST_PERSON_RE.test(answer) ||
    EN_FIRST_PERSON_RE.test(answer) ||
    RU_FIRST_PERSON_RE.test(answer)
  );
}
