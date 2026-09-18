import { transliterate } from 'transliteration';
import type { IdentifierTransliterator } from '../application/naming.js';

export class AsciiTransliterator implements IdentifierTransliterator {
  ascii(identifier: string): string {
    // Only transliterate letters. Keep punctuation for the normalizer to turn
    // into separators, rather than accepting a library's symbol expansions.
    return Array.from(identifier, (character) => {
      if (/\p{ASCII}/u.test(character)) return character;
      if (/\p{L}|\p{N}/u.test(character)) {
        return transliterate(character.normalize('NFKD').replace(/\p{M}/gu, ''), { unknown: '' });
      }
      return /\p{P}|\p{S}|\p{Z}/u.test(character) ? ' ' : '';
    }).join('');
  }
}
