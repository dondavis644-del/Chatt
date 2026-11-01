CIRCLE STARTER — IMPORTANT
This is an early starter, not a finished secure production app.

Currently included:
- Supabase email/password sign-in
- Create group
- Real-time text messaging
- Expiry selection (expired messages are hidden in the UI/query)

Not yet included:
- Secure invite/add-member flow and enforced four-member maximum
- Automatic permanent deletion of expired rows
- Voice messages, photo/file uploads, read receipts
- Production security review

Do not use this with real private conversations or publish it publicly until we add and test a four-member limit and safe member-invitation flow. The SQL policies from the earlier step do not yet enforce a four-member maximum.

SETUP
1. Open config.js in a text editor.
2. Replace PASTE_PROJECT_URL_HERE with your base project URL:
   https://fqqzzevnbvtfwybwfptu.supabase.co
3. Replace PASTE_SB_PUBLISHABLE_KEY_HERE with your sb_publishable_ key.
4. Never put a service_role or secret key in frontend code.
5. We will deploy after tightening security and adding the invite flow.
6. Email confirmation may need to be completed before sign-in.

The publishable key is designed to be used in browser code; database safety comes from correct RLS policies. Message expiry timestamps alone do not permanently delete messages.
