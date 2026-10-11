import { countries } from "../lib/countries";
import { judgeGuess } from "../lib/spelling";

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
expect("england", judgeGuess("England", uk, countries).kind, "mixup");
expect("other country", judgeGuess("Brazil", france, countries).kind, "mixup");
expect("far", judgeGuess("Atlantis", france, countries).kind, "wrong");
expect("prefix sao", judgeGuess("Sao Tome", sao, countries).kind, "near");
expect("ambiguous united", judgeGuess("United", byName("US"), countries).kind, "hint");
expect("niger itself", judgeGuess("Niger", niger, countries).kind, "correct");
expect("guinea itself", judgeGuess("Guinea", guinea, countries).kind, "correct");
