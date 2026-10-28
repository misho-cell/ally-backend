import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #1849 (Lika's FAIL, 27 Oct): the reply after find_warm_path named the bridges
 * in text, and the drawn map (/paths/:id, live since 11 Oct) was reachable only
 * from a contact's page. The reply now carries the target's sealed id, live
 * and in history, so the app can open the map from it.
 */
const read = (...p: string[]): string => readFileSync(join(__dirname, ...p), 'utf8');
const chat = read('..', 'chat.service.ts');

describe('a path search opens its map (#1849)', () => {
  it('remembers the person find_warm_path reached, sealed for this owner', () => {
    const handler = chat.slice(chat.indexOf("case 'find_warm_path': {"));
    expect(handler.slice(0, 1200)).toContain('notePathMap(runId, userId, warm);');
    expect(chat).toContain('runPathMap.set(runId, encodeContactRef(userId, warm.target.phone));');
  });

  it('stores it with the reply, only when the reply is safe', () => {
    expect(chat).toContain('const pathMapId = replySafe ? pathMapHeld : undefined;');
    expect(chat).toContain('pathMapId ?? null,');
    expect(chat).toContain('path_map_id)');
  });

  it('sends it live and reads it back in history', () => {
    expect(read('..', '..', 'api', 'routes', 'threads.routes.ts')).toContain(
      '...(result.pathMapId && { path_map_id: result.pathMapId }),',
    );
    expect(read('..', 'sse.service.ts')).toContain(
      '...(payload.path_map_id !== undefined && { path_map_id: payload.path_map_id }),',
    );
    expect(read('..', 'threads.service.ts')).toContain('answered_by, path_map_id');
  });

  it('has its column', () => {
    expect(
      read('..', '..', 'db', 'postgres', 'migrations', '279_conversations_path_map.sql'),
    ).toContain('ADD COLUMN IF NOT EXISTS path_map_id TEXT');
  });
});
