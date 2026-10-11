# Lando

A phone-first geography game. Lando asks you to find countries and spell their English names.

## Play locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first screen asks what Lando should call you. Scores stay on that device even without a database.

## Scores in Neon

1. Create a Neon Postgres database.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
3. Restart the app. Tables are created on the first save.

Deploy on Vercel with the same `DATABASE_URL`. Leaderboards then share streaks between devices. A player’s Lando code restores a profile when the database is connected.

There is no password. The code is an id for a family game, not an account system.
