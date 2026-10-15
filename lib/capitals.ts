import { quizCountries } from "@/lib/countries";

export type Capital = {
  iso: string;
  name: string;
  lon: number;
  lat: number;
  aliases: string[];
};

/** iso, city, longitude, latitude, then any extra accepted names. */
const ROWS = `
AF|Kabul|69.17|34.53
AL|Tirana|19.82|41.33
DZ|Algiers|3.06|36.75
AD|Andorra la Vella|1.52|42.51
AO|Luanda|13.23|-8.84
AG|Saint John's|-61.85|17.12|St John's|Saint Johns
AR|Buenos Aires|-58.38|-34.60
AM|Yerevan|44.51|40.18
AU|Canberra|149.13|-35.28
AT|Vienna|16.37|48.21
AZ|Baku|49.87|40.41
BS|Nassau|-77.34|25.05
BH|Manama|50.59|26.23
BD|Dhaka|90.41|23.81|Dacca
BB|Bridgetown|-59.62|13.10
BY|Minsk|27.57|53.90
BE|Brussels|4.35|50.85
BZ|Belmopan|-88.77|17.25
BJ|Porto-Novo|2.63|6.50|Porto Novo
BT|Thimphu|89.64|27.47
BO|La Paz|-68.15|-16.50
BA|Sarajevo|18.36|43.86
BW|Gaborone|25.92|-24.65
BR|Brasilia|-47.93|-15.78|Brasília
BN|Bandar Seri Begawan|114.94|4.89|Bandar
BG|Sofia|23.32|42.70
BF|Ouagadougou|-1.52|12.37
BI|Gitega|29.92|-3.43
KH|Phnom Penh|104.93|11.56
CM|Yaounde|11.52|3.87|Yaoundé
CA|Ottawa|-75.70|45.42
CV|Praia|-23.51|14.93
CF|Bangui|18.56|4.36
TD|N'Djamena|15.05|12.13|Ndjamena
CL|Santiago|-70.67|-33.45
CN|Beijing|116.41|39.90|Peking
CO|Bogota|-74.07|4.71|Bogotá
KM|Moroni|43.26|-11.70
CR|San Jose|-84.09|9.93|San José
HR|Zagreb|15.98|45.81
CU|Havana|-82.37|23.11|Habana
CY|Nicosia|33.37|35.19|Lefkosia
CZ|Prague|14.42|50.09|Praha
DK|Copenhagen|12.57|55.68
DJ|Djibouti|43.15|11.59
DM|Roseau|-61.39|15.30
DO|Santo Domingo|-69.93|18.49
CD|Kinshasa|15.31|-4.32
EC|Quito|-78.47|-0.18
EG|Cairo|31.24|30.04
SV|San Salvador|-89.19|13.69
GQ|Malabo|8.78|3.75
ER|Asmara|38.93|15.34
EE|Tallinn|24.75|59.44
SZ|Mbabane|31.13|-26.32
ET|Addis Ababa|38.75|9.03
FJ|Suva|178.44|-18.14
FI|Helsinki|24.94|60.17
FR|Paris|2.35|48.86
GA|Libreville|9.45|0.39
GM|Banjul|-16.58|13.45
GE|Tbilisi|44.83|41.69
DE|Berlin|13.40|52.52
GH|Accra|-0.19|5.56
GR|Athens|23.73|37.98
GD|Saint George's|-61.75|12.05|St George's|Saint Georges
GT|Guatemala City|-90.51|14.63
GN|Conakry|-13.71|9.54
GW|Bissau|-15.60|11.86
GY|Georgetown|-58.16|6.80
HT|Port-au-Prince|-72.34|18.54|Port au Prince
HN|Tegucigalpa|-87.21|14.08
HU|Budapest|19.04|47.50
IS|Reykjavik|-21.94|64.15|Reykjavík
IN|New Delhi|77.21|28.61|Delhi
ID|Jakarta|106.85|-6.21
IR|Tehran|51.39|35.69
IQ|Baghdad|44.37|33.31
IE|Dublin|-6.26|53.35
IL|Jerusalem|35.21|31.77
IT|Rome|12.50|41.90|Roma
CI|Yamoussoukro|-5.27|6.83
JM|Kingston|-76.79|17.97
JP|Tokyo|139.69|35.69
JO|Amman|35.95|31.96
KZ|Astana|71.45|51.18|Nur-Sultan|Nursultan
KE|Nairobi|36.82|-1.29
KI|Tarawa|173.00|1.45|South Tarawa
XK|Pristina|21.17|42.67|Prishtina
KW|Kuwait City|47.98|29.38|Kuwait
KG|Bishkek|74.57|42.87
LA|Vientiane|102.63|17.98
LV|Riga|24.11|56.95
LB|Beirut|35.50|33.89
LS|Maseru|27.48|-29.31
LR|Monrovia|-10.80|6.30
LY|Tripoli|13.19|32.89
LI|Vaduz|9.52|47.14
LT|Vilnius|25.28|54.69
LU|Luxembourg|6.13|49.61|Luxembourg City
MG|Antananarivo|47.51|-18.88
MW|Lilongwe|33.77|-13.96
MY|Kuala Lumpur|101.69|3.14
MV|Male|73.51|4.18|Malé
ML|Bamako|-8.00|12.64
MT|Valletta|14.51|35.90
MH|Majuro|171.38|7.09
MR|Nouakchott|-15.98|18.07
MU|Port Louis|57.50|-20.16
MX|Mexico City|-99.13|19.43|Mexico
FM|Palikir|158.16|6.92
MD|Chisinau|28.86|47.01|Chișinău
MC|Monaco|7.42|43.74
MN|Ulaanbaatar|106.91|47.89|Ulan Bator
ME|Podgorica|19.26|42.44
MA|Rabat|-6.85|34.02
MZ|Maputo|32.59|-25.97
MM|Naypyidaw|96.13|19.75|Nay Pyi Taw|Naypyitaw
NA|Windhoek|17.08|-22.56
NR|Yaren|166.93|-0.55
NP|Kathmandu|85.32|27.70
NL|Amsterdam|4.90|52.37
NZ|Wellington|174.78|-41.29
NI|Managua|-86.25|12.11
NE|Niamey|2.11|13.51
NG|Abuja|7.50|9.06
KP|Pyongyang|125.75|39.03
MK|Skopje|21.43|42.00
NO|Oslo|10.75|59.91
OM|Muscat|58.41|23.59
PK|Islamabad|73.05|33.69
PW|Ngerulmud|134.62|7.50
PS|Ramallah|35.21|31.90
PA|Panama City|-79.52|9.00|Panama
PG|Port Moresby|147.18|-9.44
PY|Asuncion|-57.58|-25.26|Asunción
PE|Lima|-77.04|-12.05
PH|Manila|120.98|14.60
PL|Warsaw|21.01|52.23|Warszawa
PT|Lisbon|-9.14|38.72|Lisboa
QA|Doha|51.53|25.29
CG|Brazzaville|15.28|-4.26
RO|Bucharest|26.10|44.43|Bucuresti
RU|Moscow|37.62|55.76
RW|Kigali|30.06|-1.94
KN|Basseterre|-62.72|17.30
LC|Castries|-61.00|14.01
VC|Kingstown|-61.23|13.16
WS|Apia|-171.75|-13.83
SM|San Marino|12.46|43.94
ST|Sao Tome|6.73|0.34|São Tomé
SA|Riyadh|46.72|24.69
SN|Dakar|-17.47|14.72
RS|Belgrade|20.46|44.79|Beograd
SC|Victoria|55.45|-4.62
SL|Freetown|-13.23|8.48
SG|Singapore|103.82|1.35
SK|Bratislava|17.11|48.15
SI|Ljubljana|14.51|46.05
SB|Honiara|159.95|-9.43
SO|Mogadishu|45.32|2.05
ZA|Pretoria|28.19|-25.75
KR|Seoul|126.98|37.57
SS|Juba|31.58|4.85
ES|Madrid|-3.70|40.42
LK|Colombo|79.86|6.93|Kotte|Sri Jayawardenepura Kotte
SD|Khartoum|32.56|15.50
SR|Paramaribo|-55.17|5.85
SE|Stockholm|18.07|59.33
CH|Bern|7.45|46.95|Berne
SY|Damascus|36.28|33.51
TW|Taipei|121.57|25.03
TJ|Dushanbe|68.79|38.56
TZ|Dodoma|35.75|-6.16
TH|Bangkok|100.50|13.76|Krung Thep
TL|Dili|125.58|-8.56
TG|Lome|1.22|6.14|Lomé
TO|Nukualofa|-175.20|-21.13|Nuku'alofa
TT|Port of Spain|-61.51|10.65
TN|Tunis|10.18|36.81
TR|Ankara|32.85|39.93
TM|Ashgabat|58.38|37.94|Ashkhabad
UG|Kampala|32.58|0.35
UA|Kyiv|30.52|50.45|Kiev
AE|Abu Dhabi|54.37|24.45
GB|London|-0.13|51.51
US|Washington|-77.04|38.91|Washington DC|Washington D.C.
UY|Montevideo|-56.16|-34.88
UZ|Tashkent|69.24|41.30
VU|Port Vila|168.32|-17.73
VA|Vatican City|12.45|41.90|Vatican
VE|Caracas|-66.90|10.48
VN|Hanoi|105.85|21.03|Ha Noi
YE|Sanaa|44.21|15.37|Sana'a
ZM|Lusaka|28.28|-15.39
ZW|Harare|31.03|-17.83
`.trim();

function parseRows() {
  const capitals = new Map<string, Capital>();
  for (const line of ROWS.split("\n")) {
    const [iso, name, lon, lat, ...aliases] = line.split("|");
    capitals.set(iso, {
      iso,
      name,
      lon: Number(lon),
      lat: Number(lat),
      aliases: aliases.filter(Boolean),
    });
  }
  return capitals;
}

const byIso = parseRows();

export function capitalOf(iso: string) {
  return byIso.get(iso) ?? null;
}

export function everyCapital() {
  return quizCountries.map((country) => byIso.get(country.iso2) ?? null);
}
