const fs = require('fs');

let ts = fs.readFileSync('src/main.ts', 'utf8');

ts = ts.replace(
    'type KatexApi = {\n    render: (tex: string, el: HTMLElement, opts: { displayMode?: boolean; throwOnError?: boolean }) => void;\n};',
    'type KatexApi = {\n    render: (tex: string, el: HTMLElement, opts: { displayMode?: boolean; throwOnError?: boolean }) => void;\n    renderToString?: (tex: string, opts: { displayMode?: boolean; throwOnError?: boolean }) => string;\n};'
);

fs.writeFileSync('src/main.ts', ts, 'utf8');
console.log('Fixed KatexApi TS Type');
