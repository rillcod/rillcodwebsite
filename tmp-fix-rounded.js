const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      filelist = walkSync(filePath, filelist);
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

  // More aggressive rounded- removal: any rounded-2xl, 3xl, [2rem], [2.5rem], [3rem]
  content = content.replace(/\b(sm:|md:|lg:|xl:|2xl:)?rounded-(2xl|3xl|\[.*?\])\b/g, 'rounded-none');
  
  // also bg-[#05050a] or bg-[#0f0f1a]
  content = content.replace(/bg-\[#05050a\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#0f0f1a\]/g, 'bg-[#121212]');

  content = content.replace(/(rounded-none\s*)+/g, 'rounded-none ');

  if (original !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated rounded again: ${filePath}`);
  }
}

const run = () => {
    const targetDirs = [
        "c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\app\\dashboard",
        "c:\\Users\\USER\\Downloads\\rillcod-academy-main\\rillcod-academy-main\\src\\components\\dashboard"
    ];
    targetDirs.forEach(dir => {
        const files = walkSync(dir);
        files.forEach(f => {
            if(!f.includes('node_modules')) fixFile(f);
        });
    });
}
run();
