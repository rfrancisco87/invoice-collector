# invoice-collector

## Owner-only login

Set `ALLOWED_LOGIN_EMAIL` in your environment to the single email address that should be able to access the app.

Example:

```bash
ALLOWED_LOGIN_EMAIL=you@example.com
```

Behavior:

- Only that email is allowed to use the app after authentication.
- Public signup in the UI is disabled.
- If a different Supabase user signs in, their session is rejected and they are sent back to `/login`.

If you do not already have the owner account created, create it once in Supabase Auth using the same email address, then log in normally through the app.
