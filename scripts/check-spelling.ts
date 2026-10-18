import { countries } from "../lib/countries";
import { createProfile, applyOutcome } from "../lib/profile";
import { judgeGuess, letterTiles, openHint, spellingTarget } from "../lib/spelling";

const byName = (name: string) => {
  const country = countries.find((item) => item.name === name || item.iso2 === name);
  if (!country) throw new Error(`missing ${name}`);
  return country;
};

function expect(label: string, actual: string, wanted: string) {
  if (actual !== wanted) {
    console.error("FAIL", label, actual, "expected", wanted);
    process.exitCode = 1;
  } else {
    console.log("ok", label);
  }
}

const nigeria = byName("Nigeria");
const niger = byName("Niger");
const guinea = byName("Guinea");
const bissau = byName("Guinea-Bissau");
const uk = byName("GB");
const france = byName("France");
const sao = byName("São Tomé and Príncipe");

expect("exact", judgeGuess("Nigeria", nigeria, countries).kind, "correct");
expect("alias usa", judgeGuess("USA", byName("US"), countries).kind, "correct");
expect("turkey", judgeGuess("Turkey", byName("TR"), countries).kind, "correct");
expect("niger on nigeria", judgeGuess("Niger", nigeria, countries).kind, "mixup");
expect("guinea on bissau", judgeGuess("Guinea", bissau, countries).kind, "mixup");
expect("near nigeria", judgeGuess("Nigeira", nigeria, countries).kind, "near");
expect("near france", judgeGuess("Frnace", france, countries).kind, "near");
const england = judgeGuess("England", uk, countries);
expect("england", england.kind, "mixup");
expect(
  "england hides the country",
  england.kind === "mixup" && /united kingdom/i.test(england.message) ? "spoiled" : "hidden",
  "hidden",
);
const otherCountry = judgeGuess("Brazil", france, countries);
expect("other country", otherCountry.kind, "mixup");
expect(
  "other country hides the answer",
  otherCountry.kind === "mixup" && otherCountry.message.includes(france.name) ? "spoiled" : "hidden",
  "hidden",
);
expect("far", judgeGuess("Atlantis", france, countries).kind, "wrong");
expect("prefix sao", judgeGuess("Sao Tome", sao, countries).kind, "near");
expect("ambiguous united", judgeGuess("United", byName("US"), countries).kind, "hint");
expect("niger itself", judgeGuess("Niger", niger, countries).kind, "correct");
expect("guinea itself", judgeGuess("Guinea", guinea, countries).kind, "correct");
expect("britain alias", judgeGuess("Britain", uk, countries).kind, "correct");
expect(
  "full uk name",
  judgeGuess("United Kingdom of Great Britain and Northern Ireland", uk, countries).kind,
  "correct",
);
const drc = byName("CD");
const congo = byName("CG");
expect("drc full name", judgeGuess("The Democratic Republic of Congo", drc, countries).kind, "correct");
expect(
  "drc full name with the",
  judgeGuess("The Democratic Republic of the Congo", drc, countries).kind,
  "correct",
);
expect("republic of congo", judgeGuess("Republic of Congo", congo, countries).kind, "correct");
expect("the congo", judgeGuess("The Congo", congo, countries).kind, "correct");
expect("republic of congo is not drc", judgeGuess("Republic of Congo", drc, countries).kind, "mixup");
expect("the gambia", judgeGuess("The Gambia", byName("GM"), countries).kind, "correct");
expect("the bahamas", judgeGuess("The Bahamas", byName("BS"), countries).kind, "correct");
expect("the philippines", judgeGuess("The Philippines", byName("PH"), countries).kind, "correct");
expect("holy see", judgeGuess("Holy See", byName("VA"), countries).kind, "correct");
expect("republic of turkiye", judgeGuess("Republic of Türkiye", byName("TR"), countries).kind, "correct");
expect("the france stays wrong", judgeGuess("The France", france, countries).kind, "wrong");
expect("brirain target", spellingTarget("Brirain", uk), "britain");
expect(
  "brirain tiles",
  letterTiles("Brirain", spellingTarget("Brirain", uk))
    .map((tile) => tile.tone[0])
    .join(""),
  "gggrggg",
);
expect("kingdom typo target", spellingTarget("United Kingdm", uk), "United Kingdom");
expect("united hint target", spellingTarget("United", uk), "United Kingdom");
expect("america typo target", spellingTarget("Americaa", byName("US")), "america");

const firstHint = openHint("France", 0, [], () => 0);
expect("france letter count", String(firstHint.letters), "6");
expect("france blanks", firstHint.tiles.map((tile) => tile.tone).join(","), "empty,empty,empty,empty,empty,empty");
const secondHint = openHint("France", 1, firstHint.revealed, () => 0);
expect("one shown letter", secondHint.tiles.map((tile) => tile.ch).join(""), "F");
expect("one green", secondHint.tiles.filter((tile) => tile.tone === "green").length.toString(), "1");
const thirdHint = openHint("France", 2, secondHint.revealed, () => 0);
expect("three shown letters", thirdHint.tiles.filter((tile) => tile.tone === "green").map((tile) => tile.ch).join(""), "FRA");
const kingdom = openHint("United Kingdom", 0, [], () => 0);
expect("kingdom gap", kingdom.tiles.some((tile) => tile.tone === "gap") ? "yes" : "no", "yes");
expect("kingdom letters", String(kingdom.letters), "13");

const hinted = applyOutcome(createProfile("Sam"), {
  iso: "FR",
  outcome: "hint",
  mode: "name",
  board: "world",
  streak: 4,
});
expect("hint struggle", String(hinted.stats.FR?.struggle), "1");
expect("hint is not a miss", String(hinted.stats.FR?.miss), "0");
expect("hint keeps the streak", String(hinted.bestStreaks["name:world"]), "4");
