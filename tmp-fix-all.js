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

  // Background colors
  content = content.replace(/bg-\[#050a17\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#0a0a1a\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#0a0a20\]/g, 'bg-[#121212]');
  content = content.replace(/bg-gradient-to-r from-\[#0B132B\] to-\[#1a2b54\]/g, 'bg-[#121212] border border-white/5 rounded-none sm:rounded-none');
  content = content.replace(/bg-\[#0B132B\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#0a0a0a\]/g, 'bg-[#121212]');
  content = content.replace(/bg-white\/[0-9]+/g, (match) => match); // keep standard white opacities

  // Rounded corners: we want to replace common rounded- classes with rounded-none, but BE CAREFUL not to replace rounded-full
  // We'll replace rounded-xl, 2xl, 3xl, lg, md, [2.5rem], [2rem].
  // Then we clean up duplicated rounded-none.
  
  const roundingRegex = /\b(sm:md:lg:xl:2xl:3xl:)?rounded-(2?3?xl|lg|md|sm|xl|2xl|3xl|\[2\.5rem\]|\[2rem\])\b/g;
  content = content.replace(roundingRegex, 'rounded-none');
  
  content = content.replace(/(?:rounded-none\s*|sm:rounded-none\s*)+/g, 'rounded-none ');

  // Colors: convert violet/blue to orange (Charcoal Gray theme + orange accents)
  content = content.replace(/violet/g, 'orange'); 
  // Wait, sometimes "blue" is used in status (e.g., student vs admin icons). I'll leave blue alone unless it's a primary CTA. 
  // We'll do a simple swap for gradients:
  content = content.replace(/from-blue-\d+|to-blue-\d+/g, 'from-orange-600 to-orange-400');
  content = content.replace(/from-emerald-\d+|to-emerald-\d+/g, 'from-orange-600 to-orange-400');
  content = content.replace(/from-amber-\d+|to-amber-\d+/g, 'from-orange-600 to-orange-400');
  content = content.replace(/from-cyan-\d+|to-cyan-\d+/g, 'from-orange-600 to-orange-400');
  // keep rose for errors, but replace backgrounds? Nah, keep rose gradients maybe. 

  // Fix text colors
  content = content.replace(/text-blue-300/g, 'text-orange-300');
  content = content.replace(/text-blue-200/g, 'text-orange-200');

  // Some cleanup of multiple spaces inside classNames
  content = content.replace(/classN?a?m?e?="([^"]*?)"/g, (match, p1) => {
     let clean = p1.replace(/\s+/g, ' ').trim();
     return match.replace(p1, clean);
  });
  
  // also fix double rounded-none
  content = content.replace(/(rounded-none\s*)+/g, 'rounded-none ');

  if (original !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
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
            // avoid node_modules etc just in case
            if(!f.includes('node_modules')) {
               fixFile(f);
            }
        });
    });
}

run();
