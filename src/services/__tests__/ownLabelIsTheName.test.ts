import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ASKED_AS_THE_ASKER_SAVED_THEM,
  ASKER_AS_THE_READER_SAVED_THEM,
  nameAsSavedBySql,
} from '../savedNameSql';
import { DISPLAY_NAME } from '../tools/searchByTag';

/**
 * #1918 (phone report point 47): the owner sees her own saved label for her
 * own contact in every reply and list; another owner's label never.
 */
describe('the name a viewer sees for a member', () => {
  const sql = nameAsSavedBySql('ta.from_user_id', 'ta.to_user_id');

  it('reads the viewer’s own label first, the registered name after', () => {
    expect(sql.indexOf('"UserAlias"')).toBeLessThan(sql.indexOf('"User" sv_u'));
    expect(sql).toContain('sv_ua."contactId" = ta.from_user_id');
    expect(sql).toContain('sv_up."userId" = ta.to_user_id');
  });

  // #2312: two reads of the viewer's labels — a clean one first, any one last.
  it('never reads a label without the viewer in it', () => {
    expect(sql.match(/"UserAlias"/g)).toHaveLength(2);
    expect(sql.match(/WHERE sv_ua\."contactId" = ta\.from_user_id/g)).toHaveLength(2);
  });

  it('passes over a dotted or over-long label for a clean one, then the registered name', () => {
    const clean = sql.indexOf("sv_ua.alias NOT LIKE '%.%'");
    expect(clean).toBeGreaterThan(-1);
    expect(clean).toBeLessThan(sql.indexOf('"User" sv_u'));
    expect(sql.lastIndexOf('"UserAlias"')).toBeGreaterThan(sql.indexOf('"User" sv_u'));
  });

  it('picks the same spelling every time', () => {
    expect(sql).toContain('ORDER BY LENGTH(TRIM(sv_ua.alias)) DESC, sv_ua.alias');
  });

  it('looks from the asker at the asked, and from the reader at the asker', () => {
    expect(ASKED_AS_THE_ASKER_SAVED_THEM).toContain('"contactId" = ta.from_user_id');
    expect(ASKER_AS_THE_READER_SAVED_THEM).toContain('"contactId" = ta.to_user_id');
  });
});

describe('the search tools', () => {
  it('name a contact by the owner’s own label before the registered name', () => {
    expect(DISPLAY_NAME.indexOf('ua.alias')).toBeLessThan(DISPLAY_NAME.indexOf('u.name'));
  });

  it('join labels on the searcher alone wherever the display name is read', () => {
    for (const file of ['searchByTag.ts', 'searchContactByName.ts']) {
      const src = readFileSync(join(__dirname, '..', 'tools', file), 'utf8');
      const joins = src.match(/LEFT JOIN "UserAlias" ua ON[^\n]*/g) ?? [];
      expect(joins.length).toBeGreaterThan(0);
      for (const j of joins) expect(j).toContain('ua."contactId" = $1');
    }
  });
});

describe('no ask line reads the registered name directly', () => {
  for (const file of ['taskAsks.service.ts', 'askExpiry.service.ts', 'debrief.service.ts']) {
    it(file, () => {
      const src = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(src).not.toMatch(/SELECT u\.name FROM "User" u WHERE u\.id = ta\.(to|from)_user_id/);
      expect(src).not.toMatch(/u\.name AS (from|to|reader|asker)_name/);
    });
  }
});
