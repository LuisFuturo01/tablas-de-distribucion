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

function showBreakdownP(z0: number, p0: number, z: number, p: number, z1: number, p1: number, exact: boolean): void {
    openPanelP();
    const body = document.getElementById('pBreakdownBody')!;
    const midPVal = fmtP(p);
    const midPNote = exact
        ? '<span class="text-[11px] font-normal opacity-90">(exacto en tabla)</span>'
        : '<span class="text-[11px] font-normal opacity-90">(interpolado)</span>';
    body.innerHTML = `
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
    body.innerHTML = `
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
        // Pure numeric — compute Gamma directly
        const num = parseFloat(raw);
        if (isNaN(num)) { resEl.textContent = 'Expresión no válida'; return; }
        if (num <= 0 && Number.isInteger(num)) { resEl.textContent = 'Γ no definida para enteros ≤ 0'; return; }

        const result = lanczosGamma(num);
        if (Number.isInteger(num) && num > 0) {
            let factorial = 1; for (let i = 2; i < num; i++) factorial *= i;
            renderKaTeXInto(resEl, `\\Gamma(${num}) = ${Math.round(num) - 1}! = ${factorial}`, false);
        } else if (Math.abs(num - 0.5) < 1e-10) {
            renderKaTeXInto(resEl, `\\Gamma(0.5) = \\sqrt{\\pi} \\approx ${Math.sqrt(Math.PI).toPrecision(10)}`, false);
        } else {
            renderKaTeXInto(resEl, `\\Gamma(${num}) \\approx ${result.toPrecision(10)}`, false);
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



function showInterpResult(resId: string, bdId: string, label: string, targetRow: number, rowLabel: string, result: ReturnType<typeof interpolateBetweenRows>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const { val, lo, hi, exact } = result;
    renderKaTeXInto(resEl, `${label} \\approx ${val.toFixed(4)}`, false);
    
    if (exact) {
        renderKaTeXInto(bdEl, `\\text{Valor exacto en tabla}`, true);
    } else {
        let rawLabel = rowLabel;
        if(rawLabel === '\\nu_2') rawLabel = 'ν₂';
        if(rawLabel === '\\nu_1') rawLabel = 'ν₁';
        if(rawLabel === '\\alpha') rawLabel = 'α';

        const tableHtml = `
            <div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 w-full text-left">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Desglose Regla de Tres Proporcional</p>
                <div class="overflow-x-auto w-full mb-4">
                    <table class="breakdown-table w-full text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-center">
                        <thead class="bg-slate-100 dark:bg-slate-700">
                            <tr><th>Punto</th><th class="whitespace-nowrap">${rawLabel}</th><th class="whitespace-nowrap">Resolución</th></tr>
                        </thead>
                        <tbody>
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
                        </tbody>
                    </table>
                </div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo con valores sustituidos</p>
                <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
            </div>
        `;
        bdEl.innerHTML = tableHtml;
        const formulaEl = document.getElementById(bdId + '_formula')!;
        renderKaTeXInto(formulaEl, `\\begin{aligned} ${label} &= ${lo.v.toFixed(4)} + \\dfrac{${targetRow} - ${lo.num}}{${hi.num} - ${lo.num}} \\cdot (${hi.v.toFixed(4)} - ${lo.v.toFixed(4)}) \\\\ &\\approx ${val.toFixed(4)} \\end{aligned}`, true);
    }
}
function interpolateT(): void {
    const gl = parseFloat((document.getElementById('inputTInterpGl') as HTMLInputElement).value);
    const alpha = parseFloat((document.getElementById('inputTInterpAlpha') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(alpha)) { document.getElementById('resInterpT')!.textContent = 'Err: completa campos'; return; }
    const colIdx = findColIdx(currentTable, alpha);
    const result = interpolateBetweenRows(currentTable, gl, colIdx);
    showInterpResult('resInterpT', 'breakdownInterpT', 't_{\\alpha,gl}', gl, 'gl', result);
}

function interpolateChi(): void {
    const gl = parseFloat((document.getElementById('inputChiInterpGl') as HTMLInputElement).value);
    const alpha = parseFloat((document.getElementById('inputChiInterpAlpha') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(alpha)) { document.getElementById('resInterpChi')!.textContent = 'Err: completa campos'; return; }
    const colIdx = findColIdx(currentTable, alpha);
    const result = interpolateBetweenRows(currentTable, gl, colIdx);
    showInterpResult('resInterpChi', 'breakdownInterpChi', '\\chi^2_{\\alpha,gl}', gl, 'gl', result);
}

function interpolateF(): void {
    const v2 = parseFloat((document.getElementById('inputFInterpV2') as HTMLInputElement).value);
    const v1 = parseFloat((document.getElementById('inputFInterpV1') as HTMLInputElement).value);
    if (isNaN(v2) || isNaN(v1)) { document.getElementById('resInterpF')!.textContent = 'Err: completa campos'; return; }
    const cols = currentTable.meta?.columns || [];
    let colIdx = 0, minD = Infinity;
    cols.forEach((c, i) => { const d = Math.abs(Number(c) - v1); if (d < minD) { minD = d; colIdx = i; } });
    const result = interpolateBetweenRows(currentTable, v2, colIdx);
    showInterpResult('resInterpF', 'breakdownInterpF', `F_{\\nu_1=${Math.round(v1)},\\nu_2}`, v2, '\\nu_2', result);
}

function interpolateGamma(): void {
    const alpha = parseFloat((document.getElementById('inputGammaInterpAlpha') as HTMLInputElement).value);
    const p = parseFloat((document.getElementById('inputGammaInterpP') as HTMLInputElement).value);
    if (isNaN(alpha) || isNaN(p)) { document.getElementById('resInterpGamma')!.textContent = 'Err: completa campos'; return; }
    const colIdx = findColIdx(currentTable, p);
    const result = interpolateBetweenRows(currentTable, alpha, colIdx);
    showInterpResult('resInterpGamma', 'breakdownInterpGamma', 'x_{\\alpha,p}', alpha, '\\alpha', result);
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
                    return k.renderToString(tex, { displayMode: false, throwOnError: false });
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

    document.getElementById('btnInvInterpT')?.addEventListener('click', interpolateTInverse);
    document.getElementById('btnInvInterpChi')?.addEventListener('click', interpolateChiInverse);
    document.getElementById('btnInvInterpGamma')?.addEventListener('click', interpolateGammaInverse);
    
    // Lightbox
    document.querySelectorAll('#imageContainer img').forEach(img => {
        img.addEventListener('click', () => {
            const lightbox = document.getElementById('lightboxOverlay');
            const lightboxImg = document.getElementById('lightboxImg');
            if(lightbox && lightboxImg) {
                lightboxImg.setAttribute('src', img.getAttribute('src') || '');
                lightbox.classList.remove('hidden');
                requestAnimationFrame(() => {
                    lightbox.classList.remove('opacity-0');
                    lightboxImg.classList.remove('scale-95');
                });
            }
        });
    });
    document.getElementById('closeLightbox')?.addEventListener('click', closeLightbox);
    document.getElementById('lightboxOverlay')?.addEventListener('click', (e) => {
        if(e.target === e.currentTarget) closeLightbox();
    });




/* =============================================
   Interpolación Inversa para tablas (columnas)
   ============================================= */
function closeLightbox() {
    const lightbox = document.getElementById('lightboxOverlay');
    const lightboxImg = document.getElementById('lightboxImg');
    if(lightbox && lightboxImg) {
        lightbox.classList.add('opacity-0');
        lightboxImg.classList.add('scale-95');
        setTimeout(() => lightbox.classList.add('hidden'), 300);
    }
}

function interpolateInverseRow(table: DistTable, targetRow: number, targetVal: number): { val: number; lo: { a: number; v: number }; hi: { a: number; v: number }; exact: boolean; approxGl: string } | null {
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
    
    let lo = pairs[0], hi = pairs[pairs.length - 1];
    for (let i = 0; i < pairs.length - 1; i++) {
        if (targetVal >= pairs[i].v && targetVal <= pairs[i+1].v) {
            lo = pairs[i]; hi = pairs[i+1]; break;
        }
    }
    if(hi.v === lo.v) return { val: lo.a, lo, hi, exact: true, approxGl: rKey };
    
    const val = lo.a + ((targetVal - lo.v) / (hi.v - lo.v)) * (hi.a - lo.a);
    return { val, lo, hi, exact: false, approxGl: rKey };
}



function showInvInterpResult(resId: string, bdId: string, label: string, targetVal: number, result: ReturnType<typeof interpolateInverseRow>): void {
    const resEl = document.getElementById(resId)!;
    const bdEl = document.getElementById(bdId)!;
    if (!result) { resEl.textContent = 'No encontrado'; bdEl.textContent = ''; return; }
    
    const { val, lo, hi, exact, approxGl } = result;
    renderKaTeXInto(resEl, `${label} \\approx ${val.toPrecision(4)}`, false);
    
    if (exact) {
        renderKaTeXInto(bdEl, `\\text{Exacto en tabla para gl } \\approx ${approxGl}`, true);
    } else {
        const tableHtml = `
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
                                <td>${lo.v.toFixed(4)}</td><td>${lo.a.toPrecision(4)}</td>
                            </tr>
                            <tr class="bg-teal-50/50 dark:bg-teal-900/20 font-semibold text-teal-700 dark:text-teal-400">
                                <td>Buscado</td>
                                <td>${targetVal.toFixed(4)}</td><td>${val.toPrecision(4)}</td>
                            </tr>
                            <tr>
                                <td class="font-semibold text-slate-500">Der.</td>
                                <td>${hi.v.toFixed(4)}</td><td>${hi.a.toPrecision(4)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Cálculo con valores sustituidos</p>
                <div id="${bdId}_formula" class="text-sm text-center bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-normal break-words sm:break-normal"></div>
            </div>
        `;
        bdEl.innerHTML = tableHtml;
        const formulaEl = document.getElementById(bdId + '_formula')!;
        renderKaTeXInto(formulaEl, `\\begin{aligned} ${label} &= ${lo.a.toPrecision(4)} + \\dfrac{${targetVal.toFixed(4)} - ${lo.v.toFixed(4)}}{${hi.v.toFixed(4)} - ${lo.v.toFixed(4)}} \\cdot (${hi.a.toPrecision(4)} - ${lo.a.toPrecision(4)}) \\\\ &\\approx ${val.toPrecision(4)} \\end{aligned}`, true);
    }
}
function interpolateTInverse(): void {
    const gl = parseFloat((document.getElementById('inputTInvGl') as HTMLInputElement).value);
    const t = parseFloat((document.getElementById('inputTInvT') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(t)) return;
    const result = interpolateInverseRow(currentTable, gl, Math.abs(t));
    showInvInterpResult('resInvInterpT', 'breakdownInvInterpT', '\\alpha', Math.abs(t), result);
}

function interpolateChiInverse(): void {
    const gl = parseFloat((document.getElementById('inputChiInvGl') as HTMLInputElement).value);
    const chi = parseFloat((document.getElementById('inputChiInvChi') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(chi)) return;
    const result = interpolateInverseRow(currentTable, gl, chi);
    showInvInterpResult('resInvInterpChi', 'breakdownInvInterpChi', '\\alpha', chi, result);
}

function interpolateGammaInverse(): void {
    const alpha = parseFloat((document.getElementById('inputGammaInvAlpha') as HTMLInputElement).value);
    const x = parseFloat((document.getElementById('inputGammaInvX') as HTMLInputElement).value);
    if (isNaN(alpha) || isNaN(x)) return;
    const result = interpolateInverseRow(currentTable, alpha, x);
    showInvInterpResult('resInvInterpGamma', 'breakdownInvInterpGamma', 'p', x, result);
}
