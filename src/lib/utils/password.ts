/**
 * Generates a readable random temp password: Word + 4 digits + symbol
 * Shared utility — used by student activation and school account creation
 */
export function generateTempPassword(): string {
    const words = ['Rillcod', 'Portal', 'Learn', 'Smart', 'Stem', 'Code', 'Robot'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const syms = ['#', '@', '!', '$'];
    const sym = syms[Math.floor(Math.random() * syms.length)];
    return `${word}${num}${sym}`;
}
