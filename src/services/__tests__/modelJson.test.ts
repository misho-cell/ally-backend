import { parseModelJson } from '../modelJson';

interface Publicity {
  public: boolean;
}

describe('parseModelJson — the reply shapes a model actually sends', () => {
  it('parses a bare JSON object (the shape every call site assumed)', () => {
    expect(parseModelJson<Publicity>('{"public":true}')).toEqual({ public: true });
  });

  it('parses a ```json fence — the shape that silently disabled four engines', () => {
    // Verbatim from claude-haiku-4-5 on 1 Sep, replaying the moderation prompt.
    const reply = '```json\n{"public": true}\n```';
    expect(parseModelJson<Publicity>(reply)).toEqual({ public: true });
  });

  it('parses a fence with no language tag, and a pretty-printed body', () => {
    const reply = '```\n{\n  "canonical": "ადვოკატი",\n  "matching_indices": [0, 1]\n}\n```';
    expect(parseModelJson(reply)).toEqual({
      canonical: 'ადვოკატი',
      matching_indices: [0, 1],
    });
  });

  it('parses an ARRAY reply, fenced or bare (the extraction sweep)', () => {
    expect(parseModelJson('[{"person_name":"გია"}]')).toEqual([{ person_name: 'გია' }]);
    expect(parseModelJson('```json\n[{"person_name":"გია"}]\n```')).toEqual([
      { person_name: 'გია' },
    ]);
  });

  it('finds the JSON when the model adds a sentence around it', () => {
    const reply = 'Here is the result:\n{"public": false}\nHope that helps!';
    expect(parseModelJson<Publicity>(reply)).toEqual({ public: false });
  });

  it('returns null — never throws — on an unparseable or empty reply', () => {
    expect(parseModelJson('I cannot answer that.')).toBeNull();
    expect(parseModelJson('')).toBeNull();
    expect(parseModelJson('   ')).toBeNull();
    expect(parseModelJson('{"public": tru')).toBeNull();
  });
});
