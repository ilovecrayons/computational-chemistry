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
  "dating",
  "work",
  "coding",
  "gaming",
  "pets",
  "food",
] as const;
export const TAXONOMY_VERSION = 1;

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

const jokes: [string, string][] = [
  ["me: I like a little mystery", "also me: why did they type for 47 seconds"],
  ["this meeting could have been", "a very small pigeon"],
  ["it works on my machine", "my machine is a haunted toaster"],
  ["one quick game before bed", "the sun has entered the chat"],
  ["my cat has two moods", "landlord and smaller landlord"],
  ["a balanced diet", "a little treat in each hand"],
  ["dating me is like a museum", "quiet at first. weird stuff later."],
  ["I bring a lot to the table", "mostly an emotional support coffee"],
  ["fixed one bug", "unlocked the extended universe"],
  ["teamwork makes the dream work", "our team has chosen a side quest"],
  ["he does not pay rent", "he does judge the furniture"],
  ["my meal prep for the week", "seven increasingly ambitious snacks"],
  ["our love language?", "sending the same meme at the same time"],
  ["my five-year plan", "close a few tabs"],
  ["the code review was gentle", "I am emotionally compiling"],
  ["inventory full", "still collecting small rocks"],
  ["tiny paws. huge responsibility.", "regional manager of the sunbeam"],
  ["I saved you the last fry", "this is legally a love letter"],
  ["I am playing it cool", "the council of frogs disagrees"],
  ["quick question", "famous last words of my afternoon"],
  ["99 problems in the backlog", "and the fix makes 100"],
  ["the final boss", "remembering which button is jump"],
  ["the dog heard a bag open", "national emergency declared"],
  ["I can cook", "the smoke alarm is my hype man"],
  ["you had me at", "want to leave this party early?"],
  ["available for opportunities", "unavailable for a 7am brainstorm"],
  ["my rubber duck debugger", "has requested annual leave"],
  ["side quest accepted", "main plot has filed a complaint"],
  ["cats invented boundaries", "then ignored everyone else’s"],
  ["girl dinner? boy dinner?", "cryptid standing at the fridge dinner"],
  ["my type is simple", "kind eyes. catastrophic bookmarks."],
  ["very productive morning", "renamed the to-do list"],
  ["I love open source", "especially the fridge"],
  ["we ride at dawn", "unless the update is still downloading"],
  ["local dog gets a compliment", "plans to think about it forever"],
  ["the recipe said serves four", "it has never met me"],
  ["they remembered my coffee order", "wedding committee activated"],
  ["out of office", "mentally beside a very specific pond"],
  ["the tutorial said easy", "the tutorial is no longer my friend"],
  ["gaming is relaxing", "I say, gripping the controller like a crab"],
  ["if not friend", "why friend-shaped?"],
  ["ordered a little something", "the table has structural concerns"],
  ["emotionally available", "socially buffering"],
  ["I have a work-life balance", "both are on airplane mode"],
  ["the semicolon was missing", "so was my entire afternoon"],
  ["a peaceful farming game", "I owe a raccoon my life savings"],
  ["the pet sitter sent one photo", "I will be making it my personality"],
  ["bread is a love language", "and I am extremely fluent"],
  ["date idea: parallel scrolling", "occasionally rotate phone to show meme"],
  ["circling back", "like a confused office pigeon"],
  ["finally deleted unused code", "it was the whole application"],
  ["my strategy is unpredictable", "because I do not have one"],
  ["just a little guy", "with a suspiciously large legal team"],
  ["the vegetables in my fridge", "have formed a support group"],
  ["romance is not dead", "it is just sending you a raccoon video"],
  ["please find attached", "my last remaining brain cell"],
  ["the build passed", "I have never trusted anything less"],
  ["achievement unlocked", "went outside during daylight"],
  ["my dog thinks I am amazing", "I will not correct the record"],
  ["I am saving room for dessert", "the room is an entire apartment"],
  ["waiting for their reply", "a short documentary in six seconds"],
  ["me leaving work on Friday", "all three brain cells clocking out"],
  ["watching the tests pass", "do not move. do not breathe."],
  ["loading my social battery", "estimated time: one more game"],
  ["the cat is buffering", "please hold all questions"],
  ["watching the microwave", "live entertainment for snack people"],
];

export const demoSpecs = jokes.map(([headline, punchline], index) => {
  const spec: MemeSpec = {
    tone: TONES[(index + Math.floor(index / 6)) % TONES.length],
    format: FORMATS[Math.floor(index / 6) % FORMATS.length],
    topics: [TOPICS[index % TOPICS.length]],
    chaos: (Math.floor(index / 3) % 5) + 1,
  };
  if (index % 4 === 3) spec.topics.push(TOPICS[(index + 2) % TOPICS.length]);
  return {
    ...spec,
    id: `meme-${String(index + 1).padStart(3, "0")}`,
    type: index < 60 ? ("image" as const) : ("video" as const),
    headline,
    punchline,
    tags: tagsFor(spec),
    caption: `${headline} - ${punchline}${index >= 60 ? " · silent animation" : ""}.`,
    prompt: buildPrompt(spec),
  };
});
