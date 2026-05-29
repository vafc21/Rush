const ADJECTIVES = [
  "moon", "vortex", "neon", "shadow", "rapid", "frost", "cyber", "lunar",
  "stellar", "phantom", "rogue", "ghost", "pixel", "turbo", "atomic", "void",
  "silent", "wired", "static", "nova", "hyper", "echo", "fizz", "zen",
];

const NOUNS = [
  "dancer", "fox", "wolf", "kid", "ace", "spark", "blitz", "raven",
  "byte", "drift", "wave", "tide", "node", "lynx", "ren", "fang",
  "shark", "vibe", "ember", "halo", "joker", "pulse", "wave", "blade",
];

function leetify(s: string): string {
  return s
    .replace(/o/g, () => (Math.random() < 0.4 ? "0" : "o"))
    .replace(/i/g, () => (Math.random() < 0.3 ? "1" : "i"))
    .replace(/e/g, () => (Math.random() < 0.2 ? "3" : "e"));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateNickname(): string {
  const r = Math.random();
  let raw: string;
  if (r < 0.4) {
    raw = `${pick(ADJECTIVES)}${pick(NOUNS)}`;
  } else if (r < 0.7) {
    raw = pick(NOUNS);
  } else if (r < 0.9) {
    raw = `${pick(ADJECTIVES)}_${pick(NOUNS)}`;
  } else {
    raw = `${pick(NOUNS)}${Math.floor(Math.random() * 100)}`;
  }
  return leetify(raw).slice(0, 20);
}

export function isPlausibleNickname(n: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(n);
}
