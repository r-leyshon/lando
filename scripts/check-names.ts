import { applyOutcome, clearGameStamps, mergeProfiles, nameFromGoogle, stampsFor, type Profile } from "../lib/profile";

function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(label);
}

assert("plain", nameFromGoogle("Sam", "Sam Jones") === "Sam");
assert("injection", nameFromGoogle("Robert'); DROP TABLE players;--", undefined) === "Robert");
assert("markup", nameFromGoogle("<script>", undefined) === "script");
assert("empty", nameFromGoogle("", "😀") === "Player");
assert("full name", nameFromGoogle(undefined, "Mary-Jane Watson") === "Mary-Jane");

const local: Profile = {
  id: "local",
  nickname: "Sam",
  recoveryCode: "AAAAAA",
  muted: true,
  seenCode: true,
  stats: {
    FR: { correct: 2, miss: 0, nearMiss: 0, struggle: 0, found: ["name"] },
    DE: { correct: 1, miss: 1, nearMiss: 0, struggle: 1, found: ["where"] },
  },
  bestStreaks: { "name:world": 4 },
  stamps: { name: ["FR"], where: ["DE"] },
  stampRevision: 2,
};
const remote: Profile = {
  id: "remote",
  nickname: "Samuel",
  recoveryCode: "BBBBBB",
  muted: false,
  seenCode: true,
  stats: {
    FR: { correct: 1, miss: 1, nearMiss: 0, struggle: 3, found: ["flag"] },
    IT: { correct: 1, miss: 0, nearMiss: 0, struggle: 0, found: ["silhouette"] },
  },
  bestStreaks: { "name:world": 2, "flag:world": 3 },
  stamps: { name: ["IT"], flag: ["FR"] },
  stampRevision: 1,
};
const merged = mergeProfiles(local, remote);
assert("id", merged.id === "remote");
assert("name", merged.nickname === "Samuel");
assert("mute", merged.muted === true);
assert("france stamp", merged.stats.FR.correct === 2 && merged.stats.FR.miss === 1);
assert("france struggle stays with the local copy when both played twice", merged.stats.FR.struggle === 0);
assert("germany kept", merged.stats.DE.correct === 1);
assert("italy kept", merged.stats.IT.correct === 1);
const france = merged.stats.FR.found ?? [];
const italy = merged.stats.IT.found ?? [];
assert("france dex", france.includes("name") && france.includes("flag"));
assert("italy dex", italy.includes("silhouette"));
assert("streaks", merged.bestStreaks["name:world"] === 4 && merged.bestStreaks["flag:world"] === 3);
assert("newer stamp book wins", merged.stampRevision === 2 && stampsFor(merged, "name").join() === "FR");
assert("other game stays", stampsFor(merged, "where").join() === "DE" && stampsFor(merged, "flag").length === 0);
const reset = clearGameStamps(merged, "name");
assert("reset clears one game", stampsFor(reset, "name").length === 0 && stampsFor(reset, "where").join() === "DE");
assert("reset bumps the book", reset.stampRevision === 3);
const earned = applyOutcome(reset, { iso: "ES", outcome: "correct", mode: "flag", board: "world", streak: 1 });
assert("new stamp stays in its game", stampsFor(earned, "flag").join() === "ES" && stampsFor(earned, "name").length === 0);
assert("dex catch is separate from the map", (earned.stats.ES.found ?? []).includes("flag"));
console.log("name checks passed");
