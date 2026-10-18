-- 251: #5776 retest (the tester's 67488). The steps were right 3/3, but a
-- Georgian answer translated the buttons („მორგება → დამაკავშირებლები") or
-- spelt them in Georgian letters, and the name became „ნეტაი". Claude's and
-- ChatGPT's screens show English, so a guest could not find the button. The
-- topic now opens with how to write them.
UPDATE netai_info SET content = $netai$
How to write these steps in any language: every button and menu name stays exactly as the screen shows it, in English and in Latin letters, in quotes — "Customize", "Connectors", "Add custom connector", "Add", "Connect", "Settings", "Plugins", "Add custom MCP server", "I understand", "Create", "Sign in with Netai" — and the name is always "Netai" in Latin letters. Explain around them in the user's language; never translate or transliterate them.
$netai$ || content, updated_at = NOW()
WHERE topic = 'connectors';
