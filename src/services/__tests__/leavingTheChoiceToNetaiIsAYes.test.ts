import { delegatesTheChoiceOfPeople } from '../delegatedChoice';

/** DR2 (#8615, the tester's 81317; thread 76858, 2 Nov 14:09). */
const LINE =
  'შენით გადაწყვიტე ვის მიწერ და მთავარია მომიძებნო ხალხი რომელიც საერთაშორისო ურთიერთობების სტუდენტებთან დამაკავშირებს';

describe('leaving the choice of people to Netai is the owner’s yes', () => {
  it('reads the delegation in Georgian, English and Russian', () => {
    for (const said of [
      LINE,
      'შენ აირჩიე ვის ჰკითხავ',
      'როგორც ჩათვლი',
      'you decide who to ask',
      'up to you',
      'реши сам, кому писать',
    ])
      expect(delegatesTheChoiceOfPeople(said)).toBe(true);
  });

  it('does not read an ordinary question or a refusal as one', () => {
    for (const said of ['შენ რას ფიქრობ?', 'ვის მივწერო?', 'არავის მისწერო', 'what do you decide?'])
      expect(delegatesTheChoiceOfPeople(said)).toBe(false);
  });
});
