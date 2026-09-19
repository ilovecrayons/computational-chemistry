const backgrounds = [
  ["#221d3a", "#7358a8"],
  ["#173b43", "#3b8f86"],
  ["#48242f", "#d06463"],
  ["#202f48", "#5d8ab8"],
  ["#4a321d", "#c68b4e"],
] as const;
const skinTones = ["#8d552f", "#b97850", "#d59a72", "#f0bd91", "#f6d2ae"] as const;
const hairTones = ["#16151a", "#3a241c", "#633c2d", "#a66d3d", "#d5a04f"] as const;

function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
  return result;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const persona = (query.get("persona") || "person")
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 32) || "person";
  const photo = Math.max(0, Math.min(9, Number(query.get("photo") || 0) || 0));
  const seed = hash(`${persona}:${photo}`);
  const [background, secondary] = backgrounds[seed % backgrounds.length];
  const skin = skinTones[seed % skinTones.length];
  const hair = hairTones[Math.floor(seed / 7) % hairTones.length];
  const faceX = 270 + (seed % 18) - 9;
  const faceY = 410 + (Math.floor(seed / 11) % 18) - 9;
  const faceWidth = 142 + (seed % 18);
  const eyeY = faceY - 12;
  const leftEye = faceX - 48;
  const rightEye = faceX + 48;
  const glasses = seed % 4 === 0;
  const freckles = seed % 3 === 0;
  const title = escapeXml(`${persona} generated portrait ${photo + 1}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="720" viewBox="0 0 540 720" role="img" aria-label="${title}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${secondary}"/></linearGradient><linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff536b"/><stop offset="1" stop-color="#ff9c72"/></linearGradient></defs>
<rect width="540" height="720" fill="url(#bg)"/>
<circle cx="80" cy="100" r="90" fill="#ffffff14"/><circle cx="470" cy="570" r="150" fill="#00000016"/>
<path d="M90 720c18-126 92-188 180-188s162 62 180 188Z" fill="url(#shirt)"/>
<path d="M${faceX - 62} ${faceY + 96}v98c22 30 52 46 62 46s40-16 62-46v-98Z" fill="${skin}"/>
<ellipse cx="${faceX}" cy="${faceY}" rx="${faceWidth}" ry="185" fill="${skin}"/>
<path d="M${faceX - faceWidth - 8} ${faceY - 4}c-12-154 54-221 151-185 56 20 79 80 62 159-24-35-56-65-101-75-58 84-119 100-112 101Z" fill="${hair}"/>
<path d="M${faceX - 128} ${faceY - 6}c-3-86 35-166 126-184-102-12-171 57-166 178Z" fill="${hair}"/>
<ellipse cx="${leftEye}" cy="${eyeY}" rx="12" ry="8" fill="#201923"/><ellipse cx="${rightEye}" cy="${eyeY}" rx="12" ry="8" fill="#201923"/>
<path d="M${faceX} ${faceY - 3}c-8 38-14 68 9 73" fill="none" stroke="#6b3c32" stroke-width="8" stroke-linecap="round"/>
<path d="M${faceX - 43} ${faceY + 102}c29 25 61 25 90 0" fill="none" stroke="#6b2832" stroke-width="10" stroke-linecap="round"/>
${glasses ? `<path d="M${leftEye - 31} ${eyeY}h38m24 0h38" stroke="#211c2a" stroke-width="7"/><circle cx="${leftEye}" cy="${eyeY}" r="31" fill="none" stroke="#211c2a" stroke-width="7"/><circle cx="${rightEye}" cy="${eyeY}" r="31" fill="none" stroke="#211c2a" stroke-width="7"/>` : ""}
${freckles ? `<g fill="#7d4638"><circle cx="${faceX - 72}" cy="${faceY + 38}" r="4"/><circle cx="${faceX - 57}" cy="${faceY + 44}" r="3"/><circle cx="${faceX + 57}" cy="${faceY + 44}" r="3"/><circle cx="${faceX + 72}" cy="${faceY + 38}" r="4"/></g>` : ""}
<text x="270" y="672" text-anchor="middle" fill="#ffffffb8" font-family="Arial,sans-serif" font-size="16" letter-spacing="3">GENERATED PORTRAIT</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
