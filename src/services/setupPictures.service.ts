import { query } from '../db/postgres/client';
import { Gadget, SetupStep } from './setupState.service';

/**
 * #6139 (task 1882, B4+B6; the founder's D689): the pictures of the real
 * screen under each setup step, per gadget, in tap order, each with its
 * Georgian caption. Kept in the database so a picture is swapped from the
 * admin without a deploy (spec 4.2).
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_PICTURE_POSITION = 30;
/** A screenshot here is 100-400 KB; the cap keeps a wrong file from being stored. */
export const MAX_PICTURE_BYTES = 2_000_000;

export enum PictureType {
  Png = 'image/png',
  Jpeg = 'image/jpeg',
  Webp = 'image/webp',
}

export function isPictureType(v: unknown): v is PictureType {
  return typeof v === 'string' && (Object.values(PictureType) as string[]).includes(v);
}

export interface SetupPicture {
  readonly id: number;
  readonly position: number;
  readonly caption: string;
  /** Changes when the picture is replaced, so a cached copy is not shown. */
  readonly version: string;
}

export interface PictureFile {
  readonly contentType: string;
  readonly bytes: Buffer;
}

export class PictureTooLargeError extends Error {
  constructor(bytes: number) {
    super(`The picture is ${bytes} bytes; at most ${MAX_PICTURE_BYTES} are stored.`);
    this.name = 'PictureTooLargeError';
  }
}

/** The pictures of one step on one gadget, in tap order; empty when it has none. */
export async function picturesFor(gadget: Gadget, step: SetupStep): Promise<SetupPicture[]> {
  const result = await query<{ id: number; position: number; caption: string; version: string }>(
    `SELECT id, position, caption, EXTRACT(EPOCH FROM updated_at)::bigint::text AS version
       FROM setup_pictures
      WHERE gadget = $1 AND step = $2
      ORDER BY position
      LIMIT $3`,
    [gadget, step, MAX_PICTURE_POSITION],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** One picture's file, or null when there is no such picture. */
export async function pictureFile(id: number): Promise<PictureFile | null> {
  const result = await query<{ content_type: string; image: Buffer }>(
    `SELECT content_type, image FROM setup_pictures WHERE id = $1`,
    [id],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { contentType: row.content_type, bytes: row.image };
}

/** Stores or replaces the picture at this place; returns its id. */
export async function putPicture(
  gadget: Gadget,
  step: SetupStep,
  position: number,
  picture: PictureFile,
  caption: string,
): Promise<number> {
  if (picture.bytes.length > MAX_PICTURE_BYTES) {
    throw new PictureTooLargeError(picture.bytes.length);
  }
  const result = await query<{ id: number }>(
    `INSERT INTO setup_pictures (gadget, step, position, content_type, image, caption)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (gadget, step, position) DO UPDATE
        SET content_type = EXCLUDED.content_type, image = EXCLUDED.image,
            caption = EXCLUDED.caption, updated_at = NOW()
     RETURNING id`,
    [gadget, step, position, picture.contentType, picture.bytes, caption],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0].id;
}

/** Removes the picture at this place; false when there was none. */
export async function removePicture(
  gadget: Gadget,
  step: SetupStep,
  position: number,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM setup_pictures WHERE gadget = $1 AND step = $2 AND position = $3`,
    [gadget, step, position],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
