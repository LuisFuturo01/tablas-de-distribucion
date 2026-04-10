import type { DistTable } from './types';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

type CachedTables = {
    version: number;
    selectedKey: string | null;
    tableHashes: Record<string, string>;
    lastUpdated: string;
};

const CACHE_KEY = 'tablasDistribucionCache_v1';
const CACHE_VERSION = 1;

function readLocalCache(): CachedTables | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedTables;
        if (!parsed || parsed.version !== CACHE_VERSION) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeLocalCache(state: CachedTables): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } catch {
        // Ignores localStorage failures (e.g., incognito / quotas).
    }
}

function computeTableHash(table: DistTable): string {
    const payload = JSON.stringify({ name: table.name, description: table.description, rows: table.rowData });
    return btoa(unescape(encodeURIComponent(payload)));
}

function updateCacheStatus(message: string, isError = false): void {
    const el = document.getElementById('cacheStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('text-red-500', isError);
    el.classList.toggle('text-slate-500', !isError);
}

function persistCacheSelection(tableKey: string, table: DistTable): void {
    const stored = readLocalCache() || {
        version: CACHE_VERSION,
        selectedKey: tableKey,
        tableHashes: {},
        lastUpdated: new Date().toISOString(),
    };
    stored.selectedKey = tableKey;
    stored.tableHashes[tableKey] = computeTableHash(table);
    stored.lastUpdated = new Date().toISOString();
    writeLocalCache(stored);
}

const modules: Record<string, unknown> = import.meta.glob('./data/*.ts', { eager: true });
const tables: Record<string, DistTable> = {};

Object.keys(modules).forEach((key) => {
    const mod = modules[key] as Record<string, unknown>;
    const tableObj = Object.values(mod).find(
        (val) => (val as DistTable)?.name,
    ) as DistTable | undefined;
    if (tableObj) {
        tables[key] = tableObj;
    }
});

let currentTable: DistTable;

/** Límite de la tabla estándar: fuera de este intervalo se usan colas 0 y 1. */
const Z_TAB = 3.4;

function roundZ4(x: number): number {
    return Math.round(x * 10000) / 10000;
}

function fmtZ(x: number): string {
    return x.toFixed(4);
}

function fmtP(x: number): string {
    return x.toFixed(4);
}

type KatexApi = {
    render: (tex: string, el: HTMLElement, opts: { displayMode?: boolean; throwOnError?: boolean }) => void;
    renderToString?: (tex: string, opts?: { displayMode?: boolean; throwOnError?: boolean }) => string;
};

function getKatex(): KatexApi | undefined {
    return (window as unknown as { katex?: KatexApi }).katex;
}

function renderKaTeXInto(el: HTMLElement, tex: string, displayMode = false): void {
    const k = getKatex();
    if (!k) {
        el.textContent = tex.replace(/\\/g, '');
        return;
    }
    el.innerHTML = '';
    try {
        k.render(tex, el, { displayMode, throwOnError: false });
    } catch {
        el.textContent = tex;
    }
}

function renderMathIn(el: HTMLElement): void {
    const auto = (window as unknown as { renderMathInElement?: (n: HTMLElement, o: object) => void })
        .renderMathInElement;
    if (auto) {
        try {
            auto(el, { delimiters: [{ left: '$', right: '$', display: false }] });
        } catch {
            /* ignore */
        }
    }
}

function buildTableSelector(): void {
    const sel = document.getElementById('tableSelector') as HTMLSelectElement | null;
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(tables).forEach((key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = tables[key].name;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
        const v = sel.value;
        if (v && tables[v]) loadTableData(v, tables[v]);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    buildTableSelector();
    const sel = document.getElementById('tableSelector') as HTMLSelectElement;
    const cached = readLocalCache();

    const safeKey = cached?.selectedKey && tables[cached.selectedKey] ? cached.selectedKey : Object.keys(tables)[0];
    if (safeKey && sel) {
        sel.value = safeKey;
        loadTableData(safeKey, tables[safeKey]);
    }

    setupEvents();

    if (navigator.onLine) {
        setTimeout(() => runBackgroundSync(), 500);
    } else {
        updateCacheStatus('Modo fuera de línea: usando datos del caché o seleccione una tabla.', false);
    }
});

function loadTableData(tableKey: string, table: DistTable): void {
    currentTable = table;
    persistCacheSelection(tableKey, table);
    updateCacheStatus(`Tabla cargada: ${table.name} (caché sincronizada)`, false);

    document.getElementById('tableTitle')!.textContent = currentTable.name;
    const descEl = document.getElementById('tableDesc')!;
    descEl.textContent = currentTable.description;

    const img1 = document.getElementById('img1') as HTMLImageElement;
    const img2 = document.getElementById('img2') as HTMLImageElement;
    if (currentTable.images && currentTable.images.length >= 2) {
        img1.src = currentTable.images[0];
        img2.src = currentTable.images[1];
    }

    renderTable();
    hideBreakdowns();

    const type = currentTable.meta?.type || 'normal';
    
    const toolsNormal = document.getElementById('toolsNormal');
    const toolsTStudent = document.getElementById('toolsTStudent');
    const toolsChiSquare = document.getElementById('toolsChiSquare');
    
    if (toolsNormal) toolsNormal.style.display = type === 'normal' ? 'grid' : 'none';
    if (toolsTStudent) toolsTStudent.style.display = type === 't' ? 'grid' : 'none';
    if (toolsChiSquare) toolsChiSquare.style.display = type === 'chi' ? 'grid' : 'none';
    
    const toolsFisher = document.getElementById('toolsFisher');
    const toolsGamma = document.getElementById('toolsGamma');
    if (toolsFisher) toolsFisher.style.display = type === 'f' ? 'grid' : 'none';
    if (toolsGamma) toolsGamma.style.display = type === 'gamma' ? 'grid' : 'none';
    
    const calcSection = document.getElementById('calculatorSection');
    if (calcSection) {
        calcSection.style.display = '';
    }

    setTimeout(() => {
        renderMathIn(descEl);
        if (calcSection) renderMathIn(calcSection);
    }, 50);
}

function renderTable(): void {
    const isNormal = !currentTable.meta || currentTable.meta.type === 'normal';
    const theadL = document.getElementById('tableHeaderRowLeft')!;
    const tbodyL = document.getElementById('tableBodyLeft')!;
    const theadR = document.getElementById('tableHeaderRowRight')!;
    const tbodyR = document.getElementById('tableBodyRight')!;
    
    const wrapperR = document.getElementById('tableWrapperRight');
    const labelL = document.getElementById('tableLabelLeft');

    theadL.innerHTML = '';
    tbodyL.innerHTML = '';
    theadR.innerHTML = '';
    tbodyR.innerHTML = '';

    if (isNormal) {
        if (wrapperR) wrapperR.style.display = '';
        if (labelL) labelL.textContent = 'Parte Z [-]';

        const thLBlank = document.createElement('th');
        thLBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 font-bold sticky -top-px left-0 z-30 shadow-[1px_1px_0_0_#cbd5e1] dark:shadow-[1px_1px_0_0_#475569]';
        thLBlank.textContent = 'Z';
        theadL.appendChild(thLBlank);

        const thRBlank = document.createElement('th');
        thRBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 font-bold sticky -top-px left-0 z-30 shadow-[1px_1px_0_0_#cbd5e1] dark:shadow-[1px_1px_0_0_#475569]';
        thRBlank.textContent = 'Z';
        theadR.appendChild(thRBlank);

        for (let i = 0; i < 10; i++) {
            const thL = document.createElement('th');
            thL.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300 sticky -top-px z-20 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 shadow-[0_1px_0_0_#cbd5e1] dark:shadow-[0_1px_0_0_#475569]';
            thL.textContent = `.0${i}`;
            theadL.appendChild(thL);

            const thR = document.createElement('th');
            thR.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300 sticky -top-px z-20 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 shadow-[0_1px_0_0_#cbd5e1] dark:shadow-[0_1px_0_0_#475569]';
            thR.textContent = `.0${i}`;
            theadR.appendChild(thR);
        }

        const keys = Object.keys(currentTable.rowData).sort((a, b) => parseFloat(a) - parseFloat(b));
        keys.forEach((z) => {
            const row = document.createElement('tr');

            const thZ = document.createElement('th');
            thZ.className = 'p-1 sm:p-2 font-bold bg-slate-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-600 z-10 sticky left-0 text-slate-800 dark:text-slate-100';
            thZ.textContent = z;
            row.appendChild(thZ);

            currentTable.rowData[z].forEach((val, idx) => {
                const td = document.createElement('td');
                td.className = 'p-1 tracking-tight font-mono transition-colors text-slate-800 dark:text-slate-300';
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
    } else {
        if (wrapperR) wrapperR.style.display = 'none';
        
        let firstColName = currentTable.meta?.type === 't' ? 'gl' : currentTable.meta?.type === 'chi' ? 'gl' : 'ν1 \\ ν2';
        const thLBlank = document.createElement('th');
        thLBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 font-bold sticky -top-px left-0 z-30 shadow-[1px_1px_0_0_#cbd5e1] dark:shadow-[1px_1px_0_0_#475569] align-bottom text-center';
        thLBlank.textContent = firstColName;
        theadL.appendChild(thLBlank);
        
        if (labelL) {
            labelL.innerHTML = `Valores &nbsp;&nbsp;<span class="text-xs font-normal text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded ml-2">Alto: P(X≤x)=1-α &nbsp;|&nbsp; Bajo: P(X≥x)=α</span>`;
        }

        const columns = currentTable.meta?.columns || [];
        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300 align-bottom sticky -top-px z-20 bg-slate-200 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-600 shadow-[0_1px_0_0_#cbd5e1] dark:shadow-[0_1px_0_0_#475569]';
            
            const numCol = parseFloat(String(col));
            if (!isNaN(numCol) && numCol > 0 && numCol < 1) {
                const strNum = String(col);
                const descStr = strNum.includes('.') ? strNum.split('.')[1] : '';
                const decLen = descStr.length > 0 ? Math.max(2, descStr.length) : 2;
                const complement = (1 - numCol).toFixed(decLen);
                
                th.innerHTML = `
                    <div class="text-[0.65rem] text-slate-500 dark:text-slate-400 font-normal leading-tight pb-[2px] opacity-90 whitespace-nowrap tracking-wide">${complement}</div>
                    <div class="text-[0.75rem] text-slate-800 dark:text-slate-100 leading-tight whitespace-nowrap font-bold tracking-wide">${strNum}</div>
                `;
            } else {
                th.textContent = String(col);
            }
            theadL.appendChild(th);
        });

        const keys = Object.keys(currentTable.rowData).sort((a, b) => {
            const numA = (a === '∞' || a.toLowerCase() === 'inf') ? Infinity : parseFloat(a);
            const numB = (b === '∞' || b.toLowerCase() === 'inf') ? Infinity : parseFloat(b);
            return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
        });

        keys.forEach((key) => {
            const row = document.createElement('tr');
            
            const thKey = document.createElement('th');
            thKey.className = 'p-1 sm:p-2 font-bold bg-slate-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-600 z-10 sticky left-0 text-slate-800 dark:text-slate-100';
            thKey.textContent = key;
            row.appendChild(thKey);

            currentTable.rowData[key].forEach((val, idx) => {
                const td = document.createElement('td');
                td.className = 'p-1 tracking-tight font-mono transition-colors text-slate-800 dark:text-slate-300';
                td.dataset.col = idx.toString();
                td.textContent = val;
                row.appendChild(td);
            });
            tbodyL.appendChild(row);
        });
    }
}

function runBackgroundSync(): void {
    const cached = readLocalCache();
    if (!navigator.onLine) {
        updateCacheStatus('Offline: la sincronización en segundo plano se omitió.');
        return;
    }

    updateCacheStatus('Sincronización en segundo plano iniciada...');

    const newState: CachedTables = cached || {
        version: CACHE_VERSION,
        selectedKey: Object.keys(tables)[0] || null,
        tableHashes: {},
        lastUpdated: new Date().toISOString(),
    };

    let changed = false;
    Object.entries(tables).forEach(([key, table]) => {
        const hash = computeTableHash(table);
        if (newState.tableHashes[key] !== hash) {
            newState.tableHashes[key] = hash;
            changed = true;
        }
    });

    if (changed) {
        newState.lastUpdated = new Date().toISOString();
        writeLocalCache(newState);
        updateCacheStatus('Sincronización completa: el caché se ha actualizado.');
    } else {
        updateCacheStatus('Sincronización completa: los datos del caché ya estaban al día.');
    }
}

function setResultP(text: string): void {
    const el = document.getElementById('resP')!;
    el.innerHTML = '';
    el.textContent = text;
}

function setResultZ(text: string): void {
    const el = document.getElementById('resZ')!;
    el.innerHTML = '';
    el.textContent = text;
}

function hideBreakdowns(): void {
    document.getElementById('panelBreakdownP')!.classList.add('hidden');
    document.getElementById('panelBreakdownZ')!.classList.add('hidden');
    setResultP('--');
    setResultZ('--');
    document.getElementById('pBreakdownSymbolic')!.innerHTML = '';
    document.getElementById('zBreakdownSymbolic')!.innerHTML = '';
}

function getProbMatrix(zStr: string, colIdx: number): number | null {
    if (!currentTable.rowData[zStr]) return null;
    return parseFloat(currentTable.rowData[zStr][colIdx]);
}

function getPoint(z: number): number | null {
    z = Math.round(z * 100) / 100;
    const isNegative = z < 0 || Object.is(z, -0);
    const absZ = Math.abs(z);

    const rowBase = Math.floor(absZ * 10) / 10;
    const colBase = Math.round((absZ - rowBase) * 100);

    let rowKey =
        isNegative && rowBase === 0 ? '-0.0' : isNegative ? '-' + rowBase.toFixed(1) : rowBase.toFixed(1);

    if (!rowKey.includes('.')) rowKey += '.0';

    return getProbMatrix(rowKey, colBase);
}

function openPanelP(): void {
    document.getElementById('panelBreakdownP')!.classList.remove('hidden');
}

function openPanelZ(): void {
    document.getElementById('panelBreakdownZ')!.classList.remove('hidden');
}

/** Fórmula de P con todos los números sustituidos (interpolación entre tablas). */
function renderSubstitutedP(
    z0: number,
    p0: number,
    z: number,
    p: number,
    z1: number,
    p1: number,
    exact: boolean,
): void {
    const el = document.getElementById('pBreakdownSymbolic')!;
    if (exact) {
        const tex = `P = ${fmtP(p0)} \\quad \\text{(valor exacto en tabla para } z = ${fmtZ(z)}\\text{)}`;
        renderKaTeXInto(el, tex, true);
        return;
    }
    const tex = `\\begin{aligned}
P &= ${fmtP(p0)} + \\dfrac{(${fmtZ(z)}) - (${fmtZ(z0)})}{(${fmtZ(z1)}) - (${fmtZ(z0)})}\\,\\bigl((${fmtP(p1)}) - (${fmtP(p0)})\\bigr) \\\\
&\\approx ${fmtP(p)}
\\end{aligned}`;
    renderKaTeXInto(el, tex, true);
}

function renderSubstitutedPTailUpper(z: number): void {
    const tex = `P(Z \\le ${fmtZ(z)}) = 1 \\qquad \\text{Cola derecha: } z > ${Z_TAB} \\;\\text{(tabla solo hasta } \\pm ${Z_TAB}\\text{)}`;
    renderKaTeXInto(document.getElementById('pBreakdownSymbolic')!, tex, true);
}

function renderSubstitutedPTailLower(z: number): void {
    const tex = `P(Z \\le ${fmtZ(z)}) = 0 \\qquad \\text{Cola izquierda: } z < -${Z_TAB} \\;\\text{(tabla solo hasta } \\pm ${Z_TAB}\\text{)}`;
    renderKaTeXInto(document.getElementById('pBreakdownSymbolic')!, tex, true);
}

/** Fórmula de z con todos los números sustituidos. */
function renderSubstitutedZ(
    p0: number,
    z0: number,
    targetP: number,
    zResult: number,
    p1: number,
    z1: number,
    exact: boolean,
): void {
    const el = document.getElementById('zBreakdownSymbolic')!;
    if (exact) {
        const tex = `z = ${fmtZ(zResult)} \\quad \\text{(valor exacto en tabla)}`;
        renderKaTeXInto(el, tex, true);
        return;
    }
    const tex = `\\begin{aligned}
z &= ${fmtZ(z0)} + \\dfrac{(${fmtP(targetP)}) - (${fmtP(p0)})}{(${fmtP(p1)}) - (${fmtP(p0)})}\\,\\bigl((${fmtZ(z1)}) - (${fmtZ(z0)})\\bigr) \\\\
&\\approx ${fmtZ(zResult)}
\\end{aligned}`;
    renderKaTeXInto(el, tex, true);
}

function renderSubstitutedZTailUpper(targetP: number, high: { z: number; p: number }): void {
    const isOne = Math.abs(targetP - 1) < 1e-10;
    if (isOne) {
        const tex = `P = 1 \\qquad \\Rightarrow \\quad z > ${Z_TAB} \\quad \\text{(cola derecha; } P(Z \\le ${fmtZ(high.z)}) = ${fmtP(high.p)} \\text{ es el máximo de la tabla)}`;
        renderKaTeXInto(document.getElementById('zBreakdownSymbolic')!, tex, true);
        return;
    }
    const tex = `P = ${fmtP(targetP)} > ${fmtP(high.p)} = P(Z \\le ${fmtZ(high.z)}) \\qquad \\Rightarrow \\quad z > ${Z_TAB} \\quad \\text{(cola derecha)}`;
    renderKaTeXInto(document.getElementById('zBreakdownSymbolic')!, tex, true);
}
function renderSubstitutedZTailLower(targetP: number, low: { z: number; p: number }): void {
    const isZero = Math.abs(targetP) < 1e-10;
    if (isZero) {
        const tex = `P = 0 \\qquad \\Rightarrow \\quad z < -${Z_TAB} \\quad \\text{(cola izquierda; } P(Z \\le ${fmtZ(low.z)}) = ${fmtP(low.p)} \\text{ es el mínimo de la tabla)}`;
        renderKaTeXInto(document.getElementById('zBreakdownSymbolic')!, tex, true);
        return;
    }
    const tex = `P = ${fmtP(targetP)} < ${fmtP(low.p)} = P(Z \\le ${fmtZ(low.z)}) \\qquad \\Rightarrow \\quad z < -${Z_TAB} \\quad \\text{(cola izquierda)}`;
    renderKaTeXInto(document.getElementById('zBreakdownSymbolic')!, tex, true);
}

/** Regla de tres + despejada: cola derecha (z > 3.4 → P = 1). */
function showTailBreakdownPUpper(z: number): void {
    openPanelP();
    const pEdge = getPoint(3.49);
    const pEdgeStr = pEdge !== null ? fmtP(pEdge) : '—';
    const body = document.getElementById('pBreakdownBody')!;
    body.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior (tabla, máx. z)</td>
            <td class="font-mono tab-num">${fmtZ(3.49)}</td>
            <td class="font-mono tab-num">${pEdgeStr}</td>
        </tr>
        <tr class="font-bold bg-indigo-50/70 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
            <td class="text-left font-medium">Buscado (cola derecha)</td>
            <td class="font-mono tab-num">${fmtZ(z)}</td>
            <td class="font-mono tab-num">1.0000 <span class="text-[11px] font-normal opacity-90">(z &gt; ${Z_TAB}, fuera de tabla)</span></td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente</td>
            <td class="text-left text-[11px]" colspan="2">No aplica (sin interpolación en cola)</td>
        </tr>
    `;
    renderSubstitutedPTailUpper(z);
}

/** Cola izquierda (z < -3.4 → P = 0). */
function showTailBreakdownPLower(z: number): void {
    openPanelP();
    const pEdge = getPoint(-3.49);
    const pEdgeStr = pEdge !== null ? fmtP(pEdge) : '—';
    const body = document.getElementById('pBreakdownBody')!;
    body.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior</td>
            <td class="text-left text-[11px]" colspan="2">No aplica (sin interpolación en cola)</td>
        </tr>
        <tr class="font-bold bg-indigo-50/70 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
            <td class="text-left font-medium">Buscado (cola izquierda)</td>
            <td class="font-mono tab-num">${fmtZ(z)}</td>
            <td class="font-mono tab-num">0.0000 <span class="text-[11px] font-normal opacity-90">(z &lt; −${Z_TAB}, fuera de tabla)</span></td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente (tabla, mín. z)</td>
            <td class="font-mono tab-num">${fmtZ(-3.49)}</td>
            <td class="font-mono tab-num">${pEdgeStr}</td>
        </tr>
    `;
    renderSubstitutedPTailLower(z);
}

/** Build a mini-lupa for the normal Z-table.
 *  The Z-table uses rows like "-3.4", "0.0", "1.2" and columns 0-9 for hundredths. */
function buildMiniLupaNormal(z0: number, z1: number, z: number): string {
    // Determine row keys and column indices for z0 and z1
    const getRowAndCol = (zVal: number) => {
        const zRound = Math.round(zVal * 100) / 100;
        const isNeg = zRound < 0 || Object.is(zRound, -0);
        const absZ = Math.abs(zRound);
        const rowBase = Math.floor(absZ * 10) / 10;
        const col = Math.round((absZ - rowBase) * 100);
        let rowKey = isNeg && rowBase === 0 ? '-0.0' : isNeg ? '-' + rowBase.toFixed(1) : rowBase.toFixed(1);
        if (!rowKey.includes('.')) rowKey += '.0';
        return { rowKey, col };
    };

    const pt0 = getRowAndCol(z0);
    const pt1 = getRowAndCol(z1);

    // Determine rows to show
    const allRows = Object.keys(currentTable.rowData).sort((a, b) => parseFloat(a) - parseFloat(b));
    const idx0 = allRows.indexOf(pt0.rowKey);
    const idx1 = allRows.indexOf(pt1.rowKey);
    if (idx0 === -1 || idx1 === -1) return '';

    const rowStart = Math.max(0, Math.min(idx0, idx1) - 1);
    const rowEnd = Math.min(allRows.length - 1, Math.max(idx0, idx1) + 1);

    // Determine columns to show (only the relevant hundredths)
    const colSet = new Set<number>();
    colSet.add(pt0.col);
    colSet.add(pt1.col);
    // Add 1 neighbor on each side
    const minCol = Math.max(0, Math.min(pt0.col, pt1.col) - 1);
    const maxCol = Math.min(9, Math.max(pt0.col, pt1.col) + 1);
    for (let c = minCol; c <= maxCol; c++) colSet.add(c);
    const visibleCols = Array.from(colSet).sort((a, b) => a - b);

    // Build header
    let headerCells = `<th>Z</th>`;
    visibleCols.forEach(c => {
        const isHl = c === pt0.col || c === pt1.col;
        headerCells += `<th class="${isHl ? 'lupa-col-hl' : ''}">.0${c}</th>`;
    });

    // Build body rows
    let bodyRows = '';
    for (let ri = rowStart; ri <= rowEnd; ri++) {
        const rk = allRows[ri];
        const isLo = rk === pt0.rowKey;
        const isHi = rk === pt1.rowKey;
        const isEdge = isLo || isHi;

        let cells = `<th class="${isEdge ? 'lupa-row-hl' : ''}">${rk}</th>`;
        const rowData = currentTable.rowData[rk];
        visibleCols.forEach(c => {
            const val = rowData[c] || '—';
            let cls = '';
            if (isLo && c === pt0.col) cls = 'lupa-cell-found';
            else if (isHi && c === pt1.col) cls = 'lupa-cell-found';
            else if (!isEdge) cls = 'lupa-dim';
            cells += `<td class="${cls}">${val}</td>`;
        });
        bodyRows += `<tr>${cells}</tr>`;

        // Insert searched ghost row if lo and hi are adjacent and different
        if (isLo && pt0.rowKey !== pt1.rowKey && ri + 1 <= rowEnd && allRows[ri + 1] === pt1.rowKey) {
            let searchedCells = `<th>→ ${fmtZ(z)}</th>`;
            visibleCols.forEach(() => {
                searchedCells += `<td>?</td>`;
            });
            bodyRows += `<tr class="lupa-row-searched">${searchedCells}</tr>`;
        }
    }

    return `
        <div class="mini-lupa-wrapper" style="margin-top:0.5rem;margin-bottom:0.5rem;">
            <div class="mini-lupa-header">
                <span class="mini-lupa-icon">🔍</span>
                <span>Ubicación en tabla Z</span>
            </div>
            <table class="mini-lupa-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

function showBreakdownP(z0: number, p0: number, z: number, p: number, z1: number, p1: number, exact: boolean): void {
    openPanelP();
    const body = document.getElementById('pBreakdownBody')!;
    const midPVal = fmtP(p);
    const midPNote = exact
        ? '<span class="text-[11px] font-normal opacity-90">(exacto en tabla)</span>'
        : '<span class="text-[11px] font-normal opacity-90">(interpolado)</span>';

    // Build mini-lupa for normal distribution
    const lupaHtml = buildMiniLupaNormal(z0, z1, z);

    body.innerHTML = `
        <tr><td colspan="3" style="padding:0;border:none;">${lupaHtml}</td></tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior (tabla)</td>
            <td class="font-mono tab-num">${fmtZ(z0)}</td>
            <td class="font-mono tab-num">${fmtP(p0)}</td>
        </tr>
        <tr class="font-bold bg-indigo-50/70 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
            <td class="text-left font-medium">Buscado (interpolar)</td>
            <td class="font-mono tab-num">${fmtZ(z)}</td>
            <td class="font-mono tab-num">${midPVal} ${midPNote}</td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente (tabla)</td>
            <td class="font-mono tab-num">${fmtZ(z1)}</td>
            <td class="font-mono tab-num">${fmtP(p1)}</td>
        </tr>
    `;
    renderSubstitutedP(z0, p0, z, p, z1, p1, exact);
}

function calculateP(): void {
    const raw = parseFloat((document.getElementById('inputZ') as HTMLInputElement).value);
    if (isNaN(raw)) {
        setResultP('Err: introduce un número');
        document.getElementById('panelBreakdownP')!.classList.add('hidden');
        return;
    }

    const z = roundZ4(raw);

    if (z > Z_TAB) {
        renderKaTeXInto(
            document.getElementById('resP')!,
            `P(Z \\le ${fmtZ(z)}) = 1 \\quad \\text{Cola derecha: } z > ${Z_TAB}`,
            false,
        );
        showTailBreakdownPUpper(z);
        return;
    }
    if (z < -Z_TAB) {
        renderKaTeXInto(
            document.getElementById('resP')!,
            `P(Z \\le ${fmtZ(z)}) = 0 \\quad \\text{Cola izquierda: } z < -${Z_TAB}`,
            false,
        );
        showTailBreakdownPLower(z);
        return;
    }

    const z0 = Math.floor(z * 100) / 100;
    const z1 = z0 + 0.01;

    const p0 = getPoint(z0);
    const p1 = getPoint(z1);

    if (p0 === null || p1 === null) {
        setResultP('Valores límite');
        document.getElementById('panelBreakdownP')!.classList.add('hidden');
        return;
    }

    const onGrid = Math.abs(z - z0) < 0.5e-4;
    if (onGrid) {
        renderKaTeXInto(
            document.getElementById('resP')!,
            `P(Z \\le ${fmtZ(z)}) = ${fmtP(p0)}`,
            false,
        );
        showBreakdownP(z0, p0, z, p0, z1, p1, true);
        return;
    }

    const p = p0 + ((z - z0) * (p1 - p0)) / (z1 - z0);
    renderKaTeXInto(
        document.getElementById('resP')!,
        `P(Z \\le ${fmtZ(z)}) \\approx ${fmtP(p)}`,
        false,
    );
    showBreakdownP(z0, p0, z, p, z1, p1, false);
}

function showTailBreakdownZUpper(targetP: number, high: { z: number; p: number }): void {
    openPanelZ();
    const body = document.getElementById('zBreakdownBody')!;
    body.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior (tabla, máx.)</td>
            <td class="font-mono tab-num">${fmtP(high.p)}</td>
            <td class="font-mono tab-num">${fmtZ(high.z)}</td>
        </tr>
        <tr class="font-bold bg-teal-50/80 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300">
            <td class="text-left font-medium">Buscado (cola derecha)</td>
            <td class="font-mono tab-num">${fmtP(targetP)}</td>
            <td class="font-mono tab-num">z &gt; ${Z_TAB} <span class="text-[11px] font-normal opacity-90">(fuera de tabla)</span></td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente</td>
            <td class="text-left text-[11px]" colspan="2">No aplica (sin interpolación en cola)</td>
        </tr>
    `;
    renderSubstitutedZTailUpper(targetP, high);
}

function showTailBreakdownZLower(targetP: number, low: { z: number; p: number }): void {
    openPanelZ();
    const body = document.getElementById('zBreakdownBody')!;
    body.innerHTML = `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior</td>
            <td class="text-left text-[11px]" colspan="2">No aplica (sin interpolación en cola)</td>
        </tr>
        <tr class="font-bold bg-teal-50/80 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300">
            <td class="text-left font-medium">Buscado (cola izquierda)</td>
            <td class="font-mono tab-num">${fmtP(targetP)}</td>
            <td class="font-mono tab-num">z &lt; −${Z_TAB} <span class="text-[11px] font-normal opacity-90">(fuera de tabla)</span></td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente (tabla, mín.)</td>
            <td class="font-mono tab-num">${fmtP(low.p)}</td>
            <td class="font-mono tab-num">${fmtZ(low.z)}</td>
        </tr>
    `;
    renderSubstitutedZTailLower(targetP, low);
}

function showBreakdownZ(
    p0: number,
    z0: number,
    targetP: number,
    zResult: number,
    p1: number,
    z1: number,
    exact: boolean,
): void {
    openPanelZ();
    const body = document.getElementById('zBreakdownBody')!;
    const midZNote = exact
        ? '<span class="text-[11px] font-normal opacity-90">(exacto en tabla)</span>'
        : '<span class="text-[11px] font-normal opacity-90">(interpolado)</span>';

    // Build mini-lupa for normal distribution
    const lupaHtml = buildMiniLupaNormal(z0, z1, zResult);

    body.innerHTML = `
        <tr><td colspan="3" style="padding:0;border:none;">${lupaHtml}</td></tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Anterior (tabla)</td>
            <td class="font-mono tab-num">${fmtP(p0)}</td>
            <td class="font-mono tab-num">${fmtZ(z0)}</td>
        </tr>
        <tr class="font-bold bg-teal-50/80 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300">
            <td class="text-left font-medium">Buscado (interpolar)</td>
            <td class="font-mono tab-num">${fmtP(targetP)}</td>
            <td class="font-mono tab-num">${fmtZ(zResult)} ${midZNote}</td>
        </tr>
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <td class="text-left font-medium">Siguiente (tabla)</td>
            <td class="font-mono tab-num">${fmtP(p1)}</td>
            <td class="font-mono tab-num">${fmtZ(z1)}</td>
        </tr>
    `;
    renderSubstitutedZ(p0, z0, targetP, zResult, p1, z1, exact);
}

function calculateZ(): void {
    const targetP = parseFloat((document.getElementById('inputP') as HTMLInputElement).value);

    if (Number.isNaN(targetP) || targetP < 0 || targetP > 1) {
        const el = document.getElementById('resZ')!;
        el.innerHTML = '';
        el.textContent = 'Probabilidad no válida: P debe ser un número en el intervalo [0, 1].';
        document.getElementById('panelBreakdownZ')!.classList.add('hidden');
        document.getElementById('zBreakdownSymbolic')!.innerHTML = '';
        return;
    }

    const flatData: { z: number; p: number }[] = [];
    Object.keys(currentTable.rowData).forEach((rk) => {
        currentTable.rowData[rk].forEach((pStr, ci) => {
            const zNum =
                parseFloat(rk) > 0 || rk === '0.0'
                    ? parseFloat(rk) + ci * 0.01
                    : parseFloat(rk) - ci * 0.01;
            flatData.push({ z: Math.round(zNum * 100) / 100, p: parseFloat(pStr) });
        });
    });

    flatData.sort((a, b) => a.z - b.z);

    const low = flatData[0];
    const high = flatData[flatData.length - 1];

    if (targetP > high.p) {
        const res =
            Math.abs(targetP - 1) < 1e-10
                ? `P = 1 \\quad \\Rightarrow \\quad z > ${Z_TAB} \\quad \\text{(cola derecha)}`
                : `P = ${fmtP(targetP)} > ${fmtP(high.p)} \\quad \\Rightarrow \\quad z > ${Z_TAB} \\quad \\text{(cola derecha)}`;
        renderKaTeXInto(document.getElementById('resZ')!, res, false);
        showTailBreakdownZUpper(targetP, high);
        return;
    }
    if (targetP < low.p) {
        const res =
            Math.abs(targetP) < 1e-10
                ? `P = 0 \\quad \\Rightarrow \\quad z < -${Z_TAB} \\quad \\text{(cola izquierda)}`
                : `P = ${fmtP(targetP)} < ${fmtP(low.p)} \\quad \\Rightarrow \\quad z < -${Z_TAB} \\quad \\text{(cola izquierda)}`;
        renderKaTeXInto(document.getElementById('resZ')!, res, false);
        showTailBreakdownZLower(targetP, low);
        return;
    }

    let lo = low;
    let hi = high;
    for (let i = 0; i < flatData.length - 1; i++) {
        if (flatData[i].p <= targetP && flatData[i + 1].p >= targetP) {
            lo = flatData[i];
            hi = flatData[i + 1];
            break;
        }
    }

    if (lo.p === targetP) {
        renderKaTeXInto(
            document.getElementById('resZ')!,
            `P(Z \\le ${fmtZ(lo.z)}) = ${fmtP(lo.p)}`,
            false,
        );
        showBreakdownZ(lo.p, lo.z, targetP, lo.z, hi.p, hi.z, true);
        return;
    }

    const zResult = lo.z + ((targetP - lo.p) * (hi.z - lo.z)) / (hi.p - lo.p);
    const zR = roundZ4(zResult);
    renderKaTeXInto(
        document.getElementById('resZ')!,
        `P(Z \\le z) = ${fmtP(targetP)} \\Rightarrow z \\approx ${fmtZ(zR)}`,
        false,
    );
    showBreakdownZ(lo.p, lo.z, targetP, zR, hi.p, hi.z, false);
}

/** CSS de impresión aplicado como estilos globales (sin @media print wrapper).
 *  Esto fuerza la página a verse EXACTAMENTE como la vista de impresión. */
const PDF_INJECT_CSS = `
/* ——— PDF CAPTURE MODE ——— */
.no-print { display: none !important; }
footer { display: none !important; }
body{
    min-width: 1200px !important;
    width: 1200px !important;
    max-width: 1200px !important;
    display: flex !important;
    flex: 1 !important;
    justify-content:center !important;
    align-items:center !important;
}
body.pdf-capture {
    background: transparent !important;
    color: #1e293b !important;
    margin: 0 !important;
    padding: 2px !important;
    font-size: 8pt !important;
    width: 1200px !important;
    min-width: 1200px !important;
    overflow: visible !important;
}

body.pdf-capture * {
    transition: none !important;
    animation: none !important;
}

body.pdf-capture .container-full {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    align-items: stretch !important;
}

body.pdf-capture header {
    margin-bottom: 2px !important;
    text-align: center !important;
    padding: 0 !important;
}
body.pdf-capture header h1 {
    font-size: 16pt !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #1e1b4b !important;
    line-height: 1.3 !important;
}
body.pdf-capture header p {
    font-size: 9pt !important;
    margin: 2px 0 0 0 !important;
    padding: 0 !important;
    color: #475569 !important;
    line-height: 1.2 !important;
}

body.pdf-capture #imageContainer {
    margin-top: 4px !important;
    margin-bottom: 4px !important;
    gap: 10px !important;
    justify-content: center !important;
    display: flex !important;
}
body.pdf-capture #imageContainer img {
    height: 100px !important;
    max-height: 100px !important;
    min-height: 70px !important;
    width: auto !important;
    border: 1px solid #ccc !important;
    padding: 2px !important;
    box-shadow: none !important;
    border-radius: 2px !important;
}

body.pdf-capture .tabla-container {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
}

body.pdf-capture .tabla-container-tab {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    width: 100% !important;
}

body.pdf-capture .table-wrapper {
    flex: 1 1 50% !important;
    width: 50% !important;
    border: 1px solid #94a3b8 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
}

body.pdf-capture .table-wrapper > .bg-slate-100,
body.pdf-capture .table-wrapper > div.border-b {
    padding: 2px 5px !important;
    background-color: #f1f5f9 !important;
    border-bottom: 1px solid #000 !important;
    font-size: 8pt !important;
    line-height: 1.3 !important;
    display: block !important;
}

body.pdf-capture .overflow-x-auto {
    overflow: visible !important;
}

body.pdf-capture .stats-table {
    width: 100% !important;
    min-width: 0 !important;
    font-size: 8pt !important;
    table-layout: auto !important;
    border-collapse: collapse !important;
}

body.pdf-capture .stats-table th,
body.pdf-capture .stats-table td {
    padding: 3px 5px !important;
    line-height: 1.4 !important;
    border: 1px solid #cbd5e1 !important;
    min-width: 0 !important;
    white-space: nowrap !important;
    font-size: 8pt !important;
}

body.pdf-capture .stats-table thead th {
    font-size: 7.5pt !important;
    padding: 3px 5px !important;
    background-color: #e2e8f0 !important;
    font-weight: 700 !important;
}

body.pdf-capture .stats-table tbody th {
    font-size: 8pt !important;
    font-weight: 700 !important;
    padding: 3px 5px !important;
    position: static !important;
    box-shadow: none !important;
}

body.pdf-capture .calculadora {
    display: none !important;
}
`;

/** Genera y descarga un PDF con el mismo formato que la vista de impresión. */
async function downloadPdf(): Promise<void> {
    const btn = document.getElementById('btnDownloadPdf') as HTMLButtonElement;
    const originalText = btn.querySelector('span')!.textContent;
    btn.querySelector('span')!.textContent = 'Generando PDF…';
    btn.disabled = true;
    btn.style.opacity = '0.6';

    const htmlElem = document.documentElement;
    const wasDark = htmlElem.classList.contains('dark');

    // 1. Forzar modo claro
    if (wasDark) htmlElem.classList.remove('dark');

    // 2. Inyectar CSS de impresión como estilos globales
    const styleTag = document.createElement('style');
    styleTag.id = 'pdf-capture-styles';
    styleTag.textContent = PDF_INJECT_CSS;
    document.head.appendChild(styleTag);

    // 3. Activar modo de captura
    document.body.classList.add('pdf-capture');

    // Guardar scroll y forzar top
    const savedScroll = window.scrollY;
    
    const scrollStates: {el: Element, left: number, top: number}[] = [];
    document.querySelectorAll('.overflow-auto, .overflow-x-auto, .overflow-y-auto').forEach(el => {
        scrollStates.push({ el, left: el.scrollLeft, top: el.scrollTop });
        el.scrollLeft = 0;
        el.scrollTop = 0;
    });

    window.scrollTo(0, 0);

    // Pequeña pausa para que el reflow se aplique
    await new Promise(r => setTimeout(r, 200));

    const captureTarget = document.querySelector('.container-full') as HTMLElement;
    const titleText = document.getElementById('tableTitle')!.textContent || 'tabla';
    const tableName = titleText.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]/g, '').trim().replace(/\s+/g, '_');

    try {
        // html2canvas-pro soporta oklab() nativamente
        const canvas = await html2canvas(captureTarget, {
            scale: 2,
            useCORS: true,
            scrollX: 0,
            scrollY: -window.scrollY,
            width: 1200,
            windowWidth: 1200,
        });

        // Letter landscape: 11 x 8.5 pulgadas
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'in',
            format: 'letter',
        });

        const pageW = 15;
        const pageH = 8.5;
        const pdfMargin = 0.5;
        const usableW = pageW - pdfMargin * 2;
        const usableH = pageH - pdfMargin * 2;

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const canvasRatio = canvas.height / canvas.width;
        let imgW = usableW;
        let imgH = imgW * canvasRatio;

        // Si es más alto que la página, escalar para encajar
        if (imgH > usableH) {
            imgH = usableH;
            imgW = imgH / canvasRatio;
        }

        pdf.addImage(imgData, 'JPEG', (pdfMargin+0.4), (pdfMargin-0.1), imgW, imgH);
        pdf.save(`${tableName}.pdf`);
    } catch (err) {
        console.error('Error generando PDF:', err);
        alert('Error al generar el PDF. Usa el botón Imprimir → Guardar como PDF.');
    } finally {
        // Restaurar todo
        document.body.classList.remove('pdf-capture');
        document.head.removeChild(styleTag);
        if (wasDark) htmlElem.classList.add('dark');
        
        window.scrollTo(0, savedScroll);
        scrollStates.forEach(({el, left, top}) => {
            el.scrollLeft = left;
            el.scrollTop = top;
        });

        btn.querySelector('span')!.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

function setupEvents(): void {
    document.getElementById('btnCalcP')?.addEventListener('click', calculateP);
    document.getElementById('btnCalcZ')?.addEventListener('click', calculateZ);
    document.getElementById('btnCalcT')?.addEventListener('click', evaluateTStudent);
    document.getElementById('btnCalcChi')?.addEventListener('click', evaluateChiSquare);
    document.getElementById('btnDownloadPdf')?.addEventListener('click', downloadPdf);
    
    document.getElementById('btnInterpT')?.addEventListener('click', interpolateT);
    document.getElementById('btnInterpChi')?.addEventListener('click', interpolateChi);
    document.getElementById('btnInterpF')?.addEventListener('click', interpolateF);
    document.getElementById('btnInterpGamma')?.addEventListener('click', interpolateGamma);
    document.getElementById('btnGammaChi')?.addEventListener('click', () => calcGammaSmart('inputGammaChi', 'resGammaChi'));
    document.getElementById('btnGammaChi2')?.addEventListener('click', () => calcGammaSmart('inputGammaChi2', 'resGammaChi2'));
    document.getElementById('btnGammaFunc')?.addEventListener('click', () => calcGammaSmart('inputGammaFunc', 'resGammaFunc'));
    
    document.getElementById('btnOpenProps')?.addEventListener('click', openPropsDrawer);
    document.getElementById('btnCloseProps')?.addEventListener('click', closePropsDrawer);
    document.getElementById('propsOverlay')?.addEventListener('click', closePropsDrawer);
    
    document.getElementById('btnInvInterpT')?.addEventListener('click', interpolateTInverse);
    document.getElementById('btnInvInterpChi')?.addEventListener('click', interpolateChiInverse);
    document.getElementById('btnInvInterpGamma')?.addEventListener('click', interpolateGammaInverse);

    // Lightbox
    let isZoomed = false;
    document.querySelectorAll('#imageContainer img').forEach(img => {
        img.addEventListener('click', () => {
            const lightbox = document.getElementById('lightboxOverlay');
            const lightboxImg = document.getElementById('lightboxImg');
            if(lightbox && lightboxImg) {
                isZoomed = false;
                lightboxImg.classList.add('max-w-[90vw]', 'max-h-[90vh]', 'cursor-zoom-in');
                lightboxImg.classList.remove('max-w-none', 'max-h-none', 'cursor-zoom-out', 'w-[200vw]', 'md:w-[150vw]');
                lightboxImg.setAttribute('src', img.getAttribute('src') || '');
                lightbox.classList.remove('hidden');
                requestAnimationFrame(() => {
                    lightbox.classList.remove('opacity-0');
                });
            }
        });
    });
    
    document.getElementById('closeLightbox')?.addEventListener('click', closeLightbox);
    
    const lightboxScroll = document.getElementById('lightboxScroll');
    if (lightboxScroll) {
        lightboxScroll.addEventListener('click', (e) => {
            if (e.target === lightboxScroll) {
                closeLightbox();
            }
        });
    }

    const lightboxImg = document.getElementById('lightboxImg');
    if (lightboxImg) {
        lightboxImg.addEventListener('click', (e) => {
            e.stopPropagation();
            isZoomed = !isZoomed;
            if (isZoomed) {
                lightboxImg.classList.remove('max-w-[90vw]', 'max-h-[90vh]', 'cursor-zoom-in');
                lightboxImg.classList.add('max-w-none', 'max-h-none', 'cursor-zoom-out', 'w-[200vw]', 'md:w-[150vw]');
            } else {
                lightboxImg.classList.add('max-w-[90vw]', 'max-h-[90vh]', 'cursor-zoom-in');
                lightboxImg.classList.remove('max-w-none', 'max-h-none', 'cursor-zoom-out', 'w-[200vw]', 'md:w-[150vw]');
            }
        });
    }

    setupLiveHints();

    const darkBtn = document.getElementById('toggleDarkMode')!;
    const htmlElem = document.documentElement;
    const darkText = document.getElementById('darkText')!;

    const setDarkModeState = (isDark: boolean) => {
        if (isDark) {
            htmlElem.classList.add('dark');
            darkText.textContent = 'Claro';
        } else {
            htmlElem.classList.remove('dark');
            darkText.textContent = 'Oscuro';
        }
    };

    setDarkModeState(htmlElem.classList.contains('dark'));

    darkBtn.addEventListener('click', () => {
        setDarkModeState(!htmlElem.classList.contains('dark'));
    });

    let printScrollStates: {el: Element, left: number, top: number}[] = [];

    window.addEventListener('beforeprint', () => {
        if (htmlElem.classList.contains('dark')) {
            htmlElem.classList.remove('dark');
            htmlElem.dataset.restoreDark = '1';
        }
        
        printScrollStates = [];
        document.querySelectorAll('.overflow-auto, .overflow-x-auto, .overflow-y-auto').forEach(el => {
            printScrollStates.push({ el, left: el.scrollLeft, top: el.scrollTop });
            el.scrollLeft = 0;
            el.scrollTop = 0;
        });
    });

    window.addEventListener('afterprint', () => {
        if (htmlElem.dataset.restoreDark === '1') {
            htmlElem.classList.add('dark');
            delete htmlElem.dataset.restoreDark;
        }
        
        printScrollStates.forEach(({el, left, top}) => {
            el.scrollLeft = left;
            el.scrollTop = top;
        });
        printScrollStates = [];
    });

    document.getElementById('inputZ')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') calculateP();
    });
    document.getElementById('inputP')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') calculateZ();
    });
    document.getElementById('inputTCalc')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') evaluateTStudent();
    });
    document.getElementById('inputChiCalc')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') evaluateChiSquare();
    });
}

function evaluateTStudent(): void {
    const rawCalc = parseFloat((document.getElementById('inputTCalc') as HTMLInputElement).value);
    const rawGlStr = (document.getElementById('inputTGl') as HTMLInputElement).value;
    const rawAlpha = parseFloat((document.getElementById('inputTAlpha') as HTMLInputElement).value);
    const tailType = (document.getElementById('selectTTail') as HTMLSelectElement).value;

    const resEl = document.getElementById('resT')!;
    const breakdownEl = document.getElementById('breakdownT')!;

    const isInf = rawGlStr.toLowerCase().trim() === 'inf' || rawGlStr.trim() === '∞';
    const rawGl = isInf ? Infinity : parseFloat(rawGlStr);

    if (isNaN(rawCalc) || (!isInf && isNaN(rawGl)) || isNaN(rawAlpha)) {
        resEl.textContent = 'Err: Revisa los campos';
        resEl.className = 'text-center font-bold text-xl min-h-[2.5rem] flex items-center justify-center text-red-500';
        breakdownEl.innerHTML = '<span class="text-slate-500">Faltan parámetros. Completa los 3 campos.</span>';
        return;
    }

    const alphaUsed = tailType === "two" ? rawAlpha / 2 : rawAlpha;

    let rowKeyStr = isInf ? 'inf' : String(Math.round(rawGl));
    let row = currentTable.rowData[rowKeyStr];
    
    if (!row && isInf) {
        rowKeyStr = currentTable.rowData['∞'] ? '∞' : 'inf';
        row = currentTable.rowData[rowKeyStr];
    }
    
    if (!row) {
        const sortedGls = Object.keys(currentTable.rowData)
            .map(x => (x === '∞' || x.toLowerCase() === 'inf') ? Infinity : parseInt(x, 10))
            .filter(x => !isNaN(x))
            .sort((a,b) => a - b);
        
        let nearestGl = sortedGls[0];
        for (let i = 0; i < sortedGls.length; i++) {
            if (sortedGls[i] <= rawGl) nearestGl = sortedGls[i];
            else break;
        }
        
        if (nearestGl === Infinity) {
            rowKeyStr = currentTable.rowData['∞'] ? '∞' : 'inf';
        } else {
            rowKeyStr = String(nearestGl);
        }
        row = currentTable.rowData[rowKeyStr];
    }

    let cols = currentTable.meta?.columns || [];
    let colValues = cols.map(c => typeof c === 'string' ? parseFloat(c) : c);
    
    let closestColIdx = 0;
    let minDiff = Infinity;
    
    colValues.forEach((c, idx) => {
        let diff = Math.abs(c - alphaUsed);
        if (diff < minDiff) {
            minDiff = diff;
            closestColIdx = idx;
        }
    });

    const criticalStr = row[closestColIdx];
    const critical = parseFloat(criticalStr);

    let reject = false;
    let latexDecision = '';
    
    const tCritTex = `t_{${rawAlpha}${tailType==='two'? '/2':''}, ${rowKeyStr}}`;
    
    if (tailType === 'two') {
        reject = Math.abs(rawCalc) > critical;
        latexDecision = `\\text{Rechazar } H_0 \\text{ si } |t_{calc}| > ${tCritTex} \\\\ |${rawCalc}| ${reject ? '>' : '\\le'} ${critical}`;
    } else if (tailType === 'right') {
        reject = rawCalc > critical;
        latexDecision = `\\text{Rechazar } H_0 \\text{ si } t_{calc} > ${tCritTex} \\\\ ${rawCalc} ${reject ? '>' : '\\le'} ${critical}`;
    } else if (tailType === 'left') {
        reject = rawCalc < -critical;
        latexDecision = `\\text{Rechazar } H_0 \\text{ si } t_{calc} < -${tCritTex} \\\\ ${rawCalc} ${reject ? '<' : '\\ge'} -${critical}`;
    }

    resEl.textContent = reject ? 'Se Rechaza H0' : 'No se Rechaza H0';
    resEl.className = `text-center font-bold text-xl min-h-[2.5rem] flex items-center justify-center ${reject ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`;

    let alphaTex = tailType === 'two' ? `\\alpha/2 = ${alphaUsed}` : `\\alpha = ${alphaUsed}`;
    let baseNotes = `gl = ${rowKeyStr} \\quad \\text{y} \\quad ${alphaTex} \\implies ${tCritTex} \\approx ${critical}`;
    
    renderKaTeXInto(breakdownEl, `\\begin{aligned} ${baseNotes} \\\\[0.8em] ${latexDecision} \\end{aligned}`, true);
}

function evaluateChiSquare(): void {
    const rawCalc = parseFloat((document.getElementById('inputChiCalc') as HTMLInputElement).value);
    const rawGl = Math.round(parseFloat((document.getElementById('inputChiGl') as HTMLInputElement).value));
    const rawAlpha = parseFloat((document.getElementById('inputChiAlpha') as HTMLInputElement).value);

    const resEl = document.getElementById('resChi')!;
    const breakdownEl = document.getElementById('breakdownChi')!;

    if (isNaN(rawCalc) || isNaN(rawGl) || isNaN(rawAlpha)) {
        resEl.textContent = 'Err: Revisa los campos';
        resEl.className = 'text-center font-bold text-xl min-h-[2.5rem] flex items-center justify-center text-red-500';
        breakdownEl.innerHTML = '<span class="text-slate-500">Faltan parámetros. Completa los 3 campos.</span>';
        return;
    }

    let rowKeyStr = String(Math.round(rawGl));
    let row = currentTable.rowData[rowKeyStr];
    
    if (!row) {
        const sortedGls = Object.keys(currentTable.rowData)
            .map(x => parseInt(x, 10))
            .filter(x => !isNaN(x))
            .sort((a,b) => a - b);
        let nearestGl = sortedGls[sortedGls.length - 1] || 1;
        for (let i = 0; i < sortedGls.length; i++) {
            if (sortedGls[i] <= rawGl) nearestGl = sortedGls[i];
            else break;
        }
        rowKeyStr = String(nearestGl);
        row = currentTable.rowData[rowKeyStr];
    }
    
    if (!row) return;

    let cols = currentTable.meta?.columns || [];
    let colValues = cols.map(c => typeof c === 'string' ? parseFloat(c) : c);
    
    let closestColIdx = 0;
    let minDiff = Infinity;
    
    colValues.forEach((c, idx) => {
        let diff = Math.abs(c - rawAlpha);
        if (diff < minDiff) {
            minDiff = diff;
            closestColIdx = idx;
        }
    });

    const critical = parseFloat(row[closestColIdx]);
    const reject = rawCalc > critical;
    
    resEl.textContent = reject ? 'Se Rechaza H0' : 'No se Rechaza H0';
    resEl.className = `text-center font-bold text-xl min-h-[2.5rem] flex items-center justify-center ${reject ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`;

    const chiCritStr = `\\chi^2_{\\alpha, gl}`;
    const latexDecision = `\\text{Rechazar } H_0 \\text{ si } \\chi^2_{calc} > ${chiCritStr} \\\\ ${rawCalc} ${reject ? '>' : '\\le'} ${critical}`;
    
    let baseNotes = `gl = ${rowKeyStr} \\quad \\text{y} \\quad \\alpha = ${rawAlpha} \\implies ${chiCritStr} \\approx ${critical}`;
    
    renderKaTeXInto(breakdownEl, `\\begin{aligned} ${baseNotes} \\\\[0.8em] ${latexDecision} \\end{aligned}`, true);
}
/* =============================================
   Función Gamma Γ(s) – Aproximación de Lanczos
   ============================================= */
function lanczosGamma(z: number): number {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
    z -= 1;
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Smart Gamma Calculator
 * - If input is a pure number (e.g. "5", "3.5", "0.5") → compute Γ(n) numerically
 * - If input contains 's' (e.g. "s+1", "s+2", "s/2") → expand symbolically using Γ(s+n) recursion
 */
function calcGammaSmart(inputId: string, resId: string): void {
    const raw = (document.getElementById(inputId) as HTMLInputElement).value.trim();
    const resEl = document.getElementById(resId)!;

    if (!raw) { resEl.textContent = 'Ingresa una expresión'; return; }

    // Check if it contains variable 's'
    const hasS = /s/i.test(raw);

    if (!hasS) {
        // Try parsing as fraction first (e.g. "1/2", "3/2", "7/2")
        let num: number;
        let displayStr = raw;
        const fracMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
        if (fracMatch) {
            const numer = parseFloat(fracMatch[1]);
            const denom = parseFloat(fracMatch[2]);
            if (denom === 0) { resEl.textContent = 'División por cero'; return; }
            num = numer / denom;
            displayStr = `\\frac{${fracMatch[1]}}{${fracMatch[2]}}`;
        } else {
            num = parseFloat(raw);
        }
        if (isNaN(num)) { resEl.textContent = 'Expresión no válida'; return; }
        if (num <= 0 && Number.isInteger(num)) { resEl.textContent = 'Γ no definida para enteros ≤ 0'; return; }

        const result = lanczosGamma(num);
        if (Number.isInteger(num) && num > 0) {
            let factorial = 1; for (let i = 2; i < num; i++) factorial *= i;
            renderKaTeXInto(resEl, `\\Gamma(${num}) = ${Math.round(num) - 1}! = ${factorial}`, false);
        } else if (Math.abs(num - 0.5) < 1e-10) {
            renderKaTeXInto(resEl, `\\Gamma\\!\\left(${displayStr}\\right) = \\sqrt{\\pi} \\approx ${Math.sqrt(Math.PI).toPrecision(10)}`, false);
        } else {
            renderKaTeXInto(resEl, `\\Gamma\\!\\left(${displayStr}\\right) \\approx ${result.toPrecision(10)}`, false);
        }
        return;
    }

    // Contains 's' — symbolic expansion
    // Detect pattern: s, s+n, s-n, s*n, s/n, (s+n)/m, etc.
    // For s+n (integer n >= 1): Γ(s+n) = (s+n-1)(s+n-2)...(s)Γ(s)
    // For s+n (fractional): show as Γ(expr) in terms of s
    const normalized = raw.replace(/\s+/g, '').toLowerCase();

    // Match s+integer pattern
    const matchPlus = normalized.match(/^s\+([0-9]+)$/);
    const matchMinus = normalized.match(/^s-([0-9]+)$/);

    if (normalized === 's') {
        renderKaTeXInto(resEl, `\\Gamma(s) = \\Gamma(s)`, false);
        return;
    }

    if (matchPlus) {
        const n = parseInt(matchPlus[1]);
        if (n === 0) {
            renderKaTeXInto(resEl, `\\Gamma(s) = \\Gamma(s)`, false);
            return;
        }
        // Γ(s+n) = (s+n-1)(s+n-2)...(s) · Γ(s)
        const factors: string[] = [];
        for (let i = n - 1; i >= 0; i--) {
            if (i === 0) factors.push('s');
            else if (i === 1) factors.push('(s+1)');
            else factors.push(`(s+${i})`);
        }
        const expansion = factors.join(' \\cdot ');
        if (n === 1) {
            renderKaTeXInto(resEl, `\\Gamma(s+1) = s \\cdot \\Gamma(s)`, false);
        } else {
            renderKaTeXInto(resEl, `\\Gamma(s+${n}) = ${expansion} \\cdot \\Gamma(s)`, false);
        }
        return;
    }

    if (matchMinus) {
        const n = parseInt(matchMinus[1]);
        if (n === 0) {
            renderKaTeXInto(resEl, `\\Gamma(s) = \\Gamma(s)`, false);
            return;
        }
        // Γ(s-n) = Γ(s) / [(s-1)(s-2)...(s-n)]
        const factors: string[] = [];
        for (let i = 1; i <= n; i++) {
            if (i === 1) factors.push('(s-1)');
            else factors.push(`(s-${i})`);
        }
        const denom = factors.join(' \\cdot ');
        renderKaTeXInto(resEl, `\\Gamma(s-${n}) = \\frac{\\Gamma(s)}{${denom}}`, false);
        return;
    }

    // Match s/2 pattern
    if (normalized === 's/2') {
        renderKaTeXInto(resEl, `\\Gamma\\!\\left(\\frac{s}{2}\\right)`, false);
        return;
    }

    // Match (s+n)/2 or s/2+n patterns
    const matchHalf = normalized.match(/^\(s\+([0-9]+)\)\/2$/);
    if (matchHalf) {
        const n = matchHalf[1];
        renderKaTeXInto(resEl, `\\Gamma\\!\\left(\\frac{s+${n}}{2}\\right)`, false);
        return;
    }

    // Generic expression with s — just show Γ(expr)
    const displayExpr = raw.replace(/\*/g, '\\cdot ');
    renderKaTeXInto(resEl, `\\Gamma(${displayExpr})`, false);
}

// Keep legacy function for backward compatibility
function calcGammaUI(inputId: string, resId: string): void {
    const raw = parseFloat((document.getElementById(inputId) as HTMLInputElement).value);
    const resEl = document.getElementById(resId)!;
    if (isNaN(raw)) { resEl.textContent = 'Err: ingresa un número'; return; }
    if (raw <= 0 && Number.isInteger(raw)) { resEl.textContent = 'Γ no definida para enteros ≤ 0'; return; }
    const result = lanczosGamma(raw);
    if (Number.isInteger(raw) && raw > 0) {
        let factorial = 1; for (let i = 2; i < raw; i++) factorial *= i;
        renderKaTeXInto(resEl, `\\Gamma(${raw}) = ${Math.round(raw) - 1}! = ${factorial}`, false);
    } else if (Math.abs(raw - 0.5) < 1e-10) {
        renderKaTeXInto(resEl, `\\Gamma(0.5) = \\sqrt{\\pi} \\approx ${Math.sqrt(Math.PI).toPrecision(10)}`, false);
    } else {
        renderKaTeXInto(resEl, `\\Gamma(${raw}) \\approx ${result.toPrecision(10)}`, false);
    }
}

/* =============================================
   Interpolación Genérica para tablas
   ============================================= */
function getSortedRowKeys(table: DistTable): { key: string; num: number }[] {
    return Object.keys(table.rowData)
        .map(k => ({ key: k, num: (k === '∞' || k.toLowerCase() === 'inf') ? Infinity : parseFloat(k) }))
        .filter(x => !isNaN(x.num)).sort((a, b) => a.num - b.num);
}

function findColIdx(table: DistTable, targetAlpha: number): number {
    const cols = table.meta?.columns || [];
    let best = 0, minD = Infinity;
    cols.forEach((c, i) => { const d = Math.abs(Number(c) - targetAlpha); if (d < minD) { minD = d; best = i; } });
    return best;
}

function findCols(table: DistTable, targetAlpha: number): { exact: boolean; exactIdx: number; loIdx: number; hiIdx: number; aLo: number; aHi: number } {
    const cols = (table.meta?.columns || []).map(Number);
    for (let i = 0; i < cols.length; i++) {
        if (Math.abs(cols[i] - targetAlpha) < 1e-9) return { exact: true, exactIdx: i, loIdx: i, hiIdx: i, aLo: cols[i], aHi: cols[i] };
    }
    const pairs = cols.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    if (targetAlpha <= pairs[0].v) return { exact: false, exactIdx: pairs[0].i, loIdx: pairs[0].i, hiIdx: pairs[0].i, aLo: pairs[0].v, aHi: pairs[0].v };
    if (targetAlpha >= pairs[pairs.length - 1].v) return { exact: false, exactIdx: pairs[pairs.length - 1].i, loIdx: pairs[pairs.length - 1].i, hiIdx: pairs[pairs.length - 1].i, aLo: pairs[pairs.length - 1].v, aHi: pairs[pairs.length - 1].v };
    
    let lo = pairs[0], hi = pairs[pairs.length - 1];
    for (let i = 0; i < pairs.length - 1; i++) {
        if (targetAlpha >= pairs[i].v && targetAlpha <= pairs[i+1].v) {
            lo = pairs[i]; hi = pairs[i+1]; break;
        }
    }
    return { exact: false, exactIdx: -1, loIdx: lo.i, hiIdx: hi.i, aLo: lo.v, aHi: hi.v };
}

function interpolateBilinear(table: DistTable, targetRow: number, targetAlpha: number, colsInfo: ReturnType<typeof findCols>): { val: number, resLo: NonNullable<ReturnType<typeof interpolateBetweenRows>>, resHi: NonNullable<ReturnType<typeof interpolateBetweenRows>>, aLo: number, aHi: number, vLo: number, vHi: number } | null {
    const resLo = interpolateBetweenRows(table, targetRow, colsInfo.loIdx);
    const resHi = interpolateBetweenRows(table, targetRow, colsInfo.hiIdx);
    if (!resLo || !resHi) return null;
    if (colsInfo.loIdx === colsInfo.hiIdx) return { val: resLo.val, resLo, resHi, aLo: colsInfo.aLo, aHi: colsInfo.aHi, vLo: resLo.val, vHi: resLo.val };
    
    const vLo = resLo.val;
    const vHi = resHi.val;
    const aLo = colsInfo.aLo;
    const aHi = colsInfo.aHi;
    
    const val = vLo + ((targetAlpha - aLo) / (aHi - aLo)) * (vHi - vLo);
    return { val, resLo, resHi, aLo, aHi, vLo, vHi };
}

function interpolateBetweenRows(table: DistTable, targetRow: number, colIdx: number): { val: number; lo: { key: string; num: number; v: number }; hi: { key: string; num: number; v: number }; exact: boolean } | null {
    const rows = getSortedRowKeys(table);
    if (rows.length === 0) return null;
    for (const r of rows) {
        if (Math.abs(r.num - targetRow) < 1e-9) {
            const v = parseFloat(table.rowData[r.key][colIdx]);
            return { val: v, lo: { ...r, v }, hi: { ...r, v }, exact: true };
        }
    }
    let loR = rows[0], hiR = rows[rows.length - 1];
    for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i].num <= targetRow && rows[i + 1].num >= targetRow) { loR = rows[i]; hiR = rows[i + 1]; break; }
    }
    const vLo = parseFloat(table.rowData[loR.key][colIdx]);
    const vHi = parseFloat(table.rowData[hiR.key][colIdx]);
    if (hiR.num === loR.num) return { val: vLo, lo: { ...loR, v: vLo }, hi: { ...hiR, v: vHi }, exact: true };
    const val = vLo + ((targetRow - loR.num) / (hiR.num - loR.num)) * (vHi - vLo);
    return { val, lo: { ...loR, v: vLo }, hi: { ...hiR, v: vHi }, exact: false };
}


/** Build a mini "magnifying glass" table showing a cropped view of the real distribution table
 *  around the interpolation rows, highlighting the target column and the rows used. */
function buildMiniLupaTable(table: DistTable, loKey: string, hiKey: string, targetRow: number, colIdx: number): string {
    const columns = table.meta?.columns || [];
    const rows = getSortedRowKeys(table);
    if (rows.length === 0 || columns.length === 0) return '';

    // Determine which columns to show: 1 before, target column, 1 after
    const colStart = Math.max(0, colIdx - 1);
    const colEnd = Math.min(columns.length - 1, colIdx + 1);
    const visibleColIds: number[] = [];
    for (let c = colStart; c <= colEnd; c++) visibleColIds.push(c);

    // Determine which rows to show: 1 before lo, lo, (searched), hi, 1 after hi
    const loIdx = rows.findIndex(r => r.key === loKey);
    const hiIdx = rows.findIndex(r => r.key === hiKey);
    const rowStart = Math.max(0, loIdx - 1);
    const rowEnd = Math.min(rows.length - 1, hiIdx + 1);

    // Build first column header label
    const type = table.meta?.type || 'normal';
    let firstColLabel = 'gl';
    if (type === 'f') firstColLabel = 'ν₂\\ν₁';
    else if (type === 'gamma') firstColLabel = 'α';

    // Build column header TH cells
    let headerCells = `<th>${firstColLabel}</th>`;
    visibleColIds.forEach(ci => {
        const cls = ci === colIdx ? 'lupa-col-hl' : '';
        headerCells += `<th class="${cls}">${columns[ci]}</th>`;
    });

    // Build body rows
    let bodyRows = '';
    for (let ri = rowStart; ri <= rowEnd; ri++) {
        const r = rows[ri];
        const isLo = r.key === loKey;
        const isHi = r.key === hiKey;
        const isEdge = isLo || isHi;

        let cells = `<th class="${isEdge ? 'lupa-row-hl' : ''}">${r.key}</th>`;
        const rowData = table.rowData[r.key];
        visibleColIds.forEach(ci => {
            const val = rowData[ci] || '—';
            let cls = '';
            if (isEdge && ci === colIdx) cls = 'lupa-cell-found';
            else if (ci === colIdx) cls = '';
            else if (!isEdge) cls = 'lupa-dim';
            cells += `<td class="${cls}">${val}</td>`;
        });
        bodyRows += `<tr>${cells}</tr>`;

        // If this is lo row and the next is hi (no gap), insert the "searched" ghost row
        if (isLo && ri + 1 <= rowEnd && rows[ri + 1].key === hiKey) {
            let searchedCells = `<th>→ ${targetRow}</th>`;
            visibleColIds.forEach(ci => {
                searchedCells += `<td>${ci === colIdx ? '?' : ''}</td>`;
            });
            bodyRows += `<tr class="lupa-row-searched">${searchedCells}</tr>`;
        }
    }

    return `
        <div class="mini-lupa-wrapper">
            <div class="mini-lupa-header">
                <span class="mini-lupa-icon">🔍</span>
                <span>Ubicación en tabla</span>
            </div>
            <table class="mini-lupa-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

/** Build a mini "magnifying glass" for inverse interpolation (across columns).
 *  Shows the row being used and the column neighborhood around the searched value. */
function buildMiniLupaTableInverse(table: DistTable, rowKey: string, loColVal: number, hiColVal: number, targetVal: number): string {
    const columns = table.meta?.columns || [];
    const rowData = table.rowData[rowKey];
    if (!rowData || columns.length === 0) return '';

    // Find the column indices for lo and hi values
    const parsedVals = rowData.map(Number);
    let loColIdx = -1, hiColIdx = -1;
    const colAlphas = columns.map(Number);

    // Match by alpha value
    for (let i = 0; i < colAlphas.length; i++) {
        if (Math.abs(colAlphas[i] - loColVal) < 1e-9) loColIdx = i;
        if (Math.abs(colAlphas[i] - hiColVal) < 1e-9) hiColIdx = i;
    }
    if (loColIdx === -1 || hiColIdx === -1) {
        // Fallback: find by parsed value
        for (let i = 0; i < parsedVals.length; i++) {
            if (loColIdx === -1 && Math.abs(parsedVals[i] - targetVal) < Math.abs(parsedVals[loColIdx === -1 ? 0 : loColIdx] - targetVal)) loColIdx = i;
        }
        return '';
    }

    const colStart = Math.max(0, Math.min(loColIdx, hiColIdx) - 1);
    const colEnd = Math.min(columns.length - 1, Math.max(loColIdx, hiColIdx) + 1);
    const visibleColIds: number[] = [];
    for (let c = colStart; c <= colEnd; c++) visibleColIds.push(c);

    // Determine surrounding rows
    const rows = getSortedRowKeys(table);
    const rowIdx = rows.findIndex(r => r.key === rowKey);
    const rowStart = Math.max(0, rowIdx - 1);
    const rowEnd = Math.min(rows.length - 1, rowIdx + 1);

    const type = table.meta?.type || 'normal';
    let firstColLabel = 'gl';
    if (type === 'f') firstColLabel = 'ν₂\\ν₁';
    else if (type === 'gamma') firstColLabel = 'α';

    let headerCells = `<th>${firstColLabel}</th>`;
    visibleColIds.forEach(ci => {
        const isHl = ci === loColIdx || ci === hiColIdx;
        headerCells += `<th class="${isHl ? 'lupa-col-hl' : ''}">${columns[ci]}</th>`;
    });

    let bodyRows = '';
    for (let ri = rowStart; ri <= rowEnd; ri++) {
        const r = rows[ri];
        const isTarget = r.key === rowKey;
        const rd = table.rowData[r.key];
        let cells = `<th class="${isTarget ? 'lupa-row-hl' : ''}">${r.key}</th>`;
        visibleColIds.forEach(ci => {
            const v = rd[ci] || '—';
            let cls = '';
            if (isTarget && (ci === loColIdx || ci === hiColIdx)) cls = 'lupa-cell-found';
            else if (!isTarget) cls = 'lupa-dim';
            cells += `<td class="${cls}">${v}</td>`;
        });
        bodyRows += `<tr>${cells}</tr>`;
    }

    return `
        <div class="mini-lupa-wrapper">
            <div class="mini-lupa-header">
                <span class="mini-lupa-icon">🔍</span>
                <span>Ubicación en tabla</span>
            </div>
            <table class="mini-lupa-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

function showInterpResult(resId: string, bdId: string, label: string, targetRow: number, rowLabel: string, result: ReturnType<typeof interpolateBetweenRows>, colIdx?: number): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const { val, lo, hi, exact } = result;
    renderKaTeXInto(resEl, `${label} \\approx ${val.toFixed(4)}`, false);
    
    let breakdownBody = '';
    let calcFormula = '';
    if (exact) {
        breakdownBody = `
            <tr class="bg-emerald-50/50 dark:bg-emerald-900/20 font-semibold text-emerald-700 dark:text-emerald-400">
                <td colspan="2">Punto Exacto (Sin Regla de 3)</td>
                <td>${val.toFixed(4)}</td>
            </tr>
        `;
        calcFormula = `\\begin{aligned} ${label} &= \\text{Valor extraído directamente de la tabla} \\\\ &\\approx ${val.toFixed(4)} \\end{aligned}`;
    } else {
        breakdownBody = `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="font-semibold text-slate-500">Ant.</td>
                <td>${lo.num}</td><td>${lo.v.toFixed(4)}</td>
            </tr>
            <tr class="bg-indigo-50/50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400">
                <td>Buscado</td>
                <td>${targetRow}</td><td>${val.toFixed(4)}</td>
            </tr>
            <tr>
                <td class="font-semibold text-slate-500">Sig.</td>
                <td>${hi.num}</td><td>${hi.v.toFixed(4)}</td>
            </tr>
        `;
        calcFormula = `\\begin{aligned} ${label} &= ${lo.v.toFixed(4)} + \\dfrac{${targetRow} - ${lo.num}}{${hi.num} - ${lo.num}} \\cdot (${hi.v.toFixed(4)} - ${lo.v.toFixed(4)}) \\\\ &\\approx ${val.toFixed(4)} \\end{aligned}`;
    }

    let rawLabel = rowLabel;
    if(rawLabel === '\\nu_2') rawLabel = 'ν₂';
    if(rawLabel === '\\nu_1') rawLabel = 'ν₁';
    if(rawLabel === '\\alpha') rawLabel = 'α';

    // Build mini-lupa table
    let lupaHtml = '';
    if (colIdx !== undefined && currentTable.meta?.columns) {
        lupaHtml = buildMiniLupaTable(currentTable, lo.key, exact ? lo.key : hi.key, targetRow, colIdx);
    }

    const tableHtml = `
        <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
            ${lupaHtml}
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Desglose Regla de Tres Proporcional ${exact ? '(Punto Exacto)' : ''}</p>
            <div class="overflow-x-auto w-full mb-4">
                <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                    <thead class="${exact ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}">
                        <tr><th>Punto</th><th class="whitespace-nowrap">${rawLabel}</th><th class="whitespace-nowrap">Resolución</th></tr>
                    </thead>
                    <tbody>
                        ${breakdownBody}
                    </tbody>
                </table>
            </div>
            ${exact ? `
            <div class="text-sm text-center mb-4 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                El valor coincide con un punto exacto en la tabla, por lo que no requiere Regla de Tres.
            </div>` : ''}
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo con valores sustituidos</p>
            <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
        </div>
    `;
    bdEl.innerHTML = tableHtml;
    const formulaEl = document.getElementById(bdId + '_formula')!;
    renderKaTeXInto(formulaEl, calcFormula, true);
}
/** Render a probability formula hint above the result, highlighting the unknown in red */
function showFormulaHint(resId: string, tex: string, isError: boolean = false): void {
    const resEl = document.getElementById(resId)!;
    let hintEl = resEl.previousElementSibling as HTMLElement | null;
    if (!hintEl || !hintEl.classList.contains('formula-hint')) {
        hintEl = document.createElement('div');
        hintEl.className = 'formula-hint';
        resEl.parentNode!.insertBefore(hintEl, resEl);
    }
    if (isError) {
        hintEl.style.color = '#ef4444';
        hintEl.style.borderColor = '#fca5a5';
        hintEl.style.background = 'rgba(254, 226, 226, 0.4)';
    } else {
        hintEl.style.color = '';
        hintEl.style.borderColor = '';
        hintEl.style.background = '';
    }
    renderKaTeXInto(hintEl, tex, false);
}

function updateLiveHints(): void {
    const type = currentTable?.meta?.type;
    if (!type) return;

    if (type === 't') {
        const glStr = (document.getElementById('inputTInterpGl') as HTMLInputElement).value;
        const alphaStr = (document.getElementById('inputTInterpAlpha') as HTMLInputElement).value;
        const btn = document.getElementById('btnInterpT') as HTMLButtonElement;
        const gl = parseFloat(glStr);
        const alpha = parseFloat(alphaStr);
        if (glStr && alphaStr && !isNaN(gl) && !isNaN(alpha)) {
            if (alpha <= 0 || alpha >= 1 || gl <= 0) {
                showFormulaHint('resInterpT', 'Error: \\alpha \\in (0,1), gl > 0', true);
                btn.disabled = true;
            } else {
                showFormulaHint('resInterpT', `P(T_{${gl}} > {\\color{red}x}) = ${alpha} \\quad \\small\\text{— encontrar lo rojo}`);
                btn.disabled = false;
            }
        }
        
        // Inverse
        const glIStr = (document.getElementById('inputTInvGl') as HTMLInputElement).value;
        const tStr = (document.getElementById('inputTInvT') as HTMLInputElement).value;
        const btnI = document.getElementById('btnInvInterpT') as HTMLButtonElement;
        const glI = parseFloat(glIStr);
        const t = parseFloat(tStr);
        if (glIStr && tStr && !isNaN(glI) && !isNaN(t)) {
            if (glI <= 0) {
                showFormulaHint('resInvInterpT', 'Error: gl > 0', true);
                btnI.disabled = true;
            } else {
                showFormulaHint('resInvInterpT', `P(T_{${glI}} > ${Math.abs(t)}) = {\\color{red}\\alpha} \\quad \\small\\text{— encontrar lo rojo}`);
                btnI.disabled = false;
            }
        }
    } else if (type === 'chi') {
        const glStr = (document.getElementById('inputChiInterpGl') as HTMLInputElement).value;
        const alphaStr = (document.getElementById('inputChiInterpAlpha') as HTMLInputElement).value;
        const btn = document.getElementById('btnInterpChi') as HTMLButtonElement;
        const gl = parseFloat(glStr);
        const alpha = parseFloat(alphaStr);
        if (glStr && alphaStr && !isNaN(gl) && !isNaN(alpha)) {
            if (alpha <= 0 || alpha >= 1 || gl <= 0 || gl > 100) {
                showFormulaHint('resInterpChi', 'Error: \\alpha \\in (0,1), 0 < gl \\le 100', true);
                btn.disabled = true;
            } else {
                showFormulaHint('resInterpChi', `P(\\chi^2_{${gl}} > {\\color{red}x}) = ${alpha} \\quad \\small\\text{— encontrar lo rojo}`);
                btn.disabled = false;
            }
        }
        
        // Inverse
        const glIStr = (document.getElementById('inputChiInvGl') as HTMLInputElement).value;
        const chiStr = (document.getElementById('inputChiInvChi') as HTMLInputElement).value;
        const btnI = document.getElementById('btnInvInterpChi') as HTMLButtonElement;
        const glI = parseFloat(glIStr);
        const chi = parseFloat(chiStr);
        if (glIStr && chiStr && !isNaN(glI) && !isNaN(chi)) {
            if (glI <= 0 || glI > 100 || chi < 0) {
                showFormulaHint('resInvInterpChi', 'Error: 0 < gl \\le 100, \\chi^2 > 0', true);
                btnI.disabled = true;
            } else {
                showFormulaHint('resInvInterpChi', `P(\\chi^2_{${glI}} > ${chi}) = {\\color{red}\\alpha} \\quad \\small\\text{— encontrar lo rojo}`);
                btnI.disabled = false;
            }
        }
    } else if (type === 'f') {
        const v1Str = (document.getElementById('inputFInterpV1') as HTMLInputElement).value;
        const v2Str = (document.getElementById('inputFInterpV2') as HTMLInputElement).value;
        const btn = document.getElementById('btnInterpF') as HTMLButtonElement;
        const v1 = parseFloat(v1Str);
        const v2 = parseFloat(v2Str);
        if (v1Str && v2Str && !isNaN(v1) && !isNaN(v2)) {
            if (v1 <= 0 || v2 <= 0) {
                showFormulaHint('resInterpF', 'Error: \\nu_1 > 0, \\nu_2 > 0', true);
                btn.disabled = true;
            } else {
                const alphaF = currentTable?.meta?.extraDims?.alpha || '?';
                showFormulaHint('resInterpF', `P(F_{${Math.round(v1)},${v2}} > {\\color{red}x}) = ${alphaF} \\quad \\small\\text{— encontrar lo rojo}`);
                btn.disabled = false;
            }
        }
    } else if (type === 'gamma') {
        const alphaStr = (document.getElementById('inputGammaInterpAlpha') as HTMLInputElement).value;
        const pStr = (document.getElementById('inputGammaInterpP') as HTMLInputElement).value;
        const btn = document.getElementById('btnInterpGamma') as HTMLButtonElement;
        const alpha = parseFloat(alphaStr);
        const p = parseFloat(pStr);
        if (alphaStr && pStr && !isNaN(alpha) && !isNaN(p)) {
            if (p <= 0 || p >= 1 || alpha <= 0) {
                showFormulaHint('resInterpGamma', 'Error: p \\in (0,1), \\alpha > 0', true);
                btn.disabled = true;
            } else {
                showFormulaHint('resInterpGamma', `P(X_{\\alpha=${alpha}} \\le {\\color{red}x}) = ${p} \\quad \\small\\text{— encontrar lo rojo}`);
                btn.disabled = false;
            }
        }
        
        // Inverse
        const alphaIStr = (document.getElementById('inputGammaInvAlpha') as HTMLInputElement).value;
        const xStr = (document.getElementById('inputGammaInvX') as HTMLInputElement).value;
        const btnI = document.getElementById('btnInvInterpGamma') as HTMLButtonElement;
        const alphaI = parseFloat(alphaIStr);
        const x = parseFloat(xStr);
        if (alphaIStr && xStr && !isNaN(alphaI) && !isNaN(x)) {
            if (alphaI <= 0 || x < 0) {
                showFormulaHint('resInvInterpGamma', 'Error: \\alpha > 0, x > 0', true);
                btnI.disabled = true;
            } else {
                showFormulaHint('resInvInterpGamma', `P(X_{\\alpha=${alphaI}} \\le ${x}) = {\\color{red}p} \\quad \\small\\text{— encontrar lo rojo}`);
                btnI.disabled = false;
            }
        }
    }
}

function setupLiveHints(): void {
    const ids = [
        'inputTInterpGl', 'inputTInterpAlpha', 'inputTInvGl', 'inputTInvT',
        'inputChiInterpGl', 'inputChiInterpAlpha', 'inputChiInvGl', 'inputChiInvChi',
        'inputFInterpV1', 'inputFInterpV2',
        'inputGammaInterpAlpha', 'inputGammaInterpP', 'inputGammaInvAlpha', 'inputGammaInvX'
    ];
    ids.forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateLiveHints);
    });
}

function closeLightbox() {
    const lightbox = document.getElementById('lightboxOverlay');
    if(lightbox) {
        lightbox.classList.add('opacity-0');
        setTimeout(() => lightbox.classList.add('hidden'), 300);
    }
}

function showBilinearResult(resId: string, bdId: string, label: string, targetRow: number, targetAlpha: number, result: ReturnType<typeof interpolateBilinear>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'Err'; return; }
    
    renderKaTeXInto(resEl, `${label} \\approx ${result.val.toFixed(4)}`, false);
    let lupaHtml = '';
    if (result.resLo && currentTable.meta?.columns) {
        const cols = (currentTable.meta.columns || []).map(Number);
        let loColIdx = -1;
        let minD = Infinity;
        // Just pick the closest column to center the lupa on
        for (let i = 0; i < cols.length; i++) {
            const d = Math.abs(cols[i] - targetAlpha);
            if (d < minD) { minD = d; loColIdx = i; }
        }
        if (loColIdx !== -1) {
            lupaHtml = buildMiniLupaTable(currentTable, result.resLo.lo.key, result.resLo.hi.key, targetRow, loColIdx);
        }
    }

    const tableHtml = `
        <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
            ${lupaHtml}
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Interpolación Doble (Bilineal)</p>
            <div class="overflow-x-auto w-full mb-4">
                <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                    <thead class="bg-indigo-50 dark:bg-indigo-900/30">
                        <tr><th>Paso</th><th>Punto α</th><th>Valor Interp. en fila</th></tr>
                    </thead>
                    <tbody>
                        <tr class="border-b border-slate-100 dark:border-slate-700">
                            <td class="font-semibold text-slate-500">Col Izq.</td>
                            <td>${result.aLo}</td><td>${result.vLo.toFixed(4)}</td>
                        </tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700">
                            <td class="font-semibold text-slate-500">Col Der.</td>
                            <td>${result.aHi}</td><td>${result.vHi.toFixed(4)}</td>
                        </tr>
                        <tr class="bg-indigo-50/50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400">
                            <td>Final</td>
                            <td>${targetAlpha}</td><td>${result.val.toFixed(4)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo de interpolación entre columnas</p>
            <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
        </div>
    `;
    bdEl.innerHTML = tableHtml;
    const formulaEl = document.getElementById(bdId + '_formula')!;
    renderKaTeXInto(formulaEl, `\\begin{aligned} ${label} &= ${result.vLo.toFixed(4)} + \\dfrac{${targetAlpha} - ${result.aLo}}{${result.aHi} - ${result.aLo}} \\cdot (${result.vHi.toFixed(4)} - ${result.vLo.toFixed(4)}) \\\\ &\\approx ${result.val.toFixed(4)} \\end{aligned}`, true);
}

function interpolateT(): void {
    const gl = parseFloat((document.getElementById('inputTInterpGl') as HTMLInputElement).value);
    const alpha = parseFloat((document.getElementById('inputTInterpAlpha') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(alpha)) { document.getElementById('resInterpT')!.textContent = 'Err: completa campos'; return; }
    // Show formula hint: P(T > x) = α  → find x (in red)
    showFormulaHint('resInterpT', `P(T_{${gl}} > {\\color{red}x}) = ${alpha} \\quad \\small\\text{— encontrar lo rojo}`);
    
    const colsInfo = findCols(currentTable, alpha);
    if (colsInfo.exact) {
        const result = interpolateBetweenRows(currentTable, gl, colsInfo.exactIdx);
        showInterpResult('resInterpT', 'breakdownInterpT', 't_{\\alpha,gl}', gl, 'gl', result, colsInfo.exactIdx);
    } else {
        const result = interpolateBilinear(currentTable, gl, alpha, colsInfo);
        showBilinearResult('resInterpT', 'breakdownInterpT', 't_{\\alpha,gl}', gl, alpha, result);
    }
}

function interpolateChi(): void {
    const gl = parseFloat((document.getElementById('inputChiInterpGl') as HTMLInputElement).value);
    const alpha = parseFloat((document.getElementById('inputChiInterpAlpha') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(alpha)) { document.getElementById('resInterpChi')!.textContent = 'Err: completa campos'; return; }
    // Show formula hint: P(χ² > x) = α  → find x (in red)
    showFormulaHint('resInterpChi', `P(\\chi^2_{${gl}} > {\\color{red}x}) = ${alpha} \\quad \\small\\text{— encontrar lo rojo}`);
    
    const colsInfo = findCols(currentTable, alpha);
    if (colsInfo.exact) {
        const result = interpolateBetweenRows(currentTable, gl, colsInfo.exactIdx);
        showInterpResult('resInterpChi', 'breakdownInterpChi', '\\chi^2_{\\alpha,gl}', gl, 'gl', result, colsInfo.exactIdx);
    } else {
        const result = interpolateBilinear(currentTable, gl, alpha, colsInfo);
        showBilinearResult('resInterpChi', 'breakdownInterpChi', '\\chi^2_{\\alpha,gl}', gl, alpha, result);
    }
}

function interpolateF(): void {
    const v2 = parseFloat((document.getElementById('inputFInterpV2') as HTMLInputElement).value);
    const v1 = parseFloat((document.getElementById('inputFInterpV1') as HTMLInputElement).value);
    if (isNaN(v2) || isNaN(v1)) { document.getElementById('resInterpF')!.textContent = 'Err: completa campos'; return; }
    const alphaF = currentTable.meta?.extraDims?.alpha || '?';
    // Show formula hint: P(F > x) = α  → find x (in red)
    showFormulaHint('resInterpF', `P(F_{${Math.round(v1)},${v2}} > {\\color{red}x}) = ${alphaF} \\quad \\small\\text{— encontrar lo rojo}`);
    const cols = currentTable.meta?.columns || [];
    let colIdx = 0, minD = Infinity;
    cols.forEach((c, i) => { const d = Math.abs(Number(c) - v1); if (d < minD) { minD = d; colIdx = i; } });
    const result = interpolateBetweenRows(currentTable, v2, colIdx);
    showInterpResult('resInterpF', 'breakdownInterpF', `F_{\\nu_1=${Math.round(v1)},\\nu_2}`, v2, '\\nu_2', result, colIdx);
}

function interpolateGamma(): void {
    const alpha = parseFloat((document.getElementById('inputGammaInterpAlpha') as HTMLInputElement).value);
    const p = parseFloat((document.getElementById('inputGammaInterpP') as HTMLInputElement).value);
    if (isNaN(alpha) || isNaN(p)) { document.getElementById('resInterpGamma')!.textContent = 'Err: completa campos'; return; }
    // Show formula hint: P(X ≤ x) = p  → find x (in red)
    showFormulaHint('resInterpGamma', `P(X_{\\alpha=${alpha}} \\le {\\color{red}x}) = ${p} \\quad \\small\\text{— encontrar lo rojo}`);
    
    const colsInfo = findCols(currentTable, p);
    if (colsInfo.exact) {
        const result = interpolateBetweenRows(currentTable, alpha, colsInfo.exactIdx);
        showInterpResult('resInterpGamma', 'breakdownInterpGamma', 'x_{\\alpha,p}', alpha, '\\alpha', result, colsInfo.exactIdx);
    } else {
        const result = interpolateBilinear(currentTable, alpha, p, colsInfo);
        showBilinearResult('resInterpGamma', 'breakdownInterpGamma', 'x_{\\alpha,p}', alpha, p, result);
    }
}

/* =============================================
   Properties Drawer Modal
   ============================================= */

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
    title.textContent = `Propiedades — ${currentTable.name}`;
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


function sec(t: string, b: string): string { return `<div class="props-section mb-6"> <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-2 border-b border-slate-200 dark:border-slate-700 pb-1">📐 ${t}</h4> <div class="overflow-x-auto w-full whitespace-normal break-words sm:break-normal">${b}</div> </div>`; }

function fm(tex: string): string { return `<div class="props-formula py-2 text-center overflow-x-auto" data-tex="${tex.replace(/"/g, '&quot;')}"></div>`; }

function li(items: string[]): string { 
    return `<ul class="props-list list-disc pl-5 space-y-2 text-sm">` + items.map(i => {
        let text = i;
        const k = getKatex();
        if (k && k.renderToString) {
            text = text.replace(/\$(.*?)\$/g, (match, tex) => {
                try {
                    return k.renderToString!(tex, { displayMode: false, throwOnError: false });
                } catch {
                    return match;
                }
            });
        }
        return `<li class="break-words whitespace-normal">` + text + `</li>`;
    }).join('') + `</ul>`;
}

function getPropsContent(type: string): string {
    if (type === 'normal') return propsNormal();
    if (type === 't') return propsT();
    if (type === 'chi') return propsChi();
    if (type === 'f') return propsF();
    if (type === 'gamma') return propsGamma();
    return '<p>Sin propiedades.</p>';
}

function propsNormal(): string {
    return sec('Función de Densidad', fm('f(x) = \\frac{1}{\\sqrt{2\\pi}} e^{-x^2/2}'))
    + sec('Esperanza y Varianza', fm('E[X] = 0, \\quad \\text{Var}(X) = 1'))
    + sec('Func. Generadora de Momentos', fm('M_X(t) = e^{t^2/2}'))
    + sec('Teoremas y Propiedades', li([
        '<b>TCL:</b> Si $X_1,...,X_n$ i.i.d. con media $\\mu$ y var $\\sigma^2$, $\\bar{X} \\xrightarrow{d} N(\\mu, \\sigma^2/n)$',
        '<b>Simetría:</b> $P(Z \\le z) = 1 - P(Z \\le -z)$',
        '<b>Estandarización:</b> $Z = (X-\\mu)/\\sigma \\sim N(0,1)$',
        '<b>Independencia:</b> $\\bar{X}$ y $S^2$ son independientes bajo normalidad',
        '<b>Reproductiva:</b> $X_1+X_2 \\sim N(\\mu_1+\\mu_2, \\sigma_1^2+\\sigma_2^2)$ si independientes',
        '<b>68-95-99.7:</b> $P(|Z|\\le1)\\approx0.683$, $P(|Z|\\le2)\\approx0.954$, $P(|Z|\\le3)\\approx0.997$',
        '<b>Completitud:</b> La normal es completa y suficiente',
    ]));
}

function propsT(): string {
    return sec('Función de Densidad', fm('f(t) = \\frac{\\Gamma((\\nu+1)/2)}{\\sqrt{\\nu\\pi}\\Gamma(\\nu/2)} (1+t^2/\\nu)^{-(\\nu+1)/2}'))
    + sec('Esperanza y Varianza', fm('E[T]=0\\;(\\nu>1), \\quad \\text{Var}(T)=\\nu/(\\nu-2)\\;(\\nu>2)'))
    + sec('Construcción', li([
        '<b>Def:</b> Si $Z\\sim N(0,1)$ y $V\\sim\\chi^2(\\nu)$ son <b>independientes</b>, $T=Z/\\sqrt{V/\\nu}\\sim t(\\nu)$',
    ]))
    + sec('Teoremas y Propiedades', li([
        '<b>Convergencia:</b> $t(\\nu) \\to N(0,1)$ cuando $\\nu\\to\\infty$',
        '<b>Simetría:</b> $f(t) = f(-t)$',
        '<b>Colas pesadas:</b> Mayor curtosis que la normal',
        '<b>Relación con F:</b> $T^2 \\sim F(1, \\nu)$',
        '<b>Student-Fisher:</b> $T=(\\bar{X}-\\mu)/(S/\\sqrt{n}) \\sim t(n-1)$ donde $\\bar{X}$ y $S^2$ son independientes',
        '<b>Independencia:</b> La construcción requiere que $Z$ y $V$ sean independientes',
        '<b>MGF:</b> No existe en forma cerrada',
    ]));
}

function propsChi(): string {
    return sec('Función de Densidad', fm('f(x) = \\frac{x^{k/2-1}e^{-x/2}}{2^{k/2}\\Gamma(k/2)}, \\; x>0'))
    + sec('Esperanza y Varianza', fm('E[X]=k, \\quad \\text{Var}(X)=2k'))
    + sec('Func. Generadora de Momentos', fm('M_X(t) = (1-2t)^{-k/2}'))
    + sec('Construcción', li([
        '<b>Def:</b> $\\chi^2 = \\sum Z_i^2$ donde $Z_i\\sim N(0,1)$ <b>independientes</b>',
    ]))
    + sec('Teoremas y Propiedades', li([
        '<b>Aditiva:</b> $\\chi^2(k_1)+\\chi^2(k_2)\\sim\\chi^2(k_1+k_2)$ si <b>independientes</b>',
        '<b>Rel. con Gamma:</b> $\\chi^2(k) = \\text{Gamma}(k/2, 2)$',
        '<b>Cochran:</b> Descompone formas cuadráticas en $\\chi^2$ independientes',
        '<b>Varianza muestral:</b> $(n-1)S^2/\\sigma^2 \\sim \\chi^2(n-1)$, independiente de $\\bar{X}$',
        '<b>Bondad de ajuste:</b> $\\sum(O_i-E_i)^2/E_i \\sim \\chi^2(k-1)$',
        '<b>Convergencia:</b> $\\chi^2(k) \\approx N(k, 2k)$ para $k$ grande',
        '<b>Asimetría:</b> Asimétrica positiva, se simetriza con $k$ grande',
    ]));
}

function propsF(): string {
    return sec('Función de Densidad', fm('f(x) = \\frac{\\sqrt{(d_1 x)^{d_1} d_2^{d_2} / (d_1 x+d_2)^{d_1+d_2}}}{x\\,B(d_1/2,d_2/2)}'))
    + sec('Esperanza y Varianza', fm('E[F]=\\frac{d_2}{d_2-2}, \\; \\text{Var}=\\frac{2d_2^2(d_1+d_2-2)}{d_1(d_2-2)^2(d_2-4)}'))
    + sec('Construcción', li([
        '<b>Def:</b> $F=(U/d_1)/(V/d_2)$ donde $U\\sim\\chi^2(d_1)$, $V\\sim\\chi^2(d_2)$ <b>independientes</b>',
    ]))
    + sec('Teoremas y Propiedades', li([
        '<b>Rel. con t:</b> $T^2 \\sim F(1,\\nu)$',
        '<b>Recíproco:</b> $1/F \\sim F(d_2,d_1)$',
        '<b>Convergencia:</b> $d_1 F \\to \\chi^2(d_1)$ cuando $d_2\\to\\infty$',
        '<b>ANOVA:</b> Compara varianzas de grupos con muestras independientes',
        '<b>Test varianzas:</b> $S_1^2/S_2^2 \\sim F(n_1-1,n_2-1)$ si muestras independientes y normales',
        '<b>Asimetría:</b> Asimétrica derecha, $F(d_1,d_2) \\ne F(d_2,d_1)$',
        '<b>Independencia:</b> $U$ y $V$ deben ser independientes',
    ]));
}

function propsGamma(): string {
    return sec('Función de Densidad', fm('f(x) = \\frac{\\beta^\\alpha}{\\Gamma(\\alpha)} x^{\\alpha-1} e^{-\\beta x}, \\; x>0'))
    + sec('Esperanza y Varianza', fm('E[X]=\\alpha/\\beta, \\quad \\text{Var}(X)=\\alpha/\\beta^2'))
    + sec('Func. Generadora de Momentos', fm('M_X(t)=(\\beta/(\\beta-t))^\\alpha'))
    + sec('Casos Especiales', li([
        '<b>Exponencial:</b> $\\text{Gamma}(1,\\beta) = \\text{Exp}(\\beta)$',
        '<b>Chi-cuadrado:</b> $\\chi^2(k) = \\text{Gamma}(k/2, 1/2)$',
        '<b>Erlang:</b> $\\text{Gamma}(n,\\beta)$ con $n$ entero',
    ]))
    + sec('Función Gamma Γ', li([
        '<b>Def:</b> $\\Gamma(\\alpha)=\\int_0^\\infty x^{\\alpha-1}e^{-x}dx$',
        '<b>Recursividad:</b> $\\Gamma(\\alpha+1)=\\alpha\\Gamma(\\alpha)$',
        '<b>Enteros:</b> $\\Gamma(n)=(n-1)!$',
        '<b>Especial:</b> $\\Gamma(1/2)=\\sqrt{\\pi}$',
        '<b>Duplicación:</b> $\\Gamma(z)\\Gamma(z+1/2)=\\sqrt{\\pi}\\Gamma(2z)/2^{2z-1}$',
    ]))
    + sec('Teoremas y Propiedades', li([
        '<b>Aditiva:</b> $\\text{Gamma}(\\alpha_1,\\beta)+\\text{Gamma}(\\alpha_2,\\beta)\\sim\\text{Gamma}(\\alpha_1+\\alpha_2,\\beta)$ si <b>independientes</b>, mismo $\\beta$',
        '<b>Independencia:</b> Requiere variables independientes y mismo parámetro de escala',
        '<b>Conjugada:</b> Previa conjugada para tasa Poisson y precisión Normal',
        '<b>Convergencia:</b> $\\approx N(\\alpha/\\beta, \\alpha/\\beta^2)$ para $\\alpha$ grande',
        '<b>Memorylessness:</b> Solo $\\alpha=1$ (exponencial) tiene falta de memoria',
        '<b>Escalamiento:</b> $cX \\sim \\text{Gamma}(\\alpha, \\beta/c)$',
    ]));
}

/* =============================================
   Interpolación Inversa para tablas (columnas)
   ============================================= */


function interpolateInverseRow(table: DistTable, targetRow: number, targetVal: number): { val: number; lo: { a: number; v: number }; hi: { a: number; v: number }; exact: boolean; approxGl: string; isClamped?: boolean; rawVal?: number; outOfBounds?: string; limitApproaches?: number; boundObj?: any } | null {
    const rows = getSortedRowKeys(table);
    if (rows.length === 0) return null;
    let rKey = rows[0].key;
    let bestDist = Infinity;
    for(const r of rows) {
        if(Math.abs(r.num - targetRow) < bestDist) {
            bestDist = Math.abs(r.num - targetRow);
            rKey = r.key;
        }
    }
    
    const rowVals = table.rowData[rKey];
    const alphas = (table.meta?.columns || []).map(Number);
    let parsedVals = rowVals.map(Number);
    let pairs = alphas.map((a, i) => ({ a, v: parsedVals[i] })).sort((A, B) => A.v - B.v);
    
    for(let i = 0; i < pairs.length; i++) {
        if (Math.abs(pairs[i].v - targetVal) < 1e-9) {
            return { val: pairs[i].a, lo: pairs[i], hi: pairs[i], exact: true, approxGl: rKey };
        }
    }
    
    // Check constraints: DO NOT INTERPOLATE IF OUT OF BOUNDS
    if (targetVal < pairs[0].v) {
        const isDesc = pairs[0].a > pairs[pairs.length - 1].a;
        return { exact: false, outOfBounds: 'below', boundObj: pairs[0], approxGl: rKey, limitApproaches: isDesc ? 1 : 0 } as any;
    } 
    if (targetVal > pairs[pairs.length - 1].v) {
        const isDesc = pairs[0].a > pairs[pairs.length - 1].a;
        return { exact: false, outOfBounds: 'above', boundObj: pairs[pairs.length - 1], approxGl: rKey, limitApproaches: isDesc ? 0 : 1 } as any;
    }

    let lo = pairs[0], hi = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
        if (targetVal >= pairs[i].v && targetVal <= pairs[i+1].v) {
            lo = pairs[i]; hi = pairs[i+1]; break;
        }
    }
    
    if(hi.v === lo.v) return { val: lo.a, lo, hi, exact: true, approxGl: rKey, isClamped: false, rawVal: lo.a };
    
    // Linearly interpolate inside bounds
    const rawVal = lo.a + ((targetVal - lo.v) / (hi.v - lo.v)) * (hi.a - lo.a);
    
    // Final sanity check for probability domain
    let finalVal = rawVal;
    let isClamped = false;
    if (finalVal < 0) { finalVal = 0; isClamped = true; }
    if (finalVal > 1) { finalVal = 1; isClamped = true; }
    
    return { val: finalVal, lo, hi, exact: false, approxGl: rKey, isClamped, rawVal };
}



function showInvInterpResult(resId: string, bdId: string, label: string, targetVal: number, result: ReturnType<typeof interpolateInverseRow>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const res = result as any;

    if (res.outOfBounds) {
        const signVal = res.limitApproaches === 1 ? '>' : '<';
        const displayLabel = label.replace(/\\/g, ''); // strip out common latex slashes for html presentation if needed
        renderKaTeXInto(resEl, `${label} \\approx ${res.limitApproaches}`, false);
        
        const tableHtml = `
            <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-left">Restricción de Dominio (Fuera de Tabla)</p>
                <div class="overflow-x-auto w-full mb-4">
                    <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                        <thead class="bg-red-50 dark:bg-red-900/30">
                            <tr><th>Valor Buscado</th><th>Límite de Tabla</th><th>Res. Extrapolado</th></tr>
                        </thead>
                        <tbody>
                            <tr class="bg-red-50/50 dark:bg-red-900/20 font-semibold text-red-700 dark:text-red-400">
                                <td>${targetVal.toFixed(4)}</td>
                                <td>${res.outOfBounds === 'below' ? '< ' : '> '}${res.boundObj.v.toFixed(4)}</td>
                                <td>≈ ${res.limitApproaches}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="text-sm text-center mb-4 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                    <strong>Error de Dominio:</strong> El valor ingresado está fuera de los límites numéricos cubiertos por la tabla. No aplica Método de Interpolación Lineal. En su lugar, el límite tiende lógicamente a <strong>${res.limitApproaches}</strong>.
                </div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-left">Límite asintótico</p>
                <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal mb-2"></div>
            </div>
        `;
        bdEl.innerHTML = tableHtml;
        const formulaEl = document.getElementById(bdId + '_formula')!;
        renderKaTeXInto(formulaEl, `\\begin{aligned} \\text{Dado que } x = ${targetVal} ${res.outOfBounds === 'below' ? '<' : '>'} ${res.boundObj.v.toFixed(4)} \\\\ \\implies ${label} ${signVal} ${res.boundObj.a} \\implies ${label} \\approx ${res.limitApproaches} \\end{aligned}`, true);
        return;
    }

    const { val, lo, hi, exact, approxGl, isClamped, rawVal } = res;
    renderKaTeXInto(resEl, `${label} \\approx ${val.toPrecision(4)}`, false);
    
    let breakdownBody = '';
    let calcFormula = '';
    
    if (exact) {
        breakdownBody = `
            <tr class="bg-emerald-50/50 dark:bg-emerald-900/20 font-semibold text-emerald-700 dark:text-emerald-400">
                <td colspan="2">Punto Exacto (Sin Regla de 3)</td>
                <td>${val.toFixed(4)}</td>
            </tr>
        `;
        calcFormula = `\\begin{aligned} ${label} &= \\text{Valor extraído directamente} \\\\ &\\approx ${val.toPrecision(4)} \\end{aligned}`;
    } else {
        const rows = [
            { label: 'Ref. 1', v: lo.v, a: lo.a, isTarget: false },
            { label: 'Buscado', v: targetVal, a: Number(rawVal.toPrecision(4)), isTarget: true },
            { label: 'Ref. 2', v: hi.v, a: hi.a, isTarget: false }
        ];
        rows.sort((A, B) => A.v - B.v);

        breakdownBody = rows.map((r, i) => {
            const isLast = i === rows.length - 1;
            const trClass = r.isTarget 
                ? 'bg-indigo-50/50 dark:bg-indigo-900/20 font-semibold text-indigo-700 dark:text-indigo-400' 
                : (isLast ? '' : 'border-b border-slate-100 dark:border-slate-700');
            const tdLabelClass = r.isTarget ? '' : 'font-semibold text-slate-500';
            const displayV = r.isTarget ? targetVal : r.v.toFixed(4);
            const displayA = r.isTarget ? rawVal.toPrecision(4) : r.a;
            
            return `
                <tr class="${trClass}">
                    <td class="${tdLabelClass}">${r.label}</td>
                    <td>${displayV}</td><td>${displayA}</td>
                </tr>
            `;
        }).join('');
        
        calcFormula = `\\begin{aligned} ${label} &= ${lo.a} + \\dfrac{${targetVal} - ${lo.v.toFixed(4)}}{${hi.v.toFixed(4)} - ${lo.v.toFixed(4)}} \\cdot (${hi.a} - ${lo.a}) \\\\ &\\approx ${rawVal.toPrecision(4)} \\end{aligned}`;
    }

    let lupaHtml = '';
    if (currentTable.meta?.columns) {
        lupaHtml = buildMiniLupaTableInverse(currentTable, approxGl, lo.a, exact ? lo.a : hi.a, targetVal);
    }

    const tableHtml = `
        <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
            ${lupaHtml}
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-left">Desglose Regla de Tres ${exact ? '(Punto Exacto)' : ''}</p>
            <div class="overflow-x-auto w-full mb-4">
                <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                    <thead class="${exact ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}">
                        <tr><th>Punto</th><th>Valor en tabla</th><th>α / p</th></tr>
                    </thead>
                    <tbody>
                        ${breakdownBody}
                    </tbody>
                </table>
            </div>
            ${exact ? `
            <div class="text-sm text-center mb-4 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                El valor coincide con un punto exacto en la tabla, no requiere interpolación. (gl ≈ ${approxGl})
            </div>` : `
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 text-left">Cálculo con Regla de 3</p>`}
            <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal mb-2"></div>
            ${isClamped ? `
            <div class="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-center text-xs">
                <strong>Aviso:</strong> El cálculo (${rawVal.toPrecision(4)}) superó los límites válidos de probabilidad. El resultado se ha acotado metodológicamente a [0, 1].
            </div>
            ` : ''}
        </div>
    `;
    bdEl.innerHTML = tableHtml;
    const formulaEl = document.getElementById(bdId + '_formula')!;
    renderKaTeXInto(formulaEl, calcFormula, true);
}

function interpolateTInverse(): void {
    const gl = parseFloat((document.getElementById('inputTInvGl') as HTMLInputElement).value);
    const t = parseFloat((document.getElementById('inputTInvT') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(t)) return;
    showFormulaHint('resInvInterpT', `P(T_{${gl}} > ${Math.abs(t)}) = {\\color{red}\\alpha} \\quad \\small\\text{— encontrar lo rojo}`);
    const result = interpolateInverseRow(currentTable, gl, Math.abs(t));
    showInvInterpResult('resInvInterpT', 'breakdownInvInterpT', '\\alpha', Math.abs(t), result);
}

function interpolateChiInverse(): void {
    const gl = parseFloat((document.getElementById('inputChiInvGl') as HTMLInputElement).value);
    const chi = parseFloat((document.getElementById('inputChiInvChi') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(chi)) return;
    showFormulaHint('resInvInterpChi', `P(\\chi^2_{${gl}} > ${chi}) = {\\color{red}\\alpha} \\quad \\small\\text{— encontrar lo rojo}`);
    const result = interpolateInverseRow(currentTable, gl, chi);
    showInvInterpResult('resInvInterpChi', 'breakdownInvInterpChi', '\\alpha', chi, result);
}

function interpolateGammaInverse(): void {
    const alpha = parseFloat((document.getElementById('inputGammaInvAlpha') as HTMLInputElement).value);
    const x = parseFloat((document.getElementById('inputGammaInvX') as HTMLInputElement).value);
    if (isNaN(alpha) || isNaN(x)) return;
    showFormulaHint('resInvInterpGamma', `P(X_{\\alpha=${alpha}} \\le ${x}) = {\\color{red}p} \\quad \\small\\text{— encontrar lo rojo}`);
    const result = interpolateInverseRow(currentTable, alpha, x);
    showInvInterpResult('resInvInterpGamma', 'breakdownInvInterpGamma', 'p', x, result);
}
