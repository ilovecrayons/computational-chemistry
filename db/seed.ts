import { hashPassword } from "better-auth/crypto";
import { inArray, or } from "drizzle-orm";
import { db } from "./index";
import {
  accounts,
  blocks,
  matches,
  memes,
  messages,
  profileDecisions,
  profiles,
  reactions,
  reports,
  users,
} from "./schema";
import { config } from "../lib/config";
import { ApiFailure } from "../lib/api";
import { ensureDemoMedia } from "../lib/media/demo";
import type { Gender, Intent, Preferences } from "../lib/contracts";
import { coverageOrder } from "../features/memes/feed";
import { demoSpecs } from "../features/memes/taxonomy";
import { compatibility, loadTastes } from "../features/matching/engine";

export const DEMO_PASSWORD = "Memeant-demo-2026!";
const allGenders: Gender[] = ["woman", "man", "nonbinary"];
const profilePhoto = (slug: string, index: number) =>
  `/api/demo/profile-photo?persona=${encodeURIComponent(slug)}&photo=${index}`;
const profileLocations: Record<
  string,
  { town: string; state: string; stateCode: string }
> = {
  alex: { town: "Baltimore", state: "Maryland", stateCode: "MD" },
  jules: { town: "Towson", state: "Maryland", stateCode: "MD" },
  sam: { town: "Baltimore", state: "Maryland", stateCode: "MD" },
  river: { town: "Columbia", state: "Maryland", stateCode: "MD" },
  morgan: { town: "Annapolis", state: "Maryland", stateCode: "MD" },
  casey: { town: "Ellicott City", state: "Maryland", stateCode: "MD" },
  taylor: { town: "Glen Burnie", state: "Maryland", stateCode: "MD" },
  robin: { town: "Catonsville", state: "Maryland", stateCode: "MD" },
  avery: { town: "Dundalk", state: "Maryland", stateCode: "MD" },
  quinn: { town: "Laurel", state: "Maryland", stateCode: "MD" },
  jamie: { town: "Frederick", state: "Maryland", stateCode: "MD" },
  drew: {
    town: "Washington",
    state: "District of Columbia",
    stateCode: "DC",
  },
  reese: { town: "Alexandria", state: "Virginia", stateCode: "VA" },
  blair: { town: "London", state: "England", stateCode: "ENG" },
  devon: { town: "Manchester", state: "England", stateCode: "ENG" },
  sky: { town: "Melbourne", state: "Victoria", stateCode: "VIC" },
  rowan: { town: "Sydney", state: "New South Wales", stateCode: "NSW" },
  ellis: { town: "Brisbane", state: "Queensland", stateCode: "QLD" },
  harper: { town: "Baltimore", state: "Maryland", stateCode: "MD" },
  micah: { town: "Glen Burnie", state: "Maryland", stateCode: "MD" },
  sloane: { town: "Catonsville", state: "Maryland", stateCode: "MD" },
  cameron: { town: "Dundalk", state: "Maryland", stateCode: "MD" },
  parker: { town: "Laurel", state: "Maryland", stateCode: "MD" },
  jordan: { town: "Baltimore", state: "Maryland", stateCode: "MD" },
  riley: { town: "Washington", state: "District of Columbia", stateCode: "DC" },
  theo: { town: "Baltimore", state: "Maryland", stateCode: "MD" },
  nia: { town: "Towson", state: "Maryland", stateCode: "MD" },
  wren: { town: "Columbia", state: "Maryland", stateCode: "MD" },
  leo: { town: "Annapolis", state: "Maryland", stateCode: "MD" },
  mina: { town: "Edinburgh", state: "Scotland", stateCode: "SCT" },
};
const profileCountries: Record<
  string,
  { country: string; countryCode: "US" | "CA" | "GB" | "AU" }
> = {
  blair: { country: "United Kingdom", countryCode: "GB" },
  devon: { country: "United Kingdom", countryCode: "GB" },
  mina: { country: "United Kingdom", countryCode: "GB" },
  sky: { country: "Australia", countryCode: "AU" },
  rowan: { country: "Australia", countryCode: "AU" },
  ellis: { country: "Australia", countryCode: "AU" },
};
const profileNames: Record<string, string> = {
  alex: "Alex Morgan",
  jules: "Jules Bennett",
  sam: "Sam Rivera",
  river: "River Brooks",
  morgan: "Morgan Ellis",
  casey: "Casey Nguyen",
  taylor: "Taylor Reed",
  robin: "Robin Carter",
  avery: "Avery Thompson",
  quinn: "Quinn Parker",
  jamie: "Jamie Chen",
  drew: "Drew Sullivan",
  reese: "Reese Patel",
  blair: "Blair Wilson",
  devon: "Devon Harris",
  sky: "Sky Anderson",
  rowan: "Rowan Mitchell",
  ellis: "Ellis Martin",
  harper: "Harper Collins",
  micah: "Micah Foster",
  sloane: "Sloane Cooper",
  cameron: "Cameron Bailey",
  parker: "Parker Brooks",
  jordan: "Jordan Davis",
  riley: "Riley Morgan",
  theo: "Theo Walker",
  nia: "Nia Johnson",
  wren: "Wren Taylor",
  leo: "Leo Scott",
  mina: "Mina Campbell",
};
export const demoPersonas = [
  {
    slug: "alex",
    name: "Alex",
    gender: "man",
    dob: "1999-04-12",
    bio: "Here for a good laugh and someone to split the last fries with.",
    favorites: ["absurd", "deadpan", "dating"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "jules",
    name: "Jules",
    gender: "nonbinary",
    dob: "1998-08-22",
    bio: "My love language is a suspiciously specific meme at 2pm. I make excellent bad playlists.",
    favorites: ["absurd", "deadpan", "dating"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "sam",
    name: "Sam",
    gender: "woman",
    dob: "1997-02-03",
    bio: "Tiny dogs, ambitious houseplants, and a camera roll full of deeply unserious things.",
    favorites: ["wholesome", "pets", "starter pack"],
    genders: ["woman"],
    intent: "relationship",
  },
  {
    slug: "river",
    name: "River",
    gender: "man",
    dob: "1996-11-19",
    bio: "Will overthink a joke and underthink a camping trip. Usually carrying snacks.",
    favorites: ["dark", "gaming", "deep-fried"],
    genders: allGenders,
    intent: "figuring-it-out",
  },
  {
    slug: "morgan",
    name: "Morgan",
    gender: "woman",
    dob: "1995-06-08",
    bio: "Weekend baker. Weekday spreadsheet enthusiast. Strong opinions about fictional pigeons.",
    favorites: ["deadpan", "work", "fake screenshot"],
    genders: ["man", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "casey",
    name: "Casey",
    gender: "nonbinary",
    dob: "2000-01-15",
    bio: "I fix bugs for a living and invent new problems for fun. Ask me about my keyboard.",
    favorites: ["cursed", "coding", "POV"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "taylor",
    name: "Taylor",
    gender: "woman",
    dob: "1998-09-09",
    bio: "Good coffee, terrible puns, and one very photogenic rescue dog. Looking for my picnic person.",
    favorites: ["wholesome", "pets", "starter pack"],
    genders: ["woman", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "robin",
    name: "Robin",
    gender: "man",
    dob: "1994-03-26",
    bio: "A board game can be a date if we agree not to take the rules personally.",
    favorites: ["cringe", "gaming", "reaction"],
    genders: ["man", "nonbinary"],
    intent: "figuring-it-out",
  },
  {
    slug: "avery",
    name: "Avery",
    gender: "nonbinary",
    dob: "2001-07-17",
    bio: "Chronically early to gigs. Chronically late to understanding the group chat.",
    favorites: ["absurd", "food", "deep-fried"],
    genders: ["woman", "man"],
    intent: "casual",
  },
  {
    slug: "quinn",
    name: "Quinn",
    gender: "woman",
    dob: "1993-12-04",
    bio: "Museum dates and feral little jokes. I will remember how you take your tea.",
    favorites: ["dark", "dating", "fake screenshot"],
    genders: ["man"],
    intent: "relationship",
  },
  {
    slug: "jamie",
    name: "Jamie",
    gender: "woman",
    dob: "1997-05-18",
    bio: "I collect oddly specific playlists and know the best late-night dumplings.",
    favorites: ["coding", "deadpan", "work"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "drew",
    name: "Drew",
    gender: "man",
    dob: "1996-10-27",
    bio: "Equal parts museum wanderer, amateur chef, and professional group-chat lurker.",
    favorites: ["food", "wholesome", "fake screenshot"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "reese",
    name: "Reese",
    gender: "nonbinary",
    dob: "1999-01-30",
    bio: "Here for tiny adventures, big snacks, and jokes that need a footnote.",
    favorites: ["absurd", "pets", "POV"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "blair",
    name: "Blair",
    gender: "woman",
    dob: "1994-07-11",
    bio: "Will defend a bad pun with the confidence of someone who brought receipts.",
    favorites: ["cringe", "dating", "reaction"],
    genders: allGenders,
    intent: "figuring-it-out",
  },
  {
    slug: "devon",
    name: "Devon",
    gender: "man",
    dob: "2000-03-22",
    bio: "A walking snack recommendation with strong opinions about fictional villains.",
    favorites: ["dark", "gaming", "deep-fried"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "sky",
    name: "Sky",
    gender: "nonbinary",
    dob: "1998-12-16",
    bio: "I make excellent coffee and questionable decisions about buying houseplants.",
    favorites: ["wholesome", "pets", "work"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "rowan",
    name: "Rowan",
    gender: "woman",
    dob: "1995-09-02",
    bio: "Museum dates, chaotic baking projects, and a very serious frog ranking.",
    favorites: ["food", "cursed", "starter pack"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "ellis",
    name: "Ellis",
    gender: "man",
    dob: "1993-06-24",
    bio: "Quietly competitive at board games. Loudly enthusiastic about breakfast.",
    favorites: ["gaming", "deep-fried", "reaction"],
    genders: allGenders,
    intent: "figuring-it-out",
  },
  {
    slug: "harper",
    name: "Harper",
    gender: "woman",
    dob: "1996-04-28",
    bio: "I know a suspicious number of neighborhood bakeries and exactly three good karaoke songs.",
    favorites: ["food", "reaction", "work"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "micah",
    name: "Micah",
    gender: "man",
    dob: "1998-02-14",
    bio: "Film camera hobbyist, reluctant morning person, and dedicated finder of the best fries.",
    favorites: ["dating", "deadpan", "fake screenshot"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "sloane",
    name: "Sloane",
    gender: "woman",
    dob: "1992-10-06",
    bio: "I will bring a book to the beach and then spend four hours people-watching instead.",
    favorites: ["dark", "work", "wholesome"],
    genders: ["man", "nonbinary"],
    intent: "figuring-it-out",
  },
  {
    slug: "cameron",
    name: "Cameron",
    gender: "nonbinary",
    dob: "1997-08-31",
    bio: "Weekend climber, weekday spreadsheet gremlin, full-time collector of niche references.",
    favorites: ["gaming", "coding", "POV"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "parker",
    name: "Parker",
    gender: "man",
    dob: "1995-01-21",
    bio: "Making a respectable attempt at cooking through one cookbook and failing charmingly.",
    favorites: ["food", "cursed", "starter pack"],
    genders: ["woman", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "jordan",
    name: "Jordan",
    gender: "woman",
    dob: "1999-11-02",
    bio: "Will send you a three-minute voice note about a dog I saw on the train.",
    favorites: ["pets", "wholesome", "reaction"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "riley",
    name: "Riley",
    gender: "nonbinary",
    dob: "1994-05-16",
    bio: "Museum member, amateur gardener, and undefeated champion of making plans in the group chat.",
    favorites: ["dating", "pets", "work"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "theo",
    name: "Theo",
    gender: "man",
    dob: "1991-09-13",
    bio: "I make excellent pancakes and questionable guesses in pub trivia.",
    favorites: ["gaming", "food", "cringe"],
    genders: ["woman", "man", "nonbinary"],
    intent: "figuring-it-out",
  },
  {
    slug: "nia",
    name: "Nia",
    gender: "woman",
    dob: "1998-06-25",
    bio: "Plant parent with a camera roll full of sunsets, snacks, and screenshots I refuse to delete.",
    favorites: ["wholesome", "fake screenshot", "starter pack"],
    genders: allGenders,
    intent: "relationship",
  },
  {
    slug: "wren",
    name: "Wren",
    gender: "nonbinary",
    dob: "1996-12-08",
    bio: "I like long walks, short emails, and jokes that get funnier when you explain them badly.",
    favorites: ["deadpan", "dark", "reaction"],
    genders: allGenders,
    intent: "casual",
  },
  {
    slug: "leo",
    name: "Leo",
    gender: "man",
    dob: "2000-08-19",
    bio: "Part-time drummer, full-time snack planner. I have strong opinions about movie trailers.",
    favorites: ["deep-fried", "gaming", "absurd"],
    genders: ["woman", "nonbinary"],
    intent: "relationship",
  },
  {
    slug: "mina",
    name: "Mina",
    gender: "woman",
    dob: "1993-03-11",
    bio: "Always down for a bookstore date, a tiny road trip, or a very serious ranking of dumplings.",
    favorites: ["food", "dating", "deadpan"],
    genders: allGenders,
    intent: "relationship",
  },
].map((person) => ({
  ...person,
  name: profileNames[person.slug] ?? person.name,
  id: `demo-${person.slug}`,
  email: `${person.slug}@demo.local`,
  photo: profilePhoto(person.slug, 0),
  photos: Array.from({ length: 10 }, (_, index) =>
    profilePhoto(person.slug, index),
  ),
}));
export async function seedDemo(): Promise<void> {
  if (!config.demoMode)
    throw new ApiFailure(
      403,
      "DEMO_DISABLED",
      "Set DEMO_MODE=true to seed fictional demo identities.",
    );
  await ensureDemoMedia();
  const password = await hashPassword(DEMO_PASSWORD);
  const ids = demoPersonas.map((person) => person.id);
  const now = new Date("2026-09-01T12:00:00.000Z");
  const firstFifteen = coverageOrder(db.select().from(memes).all())
    .filter((meme) => meme.status === "ready" && meme.assetPath)
    .slice(0, 15);
  db.transaction((tx) => {
    // Keep auth sessions and all meme rows/files. Only the fictional personas' state resets.
    tx.delete(matches)
      .where(or(inArray(matches.userA, ids), inArray(matches.userB, ids)))
      .run();
    tx.delete(profileDecisions)
      .where(
        or(
          inArray(profileDecisions.actorId, ids),
          inArray(profileDecisions.targetId, ids),
        ),
      )
      .run();
    tx.delete(blocks)
      .where(or(inArray(blocks.actorId, ids), inArray(blocks.targetId, ids)))
      .run();
    tx.delete(reports)
      .where(or(inArray(reports.actorId, ids), inArray(reports.targetId, ids)))
      .run();
    tx.delete(reactions).where(inArray(reactions.userId, ids)).run();
    for (const person of demoPersonas) {
      const identity = {
        id: person.id,
        name: person.name,
        email: person.email,
        image: null,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(users)
        .values(identity)
        .onConflictDoUpdate({
          target: users.id,
          set: { name: person.name, image: null, updatedAt: now },
        })
        .run();
      tx.insert(accounts)
        .values({
          id: `account-${person.id}`,
          userId: person.id,
          accountId: person.id,
          providerId: "credential",
          password,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accounts.id,
          set: { password, updatedAt: now },
        })
        .run();
      const preferences: Preferences = {
        genders: person.genders as Gender[],
        minAge: 21,
        maxAge: 38,
        radiusMiles: 25,
        minMatchPercent: 0,
      };
      const location = profileLocations[person.slug] ?? {
        town: "Brooklyn",
        state: "New York",
        stateCode: "NY",
      };
      const country = profileCountries[person.slug] ?? {
        country: "United States",
        countryCode: "US" as const,
      };
      const profile = {
        userId: person.id,
        name: person.name,
        dob: person.dob,
        bio: person.bio,
        location: `${location.town}, ${location.stateCode}`,
        town: location.town,
        state: location.state,
        country: country.country,
        stateCode: location.stateCode,
        countryCode: country.countryCode,
        matchLocation: `${location.town}, ${location.state}, ${country.country}`,
        gender: person.gender as Gender,
        photo: person.photo,
        photos: person.photos,
        favoriteMemes: [],
        interests: person.favorites.slice(0, 3),
        intent: person.intent as Intent,
        preferences,
        initialTags: ["absurd", "deadpan", "cursed"],
        complete: person.slug !== "alex",
        updatedAt: now,
      };
      tx.insert(profiles)
        .values(profile)
        .onConflictDoUpdate({ target: profiles.userId, set: profile })
        .run();
      if (person.slug === "alex") continue;
      // Keep focused primary-topic tastes: broad OR favorites make every tag universal and erase IDF signal.
      const positives =
        person.slug === "jules"
          ? firstFifteen
          : demoSpecs
              .filter((meme) => person.favorites.includes(meme.topics[0]))
              .sort(
                (a, b) =>
                  person.favorites.filter((tag) => tag in b.tags).length -
                    person.favorites.filter((tag) => tag in a.tags).length ||
                  a.id.localeCompare(b.id),
              );
      const likedIds = new Set(positives.map((meme) => meme.id));
      const ranking = [
        ...positives,
        ...demoSpecs.filter((meme) => !likedIds.has(meme.id)),
      ];
      for (const [index, meme] of ranking.slice(0, 30).entries()) {
        const reaction = likedIds.has(meme.id)
          ? person.slug !== "jules" && index < 5
            ? ("strong-like" as const)
            : ("like" as const)
          : ("pass" as const);
        tx.insert(reactions)
          .values({
            userId: person.id,
            memeId: meme.id,
            reaction,
            createdAt: new Date(now.valueOf() + index),
            updatedAt: now,
          })
          .run();
      }
    }
    tx.insert(profileDecisions)
      .values({
        actorId: "demo-jules",
        targetId: "demo-alex",
        decision: "like",
        createdAt: now,
      })
      .run();
    tx.insert(profileDecisions)
      .values([
        {
          actorId: "demo-sam",
          targetId: "demo-taylor",
          decision: "like",
          createdAt: now,
        },
        {
          actorId: "demo-taylor",
          targetId: "demo-sam",
          decision: "like",
          createdAt: now,
        },
      ])
      .run();
    const { tastes, library } = loadTastes();
    const explanation = compatibility(
      tastes.get("demo-sam"),
      tastes.get("demo-taylor"),
      library,
    );
    tx.insert(matches)
      .values({
        id: "demo-match-sam-taylor",
        userA: "demo-sam",
        userB: "demo-taylor",
        compatibility: explanation,
        createdAt: now,
      })
      .run();
    tx.insert(messages)
      .values([
        {
          id: "demo-message-001",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-sam",
          body: "Explain why this destroyed both of us.",
          memeId: explanation.sharedMemes[0]?.id ?? null,
          createdAt: new Date(now.valueOf() + 60_000),
        },
        {
          id: "demo-message-002",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-taylor",
          body: "It is the absolute confidence. Zero qualifications, all commitment.",
          createdAt: new Date(now.valueOf() + 120_000),
        },
        {
          id: "demo-message-003",
          matchId: "demo-match-sam-taylor",
          senderId: "demo-sam",
          body: "Exactly my approach to making pancakes. Coffee this weekend?",
          createdAt: new Date(now.valueOf() + 180_000),
        },
      ])
      .run();
  });
}
