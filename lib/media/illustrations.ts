import { demoSpecs } from "../../features/memes/taxonomy";

type DemoSpec = (typeof demoSpecs)[number];
const palettes = [
  { bg: "#f8e8b9", accent: "#eb7458", pale: "#fff7dc", shade: "#ead39a" },
  { bg: "#dfe9db", accent: "#f09f69", pale: "#f6f9eb", shade: "#c2d4bb" },
  { bg: "#f4dcd9", accent: "#e67c67", pale: "#fff4e6", shade: "#e8b8b2" },
  { bg: "#e0e7e8", accent: "#de8668", pale: "#f8f3e8", shade: "#bccdd2" },
  { bg: "#e8dfc9", accent: "#df8262", pale: "#fff8e6", shade: "#d3c5a4" },
  { bg: "#f7e1be", accent: "#cc6e53", pale: "#fff8e9", shade: "#e6c99b" },
];

export function escapeSvg(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function textLines(
  value: string,
  y: number,
  fontSize: number,
  max: number,
): string {
  const lines: string[] = [];
  for (const word of value.split(" ")) {
    const last = lines.length - 1;
    if (last < 0 || lines[last].length + word.length + 1 > max)
      lines.push(word);
    else lines[last] += ` ${word}`;
  }
  return `<text text-anchor="middle" fill="#25261f" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="-1">${lines.map((line, index) => `<tspan x="270" y="${y + index * (fontSize + 9)}">${escapeSvg(line)}</tspan>`).join("")}</text>`;
}

export function illustrateMeme(spec: DemoSpec, frame = 0): string {
  const index = Number(spec.id.slice(-3)) - 1;
  const palette = palettes[index % palettes.length];
  const bob = Math.sin(frame * Math.PI * 2) * 10;
  const tilt = Math.sin(frame * Math.PI * 2) * 3;
  const topic = index % 6;
  const version = Math.floor(index / 6);
  const accent = palette.accent;
  let scene = "";
  const eye = (x: number, y: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="7" ry="${version % 3 === 1 ? 4 : 11}" fill="#25261f"/>`;
  const cheeks =
    '<ellipse cx="204" cy="480" rx="17" ry="10" fill="#eaa18b" opacity=".7"/><ellipse cx="336" cy="480" rx="17" ry="10" fill="#eaa18b" opacity=".7"/>';
  if (topic === 0) {
    scene = `<ellipse cx="270" cy="638" rx="178" ry="33" fill="#9dab7a"/><path d="M272 625l42 45-20-50" fill="${palette.bg}"/>
      <g transform="translate(0 ${bob}) rotate(${tilt} 270 480)"><ellipse cx="270" cy="531" rx="115" ry="103" fill="#8eaa73" stroke="#343d2a" stroke-width="5"/>
      <ellipse cx="270" cy="542" rx="75" ry="70" fill="#c3ce99"/><ellipse cx="213" cy="409" rx="49" ry="54" fill="#8eaa73" stroke="#343d2a" stroke-width="5"/><ellipse cx="327" cy="409" rx="49" ry="54" fill="#8eaa73" stroke="#343d2a" stroke-width="5"/>
      <ellipse cx="213" cy="409" rx="30" ry="35" fill="#fff9df"/><ellipse cx="327" cy="409" rx="30" ry="35" fill="#fff9df"/>${eye(221, 413)}${eye(320, 413)}${cheeks}
      <path d="M232 484q38 ${version % 2 ? -15 : 26} 76 0" fill="none" stroke="#343d2a" stroke-width="5" stroke-linecap="round"/>
      <path d="M170 533q-43 3-40 49m240-49q43 3 40 49" fill="none" stroke="#343d2a" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="175" cy="627" rx="45" ry="18" fill="#8eaa73" stroke="#343d2a" stroke-width="5"/><ellipse cx="365" cy="627" rx="45" ry="18" fill="#8eaa73" stroke="#343d2a" stroke-width="5"/>
      ${version % 2 ? `<rect x="240" y="532" width="64" height="92" rx="10" fill="${accent}" stroke="#343d2a" stroke-width="5"/><circle cx="272" cy="543" r="3" fill="#343d2a"/><path d="M255 574q17 17 34 0" fill="none" stroke="#fff7de" stroke-width="4"/>` : '<path d="M238 373l-15-48 32 21 19-34 19 34 31-21-15 48z" fill="#e8b754" stroke="#343d2a" stroke-width="4"/>'}</g>`;
  } else if (topic === 1) {
    scene = `<rect x="96" y="548" width="348" height="21" rx="8" fill="#987251" stroke="#37342d" stroke-width="4"/><path d="M127 568v91m285-91v91" stroke="#37342d" stroke-width="13"/>
      <g transform="translate(0 ${bob})"><ellipse cx="278" cy="451" rx="104" ry="114" fill="#aab1b1" stroke="#37342d" stroke-width="5"/><path d="M205 410q66 74 145 0v63q-65 86-145 0z" fill="#718a80"/>
      <ellipse cx="277" cy="366" rx="78" ry="77" fill="#aab1b1" stroke="#37342d" stroke-width="5"/><ellipse cx="250" cy="359" rx="22" ry="23" fill="#fffbed"/>${eye(252, 360)}<path d="M290 375l66 13-60 19z" fill="#edb46b" stroke="#37342d" stroke-width="4"/>
      <path d="M240 443l24-12 28 12-24 18zM268 461l-16 58 20 25 23-25-21-58" fill="${accent}" stroke="#37342d" stroke-width="3"/>
      <path d="M201 451q-39 43-18 65m160-65q39 43 18 65" fill="none" stroke="#37342d" stroke-width="6" stroke-linecap="round"/>
      <path d="M226 320l7-28 17 16 21-29" fill="none" stroke="#37342d" stroke-width="6" stroke-linecap="round"/></g>
      <rect x="92" y="450" width="124" height="94" rx="7" fill="#f4ebd2" stroke="#37342d" stroke-width="5"/><path d="M76 546h150" stroke="#37342d" stroke-width="7" stroke-linecap="round"/><ellipse cx="152" cy="494" rx="11" ry="13" fill="#cc9a73"/>
      <path d="M380 492h31v47h-31zM410 501q35 0 17 26h-17" fill="${accent}" stroke="#37342d" stroke-width="4"/><path d="M393 478q-12-18 0-28" stroke="#9a978a" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  } else if (topic === 2) {
    scene = `<g transform="translate(0 ${bob}) rotate(${tilt} 270 470)"><path d="M144 355q0-19 19-19h216q19 0 19 19v194H144z" fill="#efe8d3" stroke="#34342c" stroke-width="6"/>
      <rect x="163" y="359" width="216" height="151" rx="13" fill="#4a6050" stroke="#34342c" stroke-width="4"/>
      <path d="M202 391l-19 14 19 14m137-28 19 14-19 14" stroke="#c5d7a3" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="238" cy="428" rx="8" ry="11" fill="#dce8bd"/><ellipse cx="305" cy="428" rx="8" ry="11" fill="#dce8bd"/><path d="M248 466q25 ${version % 2 ? -17 : 17} 48 0" stroke="#dce8bd" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M144 549h254l34 67q3 9-12 9H120q-15 0-12-9z" fill="#c6bc9d" stroke="#34342c" stroke-width="6"/>
      <path d="M153 568h234M143 584h254" stroke="#988d70" stroke-width="8" stroke-dasharray="16 7"/><rect x="229" y="596" width="81" height="14" rx="5" fill="#ece4c9"/>
      <path d="M147 447q-54-20-41 37m292-37q54-20 41 37" stroke="#34342c" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M197 628l-18 31m163-31 18 31" stroke="#34342c" stroke-width="7" stroke-linecap="round"/></g>
      <g transform="translate(403 304) rotate(13)"><ellipse rx="35" ry="27" fill="#efc968" stroke="#34342c" stroke-width="4"/><circle cx="-9" cy="-10" r="19" fill="#efc968" stroke="#34342c" stroke-width="4"/><circle cx="-14" cy="-14" r="3" fill="#34342c"/><path d="M-26-9l-16 5 18 6" fill="${accent}" stroke="#34342c" stroke-width="3"/></g>`;
  } else if (topic === 3) {
    scene = `<g transform="translate(0 ${bob}) rotate(${tilt} 270 480)"><path d="M176 400q-35-2-54 49l-31 111q-12 47 18 65 36 17 64-23l33-48h129l33 48q28 40 64 23 30-18 18-65l-31-111q-19-51-54-49z" fill="${accent}" stroke="#34342c" stroke-width="6"/>
      <path d="M155 471h52m-26-26v52" stroke="#f9e7c7" stroke-width="20" stroke-linecap="round"/>
      <circle cx="367" cy="451" r="12" fill="#f9e7c7"/><circle cx="393" cy="477" r="12" fill="#f9e7c7"/><circle cx="341" cy="477" r="12" fill="#f9e7c7"/><circle cx="367" cy="503" r="12" fill="#f9e7c7"/>
      ${eye(248, 477)}${eye(292, 477)}<path d="M256 509q14 13 28 0" stroke="#34342c" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M177 399v-16q0-91 93-91 94 0 94 91v16" fill="none" stroke="#34342c" stroke-width="19"/><path d="M183 383q0-76 87-76t87 76" fill="none" stroke="#f8edd4" stroke-width="8"/>
      <rect x="162" y="360" width="30" height="74" rx="14" fill="#f1dfb8" stroke="#34342c" stroke-width="4"/><rect x="348" y="360" width="30" height="74" rx="14" fill="#f1dfb8" stroke="#34342c" stroke-width="4"/></g>
      <path d="M77 356l7-17 7 17 18 7-18 7-7 18-7-18-18-7zM437 334l7-17 7 17 18 7-18 7-7 18-7-18-18-7z" fill="#efc36b" stroke="#34342c" stroke-width="3"/>`;
  } else if (topic === 4) {
    scene = `<ellipse cx="270" cy="653" rx="169" ry="25" fill="${palette.shade}"/><g transform="translate(0 ${bob})"><path d="M169 427l-14-112 94 50q29-8 55 0l82-50-6 112q23 33 10 83-13 60-115 60t-117-60q-13-50 11-83z" fill="${version % 2 ? "#bd9870" : "#b0b4a2"}" stroke="#34342c" stroke-width="5"/>
      <path d="M179 351l9 58 35-34M360 351l-9 58-35-34" fill="#eac4aa"/>
      <path d="M221 385l13 26m75-26-13 26m-28-37v32" stroke="#6f7061" stroke-width="9" stroke-linecap="round"/>
      ${eye(221, 455)}${eye(320, 455)}<path d="M259 486h24l-12 11z" fill="#ad6f64"/>
      <path d="M271 497q-14 20-27 2m27-2q14 20 27 2" stroke="#34342c" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M192 480l-68-14m68 31-69 9m224-26 68-14m-68 31 69 9" stroke="#34342c" stroke-width="4" stroke-linecap="round"/>
      <path d="M371 574q94-58 62-85" fill="none" stroke="#34342c" stroke-width="24" stroke-linecap="round"/><path d="M371 574q94-58 62-85" fill="none" stroke="#b0b4a2" stroke-width="15" stroke-linecap="round"/></g>
      <path d="M144 533h256l-16 113H157z" fill="#c8a274" stroke="#34342c" stroke-width="5"/><path d="M144 533l-28 34 136 19 18-42M400 533l28 34-136 19-22-42" fill="#e0ba86" stroke="#34342c" stroke-width="4"/>
      <text x="273" y="625" text-anchor="middle" font-family="DejaVu Sans,Arial" font-size="21" font-weight="700" fill="#654e34">${version % 2 ? "THE MANAGEMENT" : "IMPORTANT CAT"}</text>`;
  } else {
    scene = `<ellipse cx="269" cy="627" rx="180" ry="43" fill="#fff8e5" stroke="#34342c" stroke-width="5"/><ellipse cx="269" cy="627" rx="142" ry="24" fill="none" stroke="#d8ceb3" stroke-width="3"/>
      <g transform="translate(0 ${bob}) rotate(${tilt} 270 470)"><path d="M179 410q-42-3-37-48 3-45 55-56 75-37 148 0 52 11 55 56 5 45-37 48v162q0 31-31 31H210q-31 0-31-31z" fill="#ba7847" stroke="#34342c" stroke-width="6"/>
      <path d="M198 392q-36 2-34-29 5-29 40-32 67-34 131 0 35 3 40 32 2 31-34 29v172q0 16-15 16H213q-15 0-15-16z" fill="#f1cd85"/>
      <rect x="233" y="363" width="75" height="47" rx="9" fill="#f6e4a5" stroke="#d5aa5e" stroke-width="3" transform="rotate(-9 270 390)"/>
      ${eye(237, 463)}${eye(307, 463)}${cheeks}<path d="M253 502q18 20 36 0" fill="none" stroke="#34342c" stroke-width="5" stroke-linecap="round"/>
      <path d="M179 491q-41-17-56 8m240-8q41-17 56 8M230 601l-14 32m95-32 14 32" fill="none" stroke="#34342c" stroke-width="7" stroke-linecap="round"/></g>
      <path d="M414 332q-12-20 0-37m-31 48q-12-20 0-37" stroke="#af9c7c" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960" role="img" aria-label="${escapeSvg(`${spec.headline}. ${spec.punchline}. Original offline illustration.`)}">
    <rect width="540" height="960" fill="${palette.bg}"/>
    <path d="M0 658Q130 615 270 646T540 642V715H0Z" fill="${palette.shade}" opacity=".6"/>
    <circle cx="270" cy="469" r="207" fill="${palette.pale}" opacity=".8"/>
    <g fill="${palette.shade}"><circle cx="64" cy="263" r="5"/><circle cx="469" cy="592" r="6"/><circle cx="457" cy="268" r="4"/><circle cx="92" cy="611" r="4"/></g>
    ${textLines(spec.headline, 89, 37, 23)}
    ${scene}
    ${textLines(spec.punchline, 755, 33, 26)}
    <path d="M230 890h80" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>
    <text x="270" y="928" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="14" fill="#655d4f">original offline illustration · ${String(index + 1).padStart(2, "0")}${spec.type === "video" ? " · silent loop" : ""}</text>
  </svg>`;
}

export function illustratePortrait(index: number, name: string): string {
  const skins = [
    "#c38862",
    "#d4a17d",
    "#a86e4d",
    "#e2b896",
    "#925b40",
    "#c28c66",
    "#d6a887",
    "#ad7251",
    "#e0b79b",
    "#b97e59",
  ];
  const backgrounds = [
    "#d5ddc9",
    "#e9c7b8",
    "#eadfbf",
    "#d0d9d6",
    "#ddd0b5",
    "#e5c9c2",
    "#d8dcca",
    "#dfcbae",
    "#e4d2bd",
    "#cfd9cd",
  ];
  const shirts = [
    "#666f4f",
    "#a45843",
    "#625a47",
    "#596d67",
    "#c99b58",
    "#815345",
    "#6c7e5e",
    "#bf7757",
    "#6e6959",
    "#8a5c49",
  ];
  const hair = [
    "#383127",
    "#4d3528",
    "#2e2b24",
    "#6b4830",
    "#26261f",
    "#9b6240",
    "#46372a",
    "#30291f",
    "#765339",
    "#24271f",
  ][index];
  const skin = skins[index];
  const long = index % 3 === 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760" role="img" aria-label="Illustrated portrait of ${escapeSvg(name)}, a fictional adult demo persona">
    <rect width="600" height="760" fill="${backgrounds[index]}"/>
    <path d="M0 600Q180 485 350 600T600 559V760H0Z" fill="#f7f1dd" opacity=".45"/>
    <circle cx="445" cy="157" r="108" fill="#f7efdd" opacity=".5"/>
    <path d="M29 544q-25-110 30-194m-20 119q-36-47-8-70m12 32q50-54 33-80" fill="none" stroke="#788665" stroke-width="15" stroke-linecap="round" opacity=".55"/>
    ${long ? `<path d="M171 387V252q0-154 128-154t136 154v290H163z" fill="${hair}"/>` : ""}
    <path d="M103 760v-81q0-147 145-176h106q145 29 145 176v81z" fill="${shirts[index]}"/>
    <path d="M259 440v82q39 56 83 0v-82" fill="${skin}" stroke="#644733" stroke-width="3"/>
    <path d="M259 459q39 44 83 0v28q-42 33-83 0z" fill="#7d4e37" opacity=".17"/>
    <ellipse cx="183" cy="328" rx="27" ry="39" fill="${skin}"/><ellipse cx="416" cy="328" rx="27" ry="39" fill="${skin}"/>
    <path d="M184 253q0-123 114-123t120 123v97q0 123-118 143-116-20-116-143z" fill="${skin}"/>
    ${index % 3 === 0 ? `<path d="M180 298q-39-108 13-159 28-50 86-38 100-52 142 56 28 48-5 142l-27-78q-62 26-123-9l-69 71z" fill="${hair}"/>` : index % 3 === 1 ? `<path d="M184 298q-33-117 21-164 91-73 164-13 69 36 51 177l-37-94q-88 49-184 50z" fill="${hair}"/>` : `<path d="M182 272q-40-125 57-164 109-31 161 37 41 43 18 127l-26-58q-98-39-198 15z" fill="${hair}"/>`}
    <path d="M219 299q28-17 51-1m61 0q26-15 49 1" fill="none" stroke="${hair}" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="246" cy="326" rx="8" ry="11" fill="#2a2922"/><ellipse cx="354" cy="326" rx="8" ry="11" fill="#2a2922"/>
    <circle cx="249" cy="323" r="2.5" fill="#fff4db"/><circle cx="357" cy="323" r="2.5" fill="#fff4db"/>
    <path d="M299 329l-10 41q13 9 26 0" fill="none" stroke="#80543c" stroke-width="4" stroke-linecap="round"/>
    <path d="M266 405q34 27 69-1" fill="#fff2df" stroke="#754b38" stroke-width="4" stroke-linejoin="round"/>
    ${index % 4 === 2 ? '<g fill="none" stroke="#494334" stroke-width="6"><rect x="205" y="305" width="77" height="54" rx="19"/><rect x="319" y="305" width="77" height="54" rx="19"/><path d="M282 323q18-9 37 0"/></g>' : ""}
    ${index % 3 === 1 ? '<circle cx="189" cy="371" r="12" fill="none" stroke="#e9c979" stroke-width="6"/><circle cx="410" cy="371" r="12" fill="none" stroke="#e9c979" stroke-width="6"/>' : ""}
    <path d="M249 526q53 74 103 0" fill="none" stroke="#f1e4c9" stroke-width="5"/>
    <path d="M174 680v80m256-80v80" stroke="#292820" stroke-opacity=".18" stroke-width="5"/>
    <text x="36" y="723" font-family="DejaVu Sans,Arial,sans-serif" font-size="16" fill="#fff8e8" opacity=".85">fictional demo portrait</text>
  </svg>`;
}
