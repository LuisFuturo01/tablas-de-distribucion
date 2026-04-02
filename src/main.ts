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

    const isNormal = !currentTable.meta || currentTable.meta.type === 'normal';
    const calcSection = document.getElementById('calculatorSection');
    if (calcSection) {
        calcSection.style.display = isNormal ? '' : 'none';
    }

    setTimeout(() => {
        renderMathIn(descEl);
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
        thLBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-600 font-bold';
        thLBlank.textContent = 'Z';
        theadL.appendChild(thLBlank);

        const thRBlank = document.createElement('th');
        thRBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-600 font-bold';
        thRBlank.textContent = 'Z';
        theadR.appendChild(thRBlank);

        for (let i = 0; i < 10; i++) {
            const thL = document.createElement('th');
            thL.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300';
            thL.textContent = `.0${i}`;
            theadL.appendChild(thL);

            const thR = document.createElement('th');
            thR.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300';
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
        if (labelL) labelL.textContent = 'Valores';

        const thLBlank = document.createElement('th');
        thLBlank.className = 'p-2 py-3 bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-600 font-bold';
        thLBlank.textContent = firstColName;
        theadL.appendChild(thLBlank);

        const columns = currentTable.meta?.columns || [];
        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = 'p-2 font-semibold text-slate-700 dark:text-slate-300';
            th.textContent = String(col);
            theadL.appendChild(th);
        });

        const keys = Object.keys(currentTable.rowData).sort((a, b) => {
            const numA = a === '∞' ? Infinity : parseFloat(a);
            const numB = b === '∞' ? Infinity : parseFloat(b);
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
        btn.querySelector('span')!.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

function setupEvents(): void {
    document.getElementById('btnCalcP')!.addEventListener('click', calculateP);
    document.getElementById('btnCalcZ')!.addEventListener('click', calculateZ);
    document.getElementById('btnDownloadPdf')!.addEventListener('click', downloadPdf);

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

    window.addEventListener('beforeprint', () => {
        if (htmlElem.classList.contains('dark')) {
            htmlElem.classList.remove('dark');
            htmlElem.dataset.restoreDark = '1';
        }
    });

    window.addEventListener('afterprint', () => {
        if (htmlElem.dataset.restoreDark === '1') {
            htmlElem.classList.add('dark');
            delete htmlElem.dataset.restoreDark;
        }
    });

    document.getElementById('inputZ')!.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') calculateP();
    });
    document.getElementById('inputP')!.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') calculateZ();
    });
}
