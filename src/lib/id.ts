const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
// Largest multiple of 36 below 256; bytes above it are discarded so every character is equally likely.
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

/** Random note id. The id is the only key to an unlocked note, so keep it long. */
export function createNoteId(length = 10): string {
  let id = "";
  const bytes = new Uint8Array(length * 2);
  while (id.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_LIMIT) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}
