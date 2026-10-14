# Lando

A phone-first geography game. Lando asks you to find countries and spell their English names.

## Play locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google. The name in the game is the first name on that Google account. Stamps are kept on the phone and refreshed from the database on the home screen.

## Scores in Neon

1. Create a Neon Postgres database.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, and `AUTH_SECRET`.
3. In Google Cloud, create a web OAuth client and add this site's address as an authorised JavaScript origin.
4. Restart the app. Tables are created on the first sign-in.

Deploy on Vercel with the same variables. A player signs in with Google on a new phone and the stamps come back. They do not type a name or a recovery code.
