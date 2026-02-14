const os = require('os');
const crypto = require('crypto');

/**
 * Generates a stable Machine ID based on hardware characteristics.
 * @returns {string} Machine ID (SHA-256 hash of system specs)
 */
function getMachineId() {
    try {
        const platform = os.platform();
        const arch = os.arch();
        const cpus = os.cpus();
        const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // GB

        // CPU Model (First CPU core is enough as they are identical)
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'uknown-cpu';
        const cpuCount = cpus.length;

        // Construct unique string
        // We AVOID mac address or hostname as they can change
        const uniqueString = `${platform}-${arch}-${cpuModel}-${cpuCount}-${totalMem}GB`;

        // Create Hash
        const hash = crypto.createHash('sha256').update(uniqueString).digest('hex');

        // Return first 16 chars formatted
        return hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');
    } catch (error) {
        console.error('Error generating Machine ID:', error);
        return 'UNKNOWN-MACHINE-ID';
    }
}

/**
 * Generates a valid License Key for a given Machine ID.
 * @param {string} machineId 
 * @param {string} secretSalt 
 * @returns {string} License Key
 */
function generateLicenseKey(machineId, secretSalt) {
    if (!machineId || !secretSalt) return null;

    try {
        const hmac = crypto.createHmac('sha256', secretSalt);
        hmac.update(machineId);
        const hash = hmac.digest('hex');

        // Return formated key (e.g. A1B2-C3D4-E5F6-G7H8)
        return hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');
    } catch (error) {
        console.error('Error generating License Key:', error);
        return null;
    }
}

/**
 * Verifies if a License Key is valid for the current machine.
 * @param {string} licenseKey 
 * @param {string} secretSalt 
 * @returns {boolean}
 */
function verifyLicenseKey(licenseKey, secretSalt) {
    const currentMachineId = getMachineId();
    const expectedKey = generateLicenseKey(currentMachineId, secretSalt);
    return licenseKey === expectedKey;
}

module.exports = {
    getMachineId,
    generateLicenseKey,
    verifyLicenseKey
};
