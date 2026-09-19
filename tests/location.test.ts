import assert from "node:assert/strict";
import { test } from "node:test";
import { locationWithinRadius } from "../features/matching/location";

test("identical locations match at any radius", () => {
  assert.equal(locationWithinRadius("Brooklyn", "brooklyn", 5), true);
});

test("metro neighbors match at 25 miles but not at 5", () => {
  assert.equal(locationWithinRadius("Brooklyn", "Manhattan", 25), true);
  assert.equal(locationWithinRadius("Brooklyn", "Manhattan", 5), false);
});

test("short metro aliases do not substring-match unrelated cities", () => {
  assert.equal(
    locationWithinRadius("Atlanta, GA", "Los Angeles, CA", 25),
    false,
  );
  assert.equal(
    locationWithinRadius("Dallas, TX", "Los Angeles, CA", 25),
    false,
  );
});

test("same state matches at 50 miles but not at 25", () => {
  assert.equal(locationWithinRadius("Buffalo, NY", "Albany, NY", 50), true);
  assert.equal(locationWithinRadius("Buffalo, NY", "Albany, NY", 25), false);
});

test("radius 100 accepts distant locations", () => {
  assert.equal(locationWithinRadius("Seattle, WA", "Miami, FL", 100), true);
});
