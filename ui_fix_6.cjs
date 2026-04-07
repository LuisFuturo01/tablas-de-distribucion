const fs = require('fs');

// 1. Fix Lightbox Width
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/max-w-\[90vw\] max-h-\[90vh\] object-contain m-auto/g, 'w-[70vw] h-auto object-contain m-auto');
fs.writeFileSync('index.html', html, 'utf8');

// 2. Fix Drawer CSS
let css = fs.readFileSync('src/style.css', 'utf8');
if (!css.includes('#propsOverlay.active')) {
    css += `\n
/* Properties Drawer Animations */
#propsOverlay.active {
    opacity: 1;
}
#propsDrawer.active {
    transform: translateX(0);
}
`;
    fs.writeFileSync('src/style.css', css, 'utf8');
}
console.log('Fixed Drawer CSS and Lightbox Width');
