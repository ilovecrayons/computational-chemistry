export function ageOn(dob: string, today = new Date()): number {
  const [year, month, day] = dob.split("-").map(Number);
  return (
    today.getUTCFullYear() -
    year -
    (today.getUTCMonth() + 1 < month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
      ? 1
      : 0)
  );
}
