import { askedFileFormat, ReplyFileFormat, withFileLine } from '../excelLine';

/** #6074 (FULL BATTERY 19 Oct, 2 of 2): a Word ask was refused, Markdown came as a code block. */
describe('#6074: a Word or Markdown ask gets the line for its button', () => {
  it('reads which file was asked for', () => {
    expect(askedFileFormat('ჩემი 3 კონტაქტი Word ფაილად მომეცი.')).toBe(ReplyFileFormat.Word);
    expect(askedFileFormat('my 3 contacts as Word')).toBe(ReplyFileFormat.Word);
    expect(askedFileFormat('ჩემი ბუღალტრების სია Markdown-ად მომეცი')).toBe(
      ReplyFileFormat.Markdown,
    );
    expect(askedFileFormat('give me the list in Excel')).toBe(ReplyFileFormat.Excel);
    expect(askedFileFormat('what is the word for plumber?')).toBeNull();
  });

  it('drops the Word refusal and says where the file is', () => {
    const reply =
      'ვორდის ფაილს აქედან ვერ შევქმნი, მაგრამ ამ სიას პირდაპირ ჩასვამ ვორდში.\n\n' +
      '- ნინო ბერიძე\n- გიორგი კაპანაძე\n- ლიკა მაისურაძე';
    const out = withFileLine(reply, 'ჩემი 3 კონტაქტი Word ფაილად მომეცი.', 'ka');
    expect(out).not.toContain('ვერ შევქმნი');
    expect(out).toContain('- ნინო ბერიძე');
    expect(out.endsWith('ქვემოთ „Word“-ზე დაჭერით ეს სია ფაილად ჩამოიტვირთება.')).toBe(true);
  });

  it('takes a Markdown list out of its code block', () => {
    const reply = '```markdown\n- Nino\n- Giorgi\n```';
    const out = withFileLine(reply, 'my contacts as Markdown', 'en');
    expect(out).not.toContain('```');
    expect(out).toBe('- Nino\n- Giorgi\n\nTap „Markdown“ under this reply to download the list.');
  });

  it('leaves a reply alone when no file was asked for', () => {
    const reply = '```markdown\n- Nino\n```';
    expect(withFileLine(reply, 'who are my plumbers?', 'en')).toBe(reply);
  });
});
