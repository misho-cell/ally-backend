// Privacy filter for everything the MCP connector returns. Phone numbers and
// phone-shaped strings are removed server-side before a result is serialized,
// so they can never enter Claude's context. The scrubber itself is shared with
// the in-app agent's streamed output — see ../privacyScrub.
export { scrubText, scrubDeep, containsPhoneLike } from '../privacyScrub';
