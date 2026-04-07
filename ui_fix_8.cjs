const fs = require('fs');

let ts = fs.readFileSync('src/main.ts', 'utf8');

const tsoFuncs = `
function sec(t: string, b: string): string { return \`<div class="props-section mb-6"> <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-2 border-b border-slate-200 dark:border-slate-700 pb-1">📐 \${t}</h4> <div class="overflow-x-auto w-full whitespace-normal break-words sm:break-normal">\${b}</div> </div>\`; }

function fm(tex: string): string { return \`<div class="props-formula py-2 text-center overflow-x-auto" data-tex="\${tex.replace(/"/g, '&quot;')}"></div>\`; }

function li(items: string[]): string { 
    return \`<ul class="props-list list-disc pl-5 space-y-2 text-sm">\` + items.map(i => {
        let text = i;
        const k = getKatex();
        if (k && k.renderToString) {
            text = text.replace(/\\$(.*?)\\$/g, (match, tex) => {
                try {
                    return k.renderToString(tex, { displayMode: false, throwOnError: false });
                } catch {
                    return match;
                }
            });
        }
        return \`<li class="break-words whitespace-normal">\` + text + \`</li>\`;
    }).join('') + \`</ul>\`;
}
`;

const startIdx = ts.indexOf('function sec(t: string');
const endIdx = ts.indexOf('function getPropsContent(', startIdx);

ts = ts.slice(0, startIdx) + tsoFuncs + '\n' + ts.slice(endIdx);
fs.writeFileSync('src/main.ts', ts, 'utf8');

console.log('Fixed Drawer HTML overflow and inline katex rendering.');
