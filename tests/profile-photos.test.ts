import assert from "node:assert/strict";
import { before, test } from "node:test";

process.env.DATABASE_URL = ":memory:";
process.env.BETTER_AUTH_SECRET = "photo-validation-test-secret-not-for-deployment";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DEMO_MODE = "false";

let profileInput: typeof import("../features/profile/profile").profileInput;

before(async () => {
  ({ profileInput } = await import("../features/profile/profile"));
});

const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAG6B//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";

const baseProfile = {
  name: "Alex",
  dob: "1999-04-12",
  town: "Brooklyn",
  state: "New York",
  country: "United States",
  stateCode: "NY",
  countryCode: "US",
  matchLocation: "Brooklyn, NY",
  gender: "nonbinary",
  intent: "relationship",
  preferences: {
    genders: ["woman"],
    minAge: 21,
    maxAge: 40,
    radiusMiles: 25,
  },
  initialTags: ["absurd", "deadpan", "cursed"],
};

test("profile input accepts a small valid jpeg data url", () => {
  const parsed = profileInput.parse({ ...baseProfile, photos: [tinyJpeg] });
  assert.equal(parsed.photos.length, 1);
});

test("profile input rejects svg data urls", () => {
  assert.throws(() =>
    profileInput.parse({
      ...baseProfile,
      photos: ["data:image/svg+xml;base64,PHN2Zy8+"],
    }),
  );
});

test("profile input rejects oversized photo payloads", () => {
  const huge = `data:image/jpeg;base64,${"A".repeat(1_300_000)}`;
  assert.throws(() =>
    profileInput.parse({ ...baseProfile, photos: [huge] }),
  );
});
