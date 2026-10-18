-- 250: #5776 (the founder's D824, 18 Oct 2026). Asked „how do I add Netai to
-- Claude / ChatGPT?", Netai answers with the exact steps. Content, not a rule:
-- admin-editable like every netai_info topic; kept in step with
-- docs/NETAI_CONNECTOR_PHONE_GUIDE.md (#5743).
INSERT INTO netai_info (topic, content) VALUES ('connectors', $netai$
Adding Netai to Claude (works in a phone browser too; the Claude app itself cannot add a connector, but shows it once added on the web): open claude.ai and sign in → Customize → Connectors → Add custom connector → name: Netai, URL: https://api.netai.guru/mcp → Add → Connect → sign in with your phone number and the WhatsApp code. A free Claude plan allows one custom connector.
Adding Netai to ChatGPT (on the web, chatgpt.com, also in a phone browser): Settings → Plugins → + → Add custom MCP server → name: Netai, URL: https://api.netai.guru/mcp, authentication OAuth → tick "I understand" → Create → Sign in with Netai. Which ChatGPT plans may add a custom server has changed during 2026; if the option is missing, the plan does not allow it.
If you added it earlier under the old name "Ally" (address api.allyapp.one): it still works, but remove it and add Netai as above to get the new name and tools.
Contacts from inside Claude or ChatGPT: ask "put my contacts into Netai" — you get a one-time link (30 minutes); open it on the phone, pick your contacts file (.vcf), tap Upload. The numbers go straight to Netai, never through the chat.
$netai$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();
