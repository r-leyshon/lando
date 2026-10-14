import { mergeProfiles, nameFromGoogle, type Profile } from "../lib/profile";

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
    FR: { correct: 2, miss: 0, nearMiss: 0, struggle: 0 },
    DE: { correct: 1, miss: 1, nearMiss: 0, struggle: 1 },
  },
  bestStreaks: { "name:world": 4 },
};
const remote: Profile = {
  id: "remote",
  nickname: "Samuel",
  recoveryCode: "BBBBBB",
  muted: false,
  seenCode: true,
  stats: {
    FR: { correct: 1, miss: 1, nearMiss: 0, struggle: 3 },
    IT: { correct: 1, miss: 0, nearMiss: 0, struggle: 0 },
  },
  bestStreaks: { "name:world": 2, "flag:world": 3 },
};
const merged = mergeProfiles(local, remote);
assert("id", merged.id === "remote");
assert("name", merged.nickname === "Samuel");
assert("mute", merged.muted === true);
assert("france stamp", merged.stats.FR.correct === 2 && merged.stats.FR.miss === 1);
assert("france struggle stays with the local copy when both played twice", merged.stats.FR.struggle === 0);
assert("germany kept", merged.stats.DE.correct === 1);
assert("italy kept", merged.stats.IT.correct === 1);
assert("streaks", merged.bestStreaks["name:world"] === 4 && merged.bestStreaks["flag:world"] === 3);
console.log("name checks passed");
