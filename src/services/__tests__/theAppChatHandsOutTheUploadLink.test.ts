import { readFileSync } from 'fs';
import { join } from 'path';
import { toolDescription } from '../chat.service';
import { CONTACTS_UPLOAD_LINK_DESCRIPTION } from '../contactsUploadLinkText';
import { TOOL_TEXTS } from '../mcp/texts';

/**
 * #6073 (FULL BATTERY 19 Oct, 3 of 3): asked in the app for the contacts
 * upload link, the assistant said none exists — the tool lived only in the
 * connector.
 */
describe('#6073: the app chat hands out the contacts upload link', () => {
  it('offers the tool, with the connector’s own wording', () => {
    expect(toolDescription('get_contacts_upload_link')).toBe(CONTACTS_UPLOAD_LINK_DESCRIPTION);
    expect(TOOL_TEXTS.get_contacts_upload_link.description).toBe(CONTACTS_UPLOAD_LINK_DESCRIPTION);
  });

  it('runs it for the owner who asked', () => {
    const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(source).toMatch(
      /case 'get_contacts_upload_link':\s*return contactsUploadLink\(userId\);/u,
    );
  });
});
