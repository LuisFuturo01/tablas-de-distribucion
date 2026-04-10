const fs = require('fs');

const content = fs.readFileSync('src/main.ts', 'utf8');
const regex = /^function\s+([a-zA-Z0-9_]+)\s*\(/gm;

let match;
const counts = {};

while ((match = regex.exec(content)) !== null) {
    const fnName = match[1];
    counts[fnName] = (counts[fnName] || 0) + 1;
}

const duplicates = Object.entries(counts).filter(([name, count]) => count > 1);

if (duplicates.length === 0) {
    console.log("No duplicate functions found defined with 'function'.");
} else {
    console.log("Duplicate functions:");
    duplicates.forEach(([name, count]) => console.log(`${name}: ${count} times`));
}
