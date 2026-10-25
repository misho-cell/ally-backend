import { FactConfidence } from '../plan';
import { checkedAgainst, identityWords, researchIdentity } from '../identity';

const fact = (key: string, value: string) => ({
  key,
  value,
  sourceUrl: 'https://a.ge/x',
  date: null,
  confidence: FactConfidence.Confirmed,
  conflictNote: null,
});

/** #7726 / #7727 (tester's engagement desk C-0020, 25 Oct): namesakes kept apart. */
describe('who the research is about', () => {
  it('searches the fullest name others saved, and not a single word', () => {
    expect(
      researchIdentity(['Giorgi Maisuradze UGT', 'გიორგი მაისურაძე'], 'Giorgi').searchName,
    ).toBe('Giorgi Maisuradze');
    expect(researchIdentity(['Gio', 'მამა'], 'Giorgi').searchName).toBeNull();
    expect(researchIdentity([], 'Nino Beridze').searchName).toBe('Nino Beridze');
  });

  it('takes the words of others’ labels that are not the name', () => {
    expect(
      identityWords(['Giorgi Maisuradze UGT', 'Giorgi Cloudforce'], 'Giorgi Maisuradze'),
    ).toEqual(['ugt', 'cloudforce']);
  });

  it('keeps a fact holding none of them only as possible', () => {
    const facts = [fact('employer', 'UGT Cloudforce'), fact('occupation', 'mobile game designer')];
    const checked = checkedAgainst(facts, ['ugt']);
    expect(checked[0].confidence).toBe(FactConfidence.Confirmed);
    expect(checked[1].confidence).toBe(FactConfidence.Possible);
    expect(checkedAgainst(facts, [])).toEqual(facts);
  });
});
