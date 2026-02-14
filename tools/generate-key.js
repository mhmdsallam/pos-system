const { getMachineId, generateLicenseKey } = require('../app/backend/utils/hardware');
const readline = require('readline');

// --- SECRET SALT ---
// MUST MATCH backend/routes/license.js
const SECRET_SALT = "RESTAURANT_POS_V2_SECRET_KEY_2026_SALAM";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\n===========================================");
console.log("   POS LICENSE KEY GENERATOR (ADMIN)");
console.log("===========================================\n");

rl.question('Enter Client Machine ID: ', (machineId) => {
    
    if (!machineId) {
        console.log("Error: Machine ID is required!");
        rl.close();
        return;
    }

    const key = generateLicenseKey(machineId.trim(), SECRET_SALT);

    console.log("\n-------------------------------------------");
    console.log("MACHINE ID : " + machineId.trim());
    console.log("LICENSE KEY: \x1b[32m" + key + "\x1b[0m");
    console.log("-------------------------------------------\n");

    rl.close();
});
