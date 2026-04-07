const fs = require('fs');

let ts = fs.readFileSync('src/main.ts', 'utf8');

const tsoOpen = `
function openPropsDrawer(): void {
    const overlay = document.getElementById('propsOverlay')!;
    const drawer = document.getElementById('propsDrawer')!;
    const title = document.getElementById('propsDrawerTitle')!;
    const content = document.getElementById('propsDrawerContent')!;
    
    // Switch Tailwind Classes
    overlay.classList.remove('hidden');
    drawer.classList.remove('hidden');
    
    requestAnimationFrame(() => { 
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
    });

    const type = currentTable.meta?.type || 'normal';
    title.textContent = \`Propiedades — \${currentTable.name}\`;
    content.innerHTML = getPropsContent(type);
    setTimeout(() => {
        const k = getKatex();
        if (k) {
            content.querySelectorAll('.props-formula').forEach(el => {
                const tex = el.getAttribute('data-tex');
                if (tex) try { k.render(tex, el as HTMLElement, { displayMode: true, throwOnError: false }); } catch { /* */ }
            });
        }
    }, 50);
}

function closePropsDrawer(): void {
    const overlay = document.getElementById('propsOverlay')!;
    const drawer = document.getElementById('propsDrawer')!;
    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    drawer.classList.remove('translate-x-0');
    drawer.classList.add('translate-x-full');
    setTimeout(() => { 
        overlay.classList.add('hidden'); 
        drawer.classList.add('hidden'); 
    }, 350);
}
`;

// Extract before/after openPropsDrawer & closePropsDrawer
const startIdx = ts.indexOf('function openPropsDrawer');
const endIdx = ts.indexOf('function sec(t: string', startIdx);

ts = ts.slice(0, startIdx) + tsoOpen + '\n' + ts.slice(endIdx);
fs.writeFileSync('src/main.ts', ts, 'utf8');
console.log('Fixed drawer via Tailwind classes');
