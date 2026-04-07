const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// Fix flex justify-center clipping on scrollable breakdown panels
html = html.replace(/overflow-x-auto flex-grow flex items-center justify-center/g, 'overflow-x-auto flex-grow flex items-center md:justify-center');

fs.writeFileSync('index.html', html, 'utf8');
console.log("Fixed flex overflow clip");
