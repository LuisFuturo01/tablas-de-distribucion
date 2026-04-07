const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const tStudentStart = html.indexOf('<!-- T-STUDENT -->');
const fFisherEndIndex = html.indexOf('<!-- Image Lightbox Modal -->'); // Just grab up to there, wait
const gammaStart = html.indexOf('<!-- GAMMA DISTRIBUTION -->');
const afterGamma = html.indexOf('<!-- Image Lightbox Modal -->', gammaStart);

const beforeT = html.substring(0, tStudentStart);
const afterHtml = html.substring(afterGamma);

const newBlocks = `
            <!-- T-STUDENT -->
            <div id="toolsTStudent" class="hidden flex-col gap-6 w-full">
                <!-- Interpolation T -->
                <div class="bg-indigo-50/30 dark:bg-slate-800/60 rounded-2xl p-6 border border-indigo-100 dark:border-slate-700/60 shadow-sm w-full flex flex-col gap-6">
                    <h3 class="text-base font-bold text-indigo-900 dark:text-indigo-400 flex items-center gap-2">Interpolación T</h3>
                    
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <!-- Directa -->
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Directa: Hallar valor crítico (dado gl y α)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="number" id="inputTInterpGl" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">α (cola der)</label><input type="number" id="inputTInterpAlpha" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInterpT" class="bg-indigo-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors w-full mt-auto">Interpolar</button>
                            <div id="resInterpT" class="mt-4 text-center font-bold text-xl text-indigo-700 dark:text-indigo-400">--</div>
                            <div id="breakdownInterpT" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>

                        <!-- Inversa -->
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Inversa: Hallar α (dado gl y t crítico)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="number" id="inputTInvGl" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">Valor t</label><input type="number" id="inputTInvT" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInvInterpT" class="bg-teal-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-teal-700 shadow-sm transition-colors w-full mt-auto">Interpolar α</button>
                            <div id="resInvInterpT" class="mt-4 text-center font-bold text-xl text-teal-700 dark:text-teal-400">--</div>
                            <div id="breakdownInvInterpT" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>
                    </div>
                </div>

                <!-- Gamma Function -->
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4 w-full">
                    <div class="flex-grow">
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Función Gamma Γ(s)</label>
                        <input type="number" id="inputGammaT" step="0.01" placeholder="Ej: 3.5" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none">
                    </div>
                    <button id="btnGammaT" class="bg-violet-600 text-white px-5 py-2.5 text-sm font-semibold rounded-xl hover:bg-violet-700 shadow-sm mt-5 sm:mt-0 whitespace-nowrap">Calcular Γ</button>
                    <div id="resGammaT" class="w-full sm:w-1/3 text-center sm:text-right font-bold text-lg text-violet-700 dark:text-violet-400 mt-2 sm:mt-0">--</div>
                </div>

                <!-- Hypothesis -->
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col w-full">
                    <label class="block text-base font-bold text-slate-700 dark:text-slate-300 mb-4">Prueba de Hipótesis (Contraste t)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
                        <div><label class="text-xs text-slate-500 mb-1 block">Estadístico t</label><input type="number" id="inputTCalc" step="0.001" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                        <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="text" id="inputTGl" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                        <div><label class="text-xs text-slate-500 mb-1 block">Significancia α</label><input type="number" id="inputTAlpha" step="0.001" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                        <div>
                            <label class="text-xs text-slate-500 mb-1 block">Cola</label>
                            <select id="selectTTail" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                                <option value="two">Bilateral</option>
                                <option value="right">Unilateral Derecha</option>
                                <option value="left">Unilateral Izquierda</option>
                            </select>
                        </div>
                    </div>
                    <button id="btnCalcT" class="bg-indigo-600 text-white px-6 py-3 text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm w-full md:w-auto self-center lg:self-start">Evaluar Hipótesis</button>
                    <div class="mt-6 flex flex-col md:flex-row gap-4 items-center">
                        <div id="resT" class="text-center font-bold text-xl text-slate-700 dark:text-slate-200">--</div>
                        <div id="breakdownT" class="flex-grow text-sm bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center md:text-left">Esperando...</div>
                    </div>
                </div>
            </div>

            <!-- CHI-CUADRADO -->
            <div id="toolsChiSquare" class="hidden flex-col gap-6 w-full">
                <!-- Interpolation Chi -->
                <div class="bg-emerald-50/30 dark:bg-slate-800/60 rounded-2xl p-6 border border-emerald-100 dark:border-slate-700/60 shadow-sm w-full flex flex-col gap-6">
                    <h3 class="text-base font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-2">Interpolación χ²</h3>
                    
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Directa: Hallar valor crítico (dado gl y α)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="number" id="inputChiInterpGl" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">α (cola der)</label><input type="number" id="inputChiInterpAlpha" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInterpChi" class="bg-emerald-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm transition-colors w-full mt-auto">Interpolar</button>
                            <div id="resInterpChi" class="mt-4 text-center font-bold text-xl text-emerald-700 dark:text-emerald-400">--</div>
                            <div id="breakdownInterpChi" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>

                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Inversa: Hallar α (dado gl y χ² crítico)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="number" id="inputChiInvGl" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">Valor χ²</label><input type="number" id="inputChiInvChi" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInvInterpChi" class="bg-teal-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-teal-700 shadow-sm transition-colors w-full mt-auto">Interpolar α</button>
                            <div id="resInvInterpChi" class="mt-4 text-center font-bold text-xl text-teal-700 dark:text-teal-400">--</div>
                            <div id="breakdownInvInterpChi" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>
                    </div>
                </div>

                <!-- Gamma Function -->
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4 w-full">
                    <div class="flex-grow">
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Función Gamma Γ(s)</label>
                        <input type="number" id="inputGammaChi" step="0.01" placeholder="Ej: 4.5" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none">
                    </div>
                    <button id="btnGammaChi" class="bg-violet-600 text-white px-5 py-2.5 text-sm font-semibold rounded-xl hover:bg-violet-700 shadow-sm mt-5 sm:mt-0 whitespace-nowrap">Calcular Γ</button>
                    <div id="resGammaChi" class="w-full sm:w-1/3 text-center sm:text-right font-bold text-lg text-violet-700 dark:text-violet-400 mt-2 sm:mt-0">--</div>
                </div>

                <!-- Hypothesis -->
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col w-full">
                    <label class="block text-base font-bold text-slate-700 dark:text-slate-300 mb-4">Prueba de Hipótesis (Contraste χ²)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                        <div><label class="text-xs text-slate-500 mb-1 block">Estadístico χ²</label><input type="number" id="inputChiCalc" step="0.001" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                        <div><label class="text-xs text-slate-500 mb-1 block">Grados lib. (gl)</label><input type="number" id="inputChiGl" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                        <div><label class="text-xs text-slate-500 mb-1 block">Significancia α</label><input type="number" id="inputChiAlpha" step="0.001" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white"></div>
                    </div>
                    <button id="btnCalcChi" class="bg-emerald-600 text-white px-6 py-3 text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm w-full md:w-auto self-center lg:self-start">Evaluar Hipótesis</button>
                    <div class="mt-6 flex flex-col md:flex-row gap-4 items-center">
                        <div id="resChi" class="text-center font-bold text-xl text-slate-700 dark:text-slate-200">--</div>
                        <div id="breakdownChi" class="flex-grow text-sm bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center md:text-left">Esperando...</div>
                    </div>
                </div>
            </div>

            <!-- F-FISHER -->
            <div id="toolsFisher" class="hidden flex-col gap-6 w-full">
                <div class="bg-amber-50/30 dark:bg-slate-800/60 rounded-2xl p-6 border border-amber-100 dark:border-slate-700/60 shadow-sm w-full flex flex-col gap-6">
                    <h3 class="text-base font-bold text-amber-900 dark:text-amber-400 flex items-center gap-2">Interpolación F de Fisher</h3>
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full col-span-1 xl:col-span-2">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Directa: Hallar valor crítico (dado ν2 y ν1)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">ν2 (grados lib. denominador)</label><input type="number" id="inputFInterpV2" step="0.1" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">ν1 (grados lib. numerador)</label><input type="number" id="inputFInterpV1" step="1" class="p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInterpF" class="bg-amber-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-amber-700 shadow-sm transition-colors w-full mt-auto">Interpolar</button>
                            <div id="resInterpF" class="mt-4 text-center font-bold text-xl text-amber-700 dark:text-amber-400">--</div>
                            <div id="breakdownInterpF" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- GAMMA DISTRIBUTION -->
            <div id="toolsGamma" class="hidden flex-col gap-6 w-full">
                <div class="bg-rose-50/30 dark:bg-slate-800/60 rounded-2xl p-6 border border-rose-100 dark:border-slate-700/60 shadow-sm w-full flex flex-col gap-6">
                    <h3 class="text-base font-bold text-rose-900 dark:text-rose-400 flex items-center gap-2">Interpolación Gamma</h3>
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Directa: Hallar crítico (dado α y p)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Parámetro forma (α)</label><input type="number" id="inputGammaInterpAlpha" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">Prob p</label><input type="number" id="inputGammaInterpP" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInterpGamma" class="bg-rose-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-rose-700 shadow-sm transition-colors w-full mt-auto">Interpolar</button>
                            <div id="resInterpGamma" class="mt-4 text-center font-bold text-xl text-rose-700 dark:text-rose-400">--</div>
                            <div id="breakdownInterpGamma" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>

                        <div class="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                            <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Inversa: Hallar p (dado α y x crítico)</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <div><label class="text-xs text-slate-500 mb-1 block">Parámetro forma (α)</label><input type="number" id="inputGammaInvAlpha" step="0.1" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                                <div><label class="text-xs text-slate-500 mb-1 block">Valor crítico (x)</label><input type="number" id="inputGammaInvX" step="0.001" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none"></div>
                            </div>
                            <button id="btnInvInterpGamma" class="bg-teal-600 text-white px-4 py-2 text-sm font-semibold rounded-xl hover:bg-teal-700 shadow-sm transition-colors w-full mt-auto">Interpolar p</button>
                            <div id="resInvInterpGamma" class="mt-4 text-center font-bold text-xl text-teal-700 dark:text-teal-400">--</div>
                            <div id="breakdownInvInterpGamma" class="mt-2 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-600 dark:text-slate-400 text-center">Esperando...</div>
                        </div>
                    </div>
                </div>

                <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4 w-full">
                    <div class="flex-grow">
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Calculadora Función Gamma Γ(s)</label>
                        <input type="number" id="inputGammaFunc" step="0.01" class="p-2 sm:p-3 text-sm border border-slate-300 rounded-lg w-full max-w-xs dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none">
                    </div>
                    <button id="btnGammaFunc" class="bg-violet-600 text-white px-5 py-2.5 text-sm font-semibold rounded-xl hover:bg-violet-700 shadow-sm mt-5 sm:mt-0 whitespace-nowrap">Calcular Γ</button>
                    <div id="resGammaFunc" class="w-full sm:w-1/3 text-center sm:text-right font-bold text-lg text-violet-700 dark:text-violet-400 mt-2 sm:mt-0">--</div>
                </div>
            </div>
`;

fs.writeFileSync('index.html', beforeT + newBlocks + afterHtml, 'utf8');
console.log("Written index.html successfully");
