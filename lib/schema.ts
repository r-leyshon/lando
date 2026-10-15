import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: uuid("id").primaryKey(),
  nickname: text("nickname").notNull(),
  recoveryCode: text("recovery_code").notNull().unique(),
  googleSub: text("google_sub").unique(),
  gameStamps: text("game_stamps").notNull().default("{}"),
  stampRevision: integer("stamp_revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countryStats = pgTable(
  "country_stats",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    countryIso: text("country_iso").notNull(),
    correctCount: integer("correct_count").notNull().default(0),
    missCount: integer("miss_count").notNull().default(0),
    nearMissCount: integer("near_miss_count").notNull().default(0),
    struggleScore: integer("struggle_score").notNull().default(0),
    foundName: boolean("found_name").notNull().default(false),
    foundWhere: boolean("found_where").notNull().default(false),
    foundShape: boolean("found_shape").notNull().default(false),
    foundFlag: boolean("found_flag").notNull().default(false),
    foundCapital: boolean("found_capital").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.countryIso] })],
);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  board: text("board").notNull(),
  bestStreak: integer("best_streak").notNull().default(0),
  durationMs: integer("duration_ms"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
