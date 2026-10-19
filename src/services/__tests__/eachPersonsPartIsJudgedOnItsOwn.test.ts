import { askIsTheIntroduction } from '../introInstruction';

const MIXED = ['სთხოვე ნინოს, გამაცნოს რეზო. ასევე ჰკითხე გელას, ხომ არ იცნობს სხვა ინვესტორს.'];

/** Box 54175: an introduction and a plain question in one message. */
describe('each person’s part of the owner’s message is judged on its own', () => {
  it('lets the plain question to the second person go as a question', () => {
    expect(askIsTheIntroduction(MIXED, 'გელა გამოგონილი')).toBe(false);
  });

  it('keeps the go-between’s part an introduction', () => {
    expect(askIsTheIntroduction(MIXED, 'ნინო საცდელი')).toBe(true);
  });

  it('keeps the introduction when the recipient’s name is unknown or not in the owner’s words', () => {
    expect(askIsTheIntroduction(MIXED, '')).toBe(true);
    expect(askIsTheIntroduction(['გამაცანი თამთა.', 'ბახვა იცნობს.'], 'ბახვა ფიქტიური')).toBe(
      false,
    );
    expect(askIsTheIntroduction(['გამაცანი თამთა, ბახვა იცნობს.'], 'ბახვა ფიქტიური')).toBe(true);
    expect(askIsTheIntroduction(['გამაცანი თამთა.'], 'ლევანი')).toBe(true);
  });

  it('is never an introduction when the owner asked for none', () => {
    expect(askIsTheIntroduction(['ჰკითხე გელას, იცნობს თუ არა ინვესტორს.'], 'გელა')).toBe(false);
  });

  it('reads a Latin name too', () => {
    const mixed = ['Ask Nino to introduce me to Rezo. Also ask Gela if he knows another investor.'];
    expect(askIsTheIntroduction(['introduce me to Rezo through Nino. ' + mixed[0]], 'Gela')).toBe(
      false,
    );
  });
});

/** #6361 (Giorgi, goal 29308): a follow-up to a go-between is never refused as an introduction. */
describe('#6361: the owner’s newest words about a person decide', () => {
  const earlier = 'სთხოვე ლიკას, დამაკავშიროს თემურთან';

  it('lets a later question to the same go-between go as a question', () => {
    expect(askIsTheIntroduction([earlier, 'ჰკითხე ლიკას, ხომ არ აქვს რამე სიახლე'], 'ლიკა')).toBe(
      false,
    );
  });

  it('still reads the introduction when it is the newest word about her', () => {
    expect(askIsTheIntroduction(['ჰკითხე ლიკას, როგორ არის', earlier], 'ლიკა')).toBe(true);
  });
});
