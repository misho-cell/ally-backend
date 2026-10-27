jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { axelRosterRows, matchByName } from '../rosterPhones.service';

/** #6997 (tester 76702): George, AX-028, gets his number from the roster by name. */
describe('an Axel person in the store', () => {
  const roster = [
    { phone: '+995500000028', names: ['George Simongulashvili', 'გიორგი სიმონგულაშვილი'] },
    { phone: '+995500000001', names: ['Nino Beridze'] },
    { phone: '+995500000002', names: ['Nino Beridze'] },
  ];

  it('reads only the AX- rows of the roster map', () => {
    const csv =
      '﻿roster_key,member_hash,person_key,name\n1,h,AX-028,George Simongulashvili\n2,h,CL-1,X Y\n';
    expect(axelRosterRows(csv)).toEqual([{ personKey: 'AX-028', name: 'George Simongulashvili' }]);
  });

  it('gets the one member whose name is theirs, and nothing for two or none', () => {
    const rows = [
      { personKey: 'AX-028', name: 'George Simongulashvili' },
      { personKey: 'AX-001', name: 'Nino Beridze' },
      { personKey: 'AX-002', name: 'Nobody Here' },
    ];
    const out = matchByName(rows, roster);
    expect(out.phones).toEqual(new Map([['AX-028', '+995500000028']]));
    expect(out.ambiguous).toBe(1);
    expect(out.unmatched).toBe(1);
  });
});
