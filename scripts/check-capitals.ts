import { quizCountries } from "../lib/countries";
import { capitalOf } from "../lib/capitals";
import { judgePlace } from "../lib/spelling";

const missing = quizCountries.filter((country) => !capitalOf(country.iso2));
if (missing.length > 0) throw new Error(`Missing capitals: ${missing.map((country) => country.iso2).join(" ")}`);

for (const country of quizCountries) {
  const capital = capitalOf(country.iso2);
  if (!capital || !capital.name) throw new Error(country.iso2);
  if (capital.lon < -180 || capital.lon > 180 || capital.lat < -90 || capital.lat > 90) {
    throw new Error(`Bad point ${country.iso2}`);
  }
}

const paris = capitalOf("FR");
const berlin = capitalOf("DE");
if (!paris || !berlin) throw new Error("sample");
const others = [{ place: berlin, country: "Germany" }];
if (judgePlace("Paris", paris, "France", others).kind !== "correct") throw new Error("Paris");
if (judgePlace("Parris", paris, "France", others).kind !== "near") throw new Error("Parris");
if (judgePlace("France", paris, "France", others).kind !== "mixup") throw new Error("country name");
const otherCity = judgePlace("Berlin", paris, "France", others);
if (otherCity.kind !== "mixup" || !otherCity.costsTry) throw new Error("Berlin");
if (judgePlace("Washington DC", capitalOf("US")!, "United States", []).kind !== "correct") throw new Error("DC");
if (judgePlace("Brasilia", capitalOf("BR")!, "Brazil", []).kind !== "correct") throw new Error("Brasilia");

console.log(`capitals ok ${quizCountries.length}`);
