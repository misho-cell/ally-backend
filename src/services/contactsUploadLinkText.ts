/**
 * What the model is told about the contacts upload link. One wording for the
 * connector (mcp/texts.ts) and the app chat (#6073), so both doors say the same.
 */
export const CONTACTS_UPLOAD_LINK_DESCRIPTION =
  'Gives the member a one-time link to put their phone contacts into Netai: they open it on ' +
  'the phone, pick the contacts file (.vcf) and tap Upload. The file goes straight to Netai, so ' +
  'no number passes through this chat. Use when they want to add or refresh their contacts ' +
  'here. Give them the link and say it works once, for 30 minutes; when they are back, ' +
  'get_network_stats shows the new total.';
