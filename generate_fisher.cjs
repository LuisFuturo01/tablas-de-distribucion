// Script to generate correct F-Fisher critical values
const jStat = require('jstat');

const alphas = [0.10, 0.05, 0.025, 0.01, 0.005];
const nu1Values = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
const nu2Values = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,40,50,60,70,80,90,100,200,500,1000];

for (const alpha of alphas) {
    console.log(`\n=== alpha = ${alpha} ===`);
    const rows = {};
    for (const v2 of nu2Values) {
        const vals = [];
        for (const v1 of nu1Values) {
            // jStat.centralF.inv(p, df1, df2) returns x such that P(F <= x) = p
            const critVal = jStat.centralF.inv(1 - alpha, v1, v2);
            vals.push(critVal.toFixed(3));
        }
        rows[v2] = vals;
    }
    
    // Output as TypeScript
    const alphaStr = alpha.toString().replace('.', '');
    console.log(`  rowData: {`);
    for (const v2 of nu2Values) {
        const valsStr = rows[v2].map(v => `"${v}"`).join(',');
        console.log(`    "${v2}": [${valsStr}],`);
    }
    console.log(`  }`);
}
