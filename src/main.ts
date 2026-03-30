import type { DistTable } from './types';

// 1. Carga Dinámica Multiproyecto usando import.meta.glob (Eager Loading)
const modules: Record<string, any> = import.meta.glob('./data/*.ts', { eager: true });
const tables: Record<string, DistTable> = {};

Object.keys(modules).forEach((key) => {
    const mod = modules[key];
    const tableObj = Object.values(mod).find(val => (val as DistTable)?.name) as DistTable;
    if (tableObj) {
        tables[key] = tableObj;
    }
});

let currentTable: DistTable;

document.addEventListener('DOMContentLoaded', () => {
    const tableSelector = document.getElementById('tableSelector') as HTMLSelectElement;
    tableSelector.innerHTML = '';
    
    // Poblar Selector
    Object.keys(tables).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = tables[key].name;
        tableSelector.appendChild(option);
    });

    // Cargar primera tabla disponible (Por defecto Normal)
    const firstKey = Object.keys(tables)[0];
    if (firstKey) {
        loadTableData(tables[firstKey]);
        tableSelector.value = firstKey;
    }

    // Evento de cambio de distribución
    tableSelector.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        if(tables[val]) loadTableData(tables[val]);
    });

    setupEvents();
});

function loadTableData(table: DistTable) {
    currentTable = table;
    
    document.getElementById('tableTitle')!.textContent = currentTable.name;
    document.getElementById('tableDesc')!.textContent = currentTable.description;
    
    const img1 = document.getElementById('img1') as HTMLImageElement;
    const img2 = document.getElementById('img2') as HTMLImageElement;
    if (currentTable.images && currentTable.images.length >= 2) {
        img1.src = currentTable.images[0];
        img2.src = currentTable.images[1];
    }
    
    renderTable();
    hideBreakdowns();

    // Re-render KaTeX text elements
    setTimeout(() => {
        if ((window as any).renderMathInElement) {
            (window as any).renderMathInElement(document.getElementById('tableDesc')!, {
                delimiters: [{left: "$", right: "$", display: false}]
            });
        }
    }, 50);
}

function renderTable() {
    const theadL = document.getElementById('tableHeaderRowLeft')!;
    const tbodyL = document.getElementById('tableBodyLeft')!;
    const theadR = document.getElementById('tableHeaderRowRight')!;
    const tbodyR = document.getElementById('tableBodyRight')!;

    // Limpiar restos HTML
    theadL.innerHTML = ''; tbodyL.innerHTML = '';
    theadR.innerHTML = ''; tbodyR.innerHTML = '';

    const thLBlank = document.createElement('th');
    thLBlank.className = "p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-600 font-bold";
    thLBlank.textContent = "Z";
    theadL.appendChild(thLBlank);

    const thRBlank = document.createElement('th');
    thRBlank.className = "p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-600 font-bold";
    thRBlank.textContent = "Z";
    theadR.appendChild(thRBlank);

    for(let i = 0; i < 10; i++) {
        const thL = document.createElement('th'); thL.className = "p-2 font-semibold text-slate-700 dark:text-slate-300"; thL.textContent = `.0${i}`;
        theadL.appendChild(thL);

        const thR = document.createElement('th'); thR.className = "p-2 font-semibold text-slate-700 dark:text-slate-300"; thR.textContent = `.0${i}`;
        theadR.appendChild(thR);
    }

    const keys = Object.keys(currentTable.rowData).sort((a, b) => parseFloat(a) - parseFloat(b));
    keys.forEach(z => {
        const row = document.createElement('tr');
        
        const thZ = document.createElement('th');
        thZ.className = "p-1 sm:p-2 font-bold bg-slate-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-600 z-10 sticky left-0 text-slate-800 dark:text-slate-100";
        thZ.textContent = z;
        row.appendChild(thZ);

        currentTable.rowData[z].forEach((val, idx) => {
            const td = document.createElement('td');
            td.className = "p-1 tracking-tight font-mono transition-colors text-slate-800 dark:text-slate-300";
            td.dataset.col = idx.toString();
            td.textContent = val;
            row.appendChild(td);
        });

        if (z.startsWith('-')) {
            tbodyL.appendChild(row);
        } else {
            tbodyR.appendChild(row);
        }
    });
}

function hideBreakdowns() {
    document.getElementById('panelBreakdownP')!.classList.add('hidden');
    document.getElementById('panelBreakdownZ')!.classList.add('hidden');
    document.getElementById('resP')!.textContent = "--";
    document.getElementById('resZ')!.textContent = "--";
}

function getProbMatrix(zStr: string, colIdx: number): number | null {
    if(!currentTable.rowData[zStr]) return null;
    return parseFloat(currentTable.rowData[zStr][colIdx]);
}

function getPoint(z: number): number | null {
    z = Math.round(z * 100) / 100; 
    const isNegative = z < 0 || Object.is(z, -0);
    const absZ = Math.abs(z);
    
    const rowBase = Math.floor(absZ * 10) / 10;
    const colBase = Math.round((absZ - rowBase) * 100);
    
    let rowKey = isNegative && rowBase === 0 ? "-0.0" : isNegative ? "-" + rowBase.toFixed(1) : rowBase.toFixed(1);
    
    if(!rowKey.includes(".")) rowKey += ".0";
    
    return getProbMatrix(rowKey, colBase);
}

// ----------------- interpolaciones -----------------

function showBreakdownP(z0: number, p0: number, z: number, p: number, z1: number, p1: number) {
    const panel = document.getElementById('panelBreakdownP')!;
    panel.classList.remove('hidden');
    
    document.getElementById('pBreakdownBody')!.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td>Valor Menor $(Z_0)$</td><td class="font-mono">${z0.toFixed(2)}</td><td class="font-mono">${p0.toFixed(4)}</td></tr>
        <tr class="font-bold bg-indigo-50/70 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"><td>Aproximación $(Z)$</td><td class="font-mono">${z.toFixed(3)}</td><td class="font-mono">${p.toFixed(5)}</td></tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td>Valor Mayor $(Z_1)$</td><td class="font-mono">${z1.toFixed(2)}</td><td class="font-mono">${p1.toFixed(4)}</td></tr>
    `;
    
    const mathFormula = `\\begin{aligned}
P &= P_0 + \\frac{Z - Z_0}{Z_1 - Z_0} (P_1 - P_0) \\\\
P &= ${p0.toFixed(4)} + \\frac{${z.toFixed(3)} - (${z0.toFixed(2)})}{${z1.toFixed(2)} - (${z0.toFixed(2)})} \\left(${p1.toFixed(4)} - ${p0.toFixed(4)}\\right) \\\\
P &\\approx ${p.toFixed(5)}
\\end{aligned}`;

    if((window as any).katex) {
        (window as any).katex.render(mathFormula, document.getElementById('pBreakdownMath')!, { displayMode: true });
        (window as any).renderMathInElement(panel, { delimiters: [{left: "$", right: "$", display: false}] });
    }
}

function calculateP() {
    const inputZStr = (document.getElementById('inputZ') as HTMLInputElement).value;
    const inputZ = parseFloat(inputZStr);
    const resElem = document.getElementById('resP')!;

    if (isNaN(inputZ) || inputZ < currentTable.zMin || inputZ > currentTable.zMax) {
        resElem.textContent = "Err: Z fuera de tabla";
        document.getElementById('panelBreakdownP')!.classList.add('hidden');
        return;
    }

    let z0 = Math.floor(inputZ * 100) / 100; 
    let z1 = z0 + 0.01;
    
    const p0 = getPoint(z0);
    const p1 = getPoint(z1);

    if (p0 === null || p1 === null) {
        resElem.textContent = "Valores límite";
        return;
    }

    if (z0 === inputZ) {
        resElem.textContent = p0.toFixed(5);
        document.getElementById('panelBreakdownP')!.classList.add('hidden');
        return;
    }

    const p = p0 + ((inputZ - z0) * (p1 - p0)) / (z1 - z0);
    resElem.textContent = p.toFixed(5);
    showBreakdownP(z0, p0, inputZ, p, z1, p1);
}

function showBreakdownZ(p0: number, z0: number, targetP: number, zResult: number, p1: number, z1: number) {
    const panel = document.getElementById('panelBreakdownZ')!;
    panel.classList.remove('hidden');
    
    document.getElementById('zBreakdownBody')!.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td>Punto Inferior $(P_0)$</td><td class="font-mono">${p0.toFixed(4)}</td><td class="font-mono">${z0.toFixed(3)}</td></tr>
        <tr class="font-bold bg-teal-50/80 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300"><td>Punto Objetivo $(P)$</td><td class="font-mono">${targetP.toFixed(5)}</td><td class="font-mono">${zResult.toFixed(4)}</td></tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td>Punto Superior $(P_1)$</td><td class="font-mono">${p1.toFixed(4)}</td><td class="font-mono">${z1.toFixed(3)}</td></tr>
    `;
    
    const mathFormula = `\\begin{aligned}
Z &= Z_0 + \\frac{P - P_0}{P_1 - P_0} (Z_1 - Z_0) \\\\
Z &= ${z0.toFixed(2)} + \\frac{${targetP.toFixed(5)} - ${p0.toFixed(4)}}{${p1.toFixed(4)} - ${p0.toFixed(4)}} \\left(${z1.toFixed(2)} - (${z0.toFixed(2)})\\right) \\\\
Z &\\approx ${zResult.toFixed(4)}
\\end{aligned}`;

    if((window as any).katex) {
        (window as any).katex.render(mathFormula, document.getElementById('zBreakdownMath')!, { displayMode: true, throwOnError: false });
        (window as any).renderMathInElement(document.getElementById('zBreakdownBody')!, { delimiters: [{left: "$", right: "$", display: false}] });
    }
}

function calculateZ() {
    const targetP = parseFloat((document.getElementById('inputP') as HTMLInputElement).value);
    const resElem = document.getElementById('resZ')!;

    if (isNaN(targetP) || targetP <= 0 || targetP >= 1) {
        resElem.textContent = "Err: Fuera de tabla";
        document.getElementById('panelBreakdownZ')!.classList.add('hidden');
        return;
    }

    let flatData: {z: number, p: number}[] = [];
    Object.keys(currentTable.rowData).forEach(rk => {
        currentTable.rowData[rk].forEach((pStr, ci) => {
            const zNum = parseFloat(rk) > 0 || rk === "0.0" 
                ? parseFloat(rk) + (ci * 0.01) 
                : parseFloat(rk) - (ci * 0.01);
            flatData.push({ z: Math.round(zNum * 100)/100, p: parseFloat(pStr) });
        });
    });
    
    flatData.sort((a,b) => a.z - b.z);

    let low = flatData[0];
    let high = flatData[flatData.length - 1];

    if (targetP <= low.p) { resElem.textContent = low.z.toString(); return; }
    if (targetP >= high.p) { resElem.textContent = high.z.toString(); return; }

    for (let i = 0; i < flatData.length - 1; i++) {
        if (flatData[i].p <= targetP && flatData[i+1].p >= targetP) {
            low = flatData[i];
            high = flatData[i+1];
            break;
        }
    }

    if (low.p === targetP) {
        resElem.textContent = low.z.toFixed(4);
        document.getElementById('panelBreakdownZ')!.classList.add('hidden');
        return;
    }

    const zResult = low.z + ((targetP - low.p) * (high.z - low.z)) / (high.p - low.p);
    resElem.textContent = zResult.toFixed(4);
    showBreakdownZ(low.p, low.z, targetP, zResult, high.p, high.z);
}

function setupEvents() {
    document.getElementById('btnCalcP')!.addEventListener('click', calculateP);
    document.getElementById('btnCalcZ')!.addEventListener('click', calculateZ);

    const darkBtn = document.getElementById('toggleDarkMode')!;
    const htmlElem = document.documentElement;
    const darkText = document.getElementById('darkText')!;
    
    const setDarkModeState = (isDark: boolean) => {
        if (isDark) {
            htmlElem.classList.add('dark');
            darkText.textContent = 'Modo Claro';
        } else {
            htmlElem.classList.remove('dark');
            darkText.textContent = 'Modo Oscuro';
        }
    };

    setDarkModeState(htmlElem.classList.contains('dark'));
    
    darkBtn.addEventListener('click', () => {
        setDarkModeState(!htmlElem.classList.contains('dark'));
    });

    document.getElementById('inputZ')!.addEventListener('keydown', e => {
        if(e.key === 'Enter') calculateP();
    });
    document.getElementById('inputP')!.addEventListener('keydown', e => {
        if(e.key === 'Enter') calculateZ();
    });
}
