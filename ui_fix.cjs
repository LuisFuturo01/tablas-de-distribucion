const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Fix Image headers: Make them proportional, single size, and well padded.
html = html.replace(/<img id="img1" src="\/img\/espera.webp" alt="Ilustración Principal" class=".*?">/g, 
    '<img id="img1" src="/img/espera.webp" alt="Ilustración Principal" class="w-32 h-24 sm:w-40 sm:h-28 object-contain bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-105 transition-transform shadow-sm">');
html = html.replace(/<img id="img2" src="\/img\/espera.webp" alt="Ilustración Secundaria" class=".*?">/g, 
    '<img id="img2" src="/img/espera.webp" alt="Ilustración Secundaria" class="w-32 h-24 sm:w-40 sm:h-28 object-contain bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-105 transition-transform shadow-sm">');

// 2. Fix Lightbox constraint to 80% width & height centered
html = html.replace(/<img id="lightboxImg" src="" alt="Vista ampliada" class=".*?"/g, 
    '<img id="lightboxImg" src="" alt="Vista ampliada" class="w-[80vw] h-[80vh] object-contain rounded-xl shadow-2xl scale-95 transition-transform duration-300"');

// 3. Fix Gamma function centering: The user wants it completely centered visually.
const gammaHtmlReplacement = `
                <!-- Gamma Function -->
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center gap-4 w-full">
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">Calculadora Función Gamma Γ(s)</label>
                    <div class="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
                        <input type="number" id="inputGammaXXX" step="0.01" placeholder="Ej: 3.5" class="p-2 sm:p-2.5 text-sm border border-slate-300 rounded-lg w-full max-w-[12rem] dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none text-center">
                        <button id="btnGammaXXX" class="bg-violet-600 text-white px-4 py-2 sm:py-2.5 text-sm font-medium rounded-lg hover:bg-violet-700 shadow-sm transition-colors w-full max-w-[12rem] sm:w-auto">Calcular Γ</button>
                    </div>
                    <div id="resGammaXXX" class="text-center font-bold text-lg text-violet-700 dark:text-violet-400 mt-2 min-h-[2rem] w-full flex items-center justify-center">--</div>
                </div>
`;
// T-Student Gamma
html = html.replace(/<!-- Gamma Function -->[\s\S]*?(?=<!-- Hypothesis -->)/, gammaHtmlReplacement.replace(/XXX/g, 'T') + '                ');

// Chi-Square Gamma
// The second one is in toolsChiSquare
html = html.replace(/<!-- Gamma Function -->[\s\S]*?(?=<!-- Hypothesis -->)/, gammaHtmlReplacement.replace(/XXX/g, 'Chi') + '                ');

// Gamma Tools Gamma Function: it doesn't have Hypothesis, it ends div
const gammaBlockRegex = /<div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4 w-full">\s*<div class="flex-grow">\s*<label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Calculadora Función Gamma Γ\(s\)<\/label>[\s\S]*?<\/div>\s*<\/div>/;
html = html.replace(gammaBlockRegex, gammaHtmlReplacement.replace(/XXX/g, 'Func'));

// 4. Reduce button sizes globally for mobile:
// Any button inside tools with big padding (px-6 py-3, px-5 py-2.5, px-4 py-2 text-sm lg styles)
// We want standard buttons.
html = html.replace(/px-6 py-3 text-sm font-semibold/g, 'px-4 py-2 sm:px-6 sm:py-2.5 text-[13px] sm:text-sm font-medium');
html = html.replace(/px-5 py-2\.5 text-sm font-semibold/g, 'px-4 py-2 sm:px-5 sm:py-2.5 text-[13px] sm:text-sm font-medium');
html = html.replace(/px-4 py-2 text-sm font-semibold/g, 'px-4 py-2 md:px-5 md:py-2 text-[13px] sm:text-sm font-medium');

// 5. Dark mode improvements (make background dark visually appealing)
// Body bg is currently: bg-slate-50 text-slate-800 ... dark:bg-slate-900 dark:text-slate-100
html = html.replace('dark:bg-slate-900', 'dark:bg-[#0b1120]');
// Dark mode cards (bg-slate-900 inside dark containers)
html = html.replace(/dark:bg-slate-900/g, 'dark:bg-[#111827]');
html = html.replace(/dark:bg-slate-800/g, 'dark:bg-[#1f2937]');
// The outer boxes border/shadow in dark mode
html = html.replace(/dark:bg-slate-800\/60/g, 'dark:bg-[#1f2937]/50');

// Fix p-3 inputs which make things huge in mobile:
html = html.replace(/p-3 text-sm border/g, 'p-2 sm:p-2.5 text-sm border');

fs.writeFileSync('index.html', html, 'utf8');
console.log("UI HTML formatting complete.");
