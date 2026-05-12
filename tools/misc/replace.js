const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const originalContent = content;
      
      content = content.replace(/from\s+["'](\.\.\/)+lib\/api["']/g, 'from "@ddup/shared/lib/api"');
      content = content.replace(/from\s+["'](\.\.\/)+contexts\/displayMode["']/g, 'from "@ddup/shared/contexts/displayMode"');
      content = content.replace(/from\s+["'](\.\.\/)+ui["']/g, 'from "@ddup/shared/ui"');
      content = content.replace(/from\s+["'](\.\.\/)+ui\/(.*?)["']/g, 'from "@ddup/shared/ui/$2"');
      content = content.replace(/import\s+["'](\.\.\/)+styles\/(.*?)["']/g, 'import "@ddup/shared/styles/$2"');
      
      content = content.replace(/from\s+["']\.\/lib\/api["']/g, 'from "@ddup/shared/lib/api"');
      content = content.replace(/from\s+["']\.\/contexts\/displayMode["']/g, 'from "@ddup/shared/contexts/displayMode"');
      content = content.replace(/from\s+["']\.\/ui["']/g, 'from "@ddup/shared/ui"');
      content = content.replace(/from\s+["']\.\/ui\/(.*?)["']/g, 'from "@ddup/shared/ui/$1"');
      content = content.replace(/import\s+["']\.\/styles\/(.*?)["']/g, 'import "@ddup/shared/styles/$1"');
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

replaceInDir('apps/pc/src');
replaceInDir('apps/mobile/src');
console.log('Done!');
