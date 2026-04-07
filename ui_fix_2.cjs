const fs = require('fs');

const drawerHtml = `
    <!-- Props Drawer Modal -->
    <div id="propsOverlay" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] hidden opacity-0 transition-opacity duration-300"></div>
    <div id="propsDrawer" class="fixed top-0 right-0 h-full w-full sm:w-[400px] md:w-[450px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-l border-white/20 dark:border-slate-800/50 shadow-2xl z-[1000] transform translate-x-full transition-transform duration-300 flex flex-col hidden">
        <div class="px-6 py-5 border-b border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center bg-white/50 dark:bg-slate-900/50">
            <h3 id="propsDrawerTitle" class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"></h3>
            <button id="btnCloseProps" class="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div id="propsDrawerContent" class="p-6 overflow-y-auto flex-grow text-sm text-slate-700 dark:text-slate-300 space-y-6"></div>
    </div>
`;

let html = fs.readFileSync('index.html', 'utf8');

// 1. Restore Drawer HTML if missing
if (!html.includes('id="propsOverlay"')) {
    html = html.replace('<!-- Image Lightbox Modal -->', drawerHtml + '\n    <!-- Image Lightbox Modal -->');
}

// 2. Fix V1 / V2 for Fisher
html = html.replace(/ν2 \(grados lib\. denominador\)/g, 'ν1 (numerador)');
html = html.replace(/ν1 \(grados lib\. numerador\)/g, 'ν2 (denominador)');
// Ensure we swap the ids in the actual html logically so they map correctly to the listener
html = html.replace(/id="inputFInterpV2"/g, 'id="inputFInterpV1_temp"');
html = html.replace(/id="inputFInterpV1"/g, 'id="inputFInterpV2_temp"');
html = html.replace(/id="inputFInterpV1_temp"/g, 'id="inputFInterpV1"');
html = html.replace(/id="inputFInterpV2_temp"/g, 'id="inputFInterpV2"');

// 3. Fix Breakdown wraps for ALL breakdowns
// Replace whitespace-nowrap in tables if any? No, the issue is on breakdown containers:
html = html.replace(/overflow-x-auto flex-grow flex items-center justify-center text-slate-600/g, 'overflow-x-auto flex-grow flex items-center justify-center text-slate-600 whitespace-normal break-words break-all sm:break-normal');
html = html.replace(/overflow-x-auto text-slate-600 dark:text-slate-400 text-center md:text-left/g, 'overflow-x-auto text-slate-600 dark:text-slate-400 text-center md:text-left whitespace-normal break-words sm:break-normal');
html = html.replace(/overflow-x-auto text-slate-600 dark:text-slate-400 text-center/g, 'overflow-x-auto text-slate-600 dark:text-slate-400 text-center whitespace-normal break-words sm:break-normal');

// 4. Also fix Lightbox CSS centering exactly:
// I accidentally used h-[80vh] w-[80vw] object-contain. It should just be max-w-[90vw] max-h-[90vh] object-contain 
html = html.replace(/w-\[80vw\] h-\[80vh\] object-contain/g, 'max-w-[90vw] max-h-[90vh] object-contain m-auto');

fs.writeFileSync('index.html', html, 'utf8');
console.log('UI UI_FIX_2 completed successfully.');
