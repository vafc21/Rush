const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, no 1/I

export function generateLobbyCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isLobbyCode(input: string): boolean {
  const norm = input.toUpperCase();
  if (norm.length !== 6) return false;
  for (const ch of norm) if (!ALPHABET.includes(ch)) return false;
  return true;
}
