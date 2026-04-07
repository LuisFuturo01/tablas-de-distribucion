const fs = require('fs');

let ts = fs.readFileSync('src/main.ts', 'utf8');

const replacementFunctions = `
function showInterpResult(resId: string, bdId: string, label: string, targetRow: number, rowLabel: string, result: ReturnType<typeof interpolateBetweenRows>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const { val, lo, hi, exact } = result;
    renderKaTeXInto(resEl, \`\${label} \\\\approx \${val.toFixed(4)}\`, false);
    
    if (exact) {
        renderKaTeXInto(bdEl, \`\\\\text{Valor exacto en tabla}\`, true);
    } else {
        let rawLabel = rowLabel;
        if(rawLabel === '\\\\nu_2') rawLabel = 'ν₂';
        if(rawLabel === '\\\\nu_1') rawLabel = 'ν₁';
        if(rawLabel === '\\\\alpha') rawLabel = 'α';

        const tableHtml = \`
            <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Desglose Regla de Tres Proporcional</p>
                <div class="overflow-x-auto w-full mb-4">
                    <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                        <thead class="bg-slate-100 dark:bg-slate-700">
                            <tr><th>Punto</th><th class="whitespace-nowrap">\${rawLabel}</th><th class="whitespace-nowrap">Resolución</th></tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-slate-100 dark:border-slate-700">
                                <td class="font-semibold text-slate-500">Ant.</td>
                                <td>\${lo.num}</td><td>\${lo.v.toFixed(4)}</td>
                            </tr>
                            <tr class="bg-indigo-50/50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400">
                                <td>Buscado</td>
                                <td>\${targetRow}</td><td>\${val.toFixed(4)}</td>
                            </tr>
                            <tr>
                                <td class="font-semibold text-slate-500">Sig.</td>
                                <td>\${hi.num}</td><td>\${hi.v.toFixed(4)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo con valores sustituidos</p>
                <div id="\${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
            </div>
        \`;
        bdEl.innerHTML = tableHtml;
        const formulaEl = document.getElementById(bdId + '_formula')!;
        renderKaTeXInto(formulaEl, \`\\\\begin{aligned} \${label} &= \${lo.v.toFixed(4)} + \\\\dfrac{\${targetRow} - \${lo.num}}{\${hi.num} - \${lo.num}} \\\\cdot (\${hi.v.toFixed(4)} - \${lo.v.toFixed(4)}) \\\\\\\\ &\\\\approx \${val.toFixed(4)} \\\\end{aligned}\`, true);
    }
}
`;

const invReplacementFunctions = `
function showInvInterpResult(resId: string, bdId: string, label: string, targetVal: number, result: ReturnType<typeof interpolateInverseRow>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const { val, lo, hi, exact, approxGl } = result;
    renderKaTeXInto(resEl, \`\${label} \\\\approx \${val.toPrecision(4)}\`, false);
    
    if (exact) {
        renderKaTeXInto(bdEl, \`\\\\text{Exacto en tabla para gl } \\\\approx \${approxGl}\`, true);
    } else {
        const tableHtml = \`
            <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-left">Desglose Regla de Tres</p>
                <div class="overflow-x-auto w-full mb-4">
                    <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                        <thead class="bg-slate-100 dark:bg-slate-700">
                            <tr><th>Punto</th><th class="whitespace-nowrap">Extremo</th><th class="whitespace-nowrap">Res</th></tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-slate-100 dark:border-slate-700">
                                <td class="font-semibold text-slate-500">Izq.</td>
                                <td>\${lo.v.toFixed(4)}</td><td>\${lo.a.toPrecision(4)}</td>
                            </tr>
                            <tr class="bg-teal-50/50 dark:bg-teal-900/20 font-semibold text-teal-700 dark:text-teal-400">
                                <td>Buscado</td>
                                <td>\${targetVal.toFixed(4)}</td><td>\${val.toPrecision(4)}</td>
                            </tr>
                            <tr>
                                <td class="font-semibold text-slate-500">Der.</td>
                                <td>\${hi.v.toFixed(4)}</td><td>\${hi.a.toPrecision(4)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo con valores sustituidos</p>
                <div id="\${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
            </div>
        \`;
        bdEl.innerHTML = tableHtml;
        const formulaEl = document.getElementById(bdId + '_formula')!;
        renderKaTeXInto(formulaEl, \`\\\\begin{aligned} \${label} &= \${lo.a.toPrecision(4)} + \\\\dfrac{\${targetVal.toFixed(4)} - \${lo.v.toFixed(4)}}{\${hi.v.toFixed(4)} - \${lo.v.toFixed(4)}} \\\\cdot (\${hi.a.toPrecision(4)} - \${lo.a.toPrecision(4)}) \\\\\\\\ &\\\\approx \${val.toPrecision(4)} \\\\end{aligned}\`, true);
    }
}
`;

// Extract before/after showInterpResult
const start1 = ts.indexOf('function showInterpResult');
const start1NextFun = ts.indexOf('function interpolateT', start1);

// Extract before/after showInvInterpResult
const start2 = ts.indexOf('function showInvInterpResult');
const start2NextFun = ts.indexOf('function interpolateTInverse', start2);

let modified = ts.slice(0, start1) + replacementFunctions + ts.slice(start1NextFun, start2) + invReplacementFunctions + ts.slice(start2NextFun);

fs.writeFileSync('src/main.ts', modified, 'utf8');
console.log("Main ts re-factor UI 5 complete");
