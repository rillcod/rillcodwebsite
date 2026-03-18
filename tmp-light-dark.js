const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  if (!fs.existsSync(dir)) return filelist;
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules')) {
        filelist = walkSync(filePath, filelist);
      }
    } else {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        filelist.push(filePath);
      }
    }
  });
  return filelist;
}

const fixFile = (filePath) => {
  let original = fs.readFileSync(filePath, 'utf8');
  let content = original;

  // Dictionary of replacements: { regex: replacement }
  // Using negative lookbehind (?<!dark:) to avoid double-prefixing
  const replacements = {
    '/(?<!dark:)bg-\\[#121212\\]/g': 'dark:bg-[#121212] bg-gray-50',
    '/(?<!dark:)bg-\\[#0f0f1a\\]/g': 'dark:bg-[#121212] bg-gray-50',
    '/(?<!dark:)bg-\\[#0a0a0a\\]/g': 'dark:bg-[#121212] bg-gray-50',
    '/(?<!dark:)bg-\\[#050a17\\]/g': 'dark:bg-[#121212] bg-gray-50',
    '/(?<!dark:)bg-\\[#0a0a1a\\]/g': 'dark:bg-[#121212] bg-gray-50',
    
    // backgrounds and borders
    '/(?<!dark:)bg-white\\/5\\b/g': 'dark:bg-white/5 bg-white shadow-sm',
    '/(?<!dark:)bg-white\\/10\\b/g': 'dark:bg-white/10 bg-gray-100',
    '/(?<!dark:)border-white\\/5\\b/g': 'dark:border-white/5 border-gray-200',
    '/(?<!dark:)border-white\\/10\\b/g': 'dark:border-white/10 border-gray-200',
    '/(?<!dark:)border-white\\/20\\b/g': 'dark:border-white/20 border-gray-300',
    
    // Text colors
    '/(?<!dark:)text-white\\b(?!\\/)/g': 'dark:text-white text-gray-900',
    '/(?<!dark:)text-white\\/20\\b/g': 'dark:text-white/20 text-gray-400',
    '/(?<!dark:)text-white\\/30\\b/g': 'dark:text-white/30 text-gray-500',
    '/(?<!dark:)text-white\\/40\\b/g': 'dark:text-white/40 text-gray-500',
    '/(?<!dark:)text-white\\/50\\b/g': 'dark:text-white/50 text-gray-600',
    '/(?<!dark:)text-white\\/60\\b/g': 'dark:text-white/60 text-gray-600',
    '/(?<!dark:)text-white\\/80\\b/g': 'dark:text-white/80 text-gray-800',
    
    // Gradients and accents
    '/(?<!dark:)text-orange-400\\b/g': 'dark:text-orange-400 text-orange-600',
    '/(?<!dark:)text-orange-300\\b/g': 'dark:text-orange-300 text-orange-600',
    '/(?<!dark:)text-orange-200\\b/g': 'dark:text-orange-200 text-orange-700',
    '/(?<!dark:)bg-orange-500\\/10\\b/g': 'dark:bg-orange-500/10 bg-orange-100',
    '/(?<!dark:)bg-orange-500\\/15\\b/g': 'dark:bg-orange-500/15 bg-orange-100',
    '/(?<!dark:)bg-orange-500\\/20\\b/g': 'dark:bg-orange-500/20 bg-orange-100 border dark:border-transparent border-orange-200',
  };

  for (const [pattern, replacement] of Object.entries(replacements)) {
    const rx = eval(pattern); // convert string to regex
    content = content.replace(rx, replacement);
  }

  // Also fix double spaces
  content = content.replace(/classN?a?m?e?="([^"]*?)"/g, (match, p1) => {
     return match.replace(p1, p1.replace(/\\s+/g, ' ').trim());
  });

  if (original !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated for dark/light mode: ${filePath}`);
  }
}

const run = () => {
    const targetDirs = [
        "c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\app\\dashboard",
        "c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\components\\dashboard",
        "c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\components\\layout"
    ];
    targetDirs.forEach(dir => {
        const files = walkSync(dir);
        files.forEach(f => {
            fixFile(f);
        });
    });
    
    // Also explicitly fix app/layout.tsx
    fixFile("c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\app\\layout.tsx");
}
run();
