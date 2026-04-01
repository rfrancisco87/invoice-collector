# invoice-collector

## Login setup

This app now uses its own database-backed login with:

- a user profile stored in `profiles`
- a password hash stored in `app_credentials`
- a signed app session cookie

### 1. Create the credentials table

Run the SQL in `database/app-auth.sql` in Supabase.

### 2. Set the session secret

Add this to your environment:

```bash
APP_SESSION_SECRET=replace-with-a-long-random-secret
```

### 3. Create or update the login user and password

Run:

```bash
npm run set-password -- you@example.com your-password "Your Name"
```

That command will:

- create the user in `profiles` if it does not exist
- set or replace the hashed password in `app_credentials`
- mark the user as `admin`

### 4. Log in

Start the app and use the same email and password on `/login`.
