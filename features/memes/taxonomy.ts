export const TONES = [
  "absurd",
  "wholesome",
  "cursed",
  "deadpan",
  "dark",
  "cringe",
] as const;
export const FORMATS = [
  "reaction",
  "POV",
  "fake screenshot",
  "starter pack",
  "deep-fried",
] as const;
export const TOPICS = [
  "political",
  "italian-brainrot",
  "skibidi-toilet",
  "larping",
  "cats",
  "doomscrolling",
  "corporate-core",
  "corecore",
  "rage-bait",
  "sigma-grindset",
  "medieval",
  "niche-jobs",
  "phonk",
] as const;
export const TAXONOMY_VERSION = 2;

export interface MemeSpec {
  tone: (typeof TONES)[number];
  format: (typeof FORMATS)[number];
  topics: (typeof TOPICS)[number][];
  chaos: number;
}

export function tagsFor(input: MemeSpec): Record<string, number> {
  return Object.fromEntries(
    [input.tone, input.format, ...input.topics].map((tag) => [tag, 1]),
  );
}

export function buildPrompt(input: MemeSpec): string {
  return `Create one original vertical 9:16 internet meme. Tone: ${input.tone}. Format: ${input.format}. Topic${input.topics.length > 1 ? "s" : ""}: ${input.topics.join(" and ")}. Chaos intensity: ${input.chaos}/5. Use a striking, readable illustrated composition, one specific relatable joke, and large high-contrast English meme text with generous safe margins. Keep it funny without relying on sound. No logos, real people's likenesses, sexual content, hate, harassment, graphic violence, self-harm, or jokes targeting protected characteristics. Do not print the taxonomy labels, instructions, or metadata. All characters are fictional adults or illustrated animals.`;
}


