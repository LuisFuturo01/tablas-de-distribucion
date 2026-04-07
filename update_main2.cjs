const fs = require('fs');
let ts = fs.readFileSync('src/main.ts', 'utf8');

// 1. Add listeners in setupEvents
const setupEventsStart = ts.indexOf('function setupEvents(): void {');
const endOfFirstBlock = ts.indexOf('// Interpolation buttons', setupEventsStart);

const appendListeners = `
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
`;

ts = ts.slice(0, endOfFirstBlock) + appendListeners + ts.slice(endOfFirstBlock);

const newLogic = `
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
    let rNum = rows[0].num;
    let bestDist = Infinity;
    for(const r of rows) {
        if(Math.abs(r.num - targetRow) < bestDist) {
            bestDist = Math.abs(r.num - targetRow);
            rKey = r.key; rNum = r.num;
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
    renderKaTeXInto(resEl, \`\${label} \\\\approx \${val.toPrecision(4)}\`, false);
    if (exact) {
        renderKaTeXInto(bdEl, \`\\\\text{Exacto en tabla para gl } \\\\approx \${approxGl}\`, true);
    } else {
        renderKaTeXInto(bdEl, \`\\\\begin{aligned} \\\\text{En gl } \\\\approx \${approxGl} &\\\\text{ interpolando entre } \${lo.v} \\\\text{ y } \${hi.v} \\\\\\\\ \${label} &= \${lo.a} + \\\\dfrac{\${targetVal} - \${lo.v}}{\${hi.v} - \${lo.v}} \\\\cdot (\${hi.a} - \${lo.a}) \\\\\\\\ &\\\\approx \${val.toPrecision(4)} \\\\end{aligned}\`, true);
    }
}

function interpolateTInverse(): void {
    const gl = parseFloat((document.getElementById('inputTInvGl') as HTMLInputElement).value);
    const t = parseFloat((document.getElementById('inputTInvT') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(t)) return;
    const result = interpolateInverseRow(currentTable, gl, Math.abs(t));
    showInvInterpResult('resInvInterpT', 'breakdownInvInterpT', '\\\\alpha', Math.abs(t), result);
}

function interpolateChiInverse(): void {
    const gl = parseFloat((document.getElementById('inputChiInvGl') as HTMLInputElement).value);
    const chi = parseFloat((document.getElementById('inputChiInvChi') as HTMLInputElement).value);
    if (isNaN(gl) || isNaN(chi)) return;
    const result = interpolateInverseRow(currentTable, gl, chi);
    showInvInterpResult('resInvInterpChi', 'breakdownInvInterpChi', '\\\\alpha', chi, result);
}

function interpolateGammaInverse(): void {
    const alpha = parseFloat((document.getElementById('inputGammaInvAlpha') as HTMLInputElement).value);
    const x = parseFloat((document.getElementById('inputGammaInvX') as HTMLInputElement).value);
    if (isNaN(alpha) || isNaN(x)) return;
    const result = interpolateInverseRow(currentTable, alpha, x);
    showInvInterpResult('resInvInterpGamma', 'breakdownInvInterpGamma', 'p', x, result);
}
`;

fs.writeFileSync('src/main.ts', ts + '\n\n' + newLogic, 'utf8');
console.log("Updated main.ts via code.");
