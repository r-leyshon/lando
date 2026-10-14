import { connection } from "next/server";

export async function POST() {
  await connection();
  return Response.json({ error: "Sign in with Google." }, { status: 410 });
}
