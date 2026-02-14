const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getMachineId, generateLicenseKey, verifyLicenseKey } = require('../utils/hardware');

// --- SECRET SALT ---
// KEEP THIS PRIVATE AND SECURE suitable for offline use
const SECRET_SALT = "RESTAURANT_POS_V2_SECRET_KEY_2026_SALAM"; 

// License file path (Hidden in AppData/Documents)
const LICENSE_DIR = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const LICENSE_FILE = path.join(LICENSE_DIR, 'activation.license');

// Helper to check license validity
function checkLicense() {
    try {
        if (!fs.existsSync(LICENSE_FILE)) {
            return { valid: false, machineId: getMachineId() };
        }

        const licenseData = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
        const currentMachineId = getMachineId();

        // Check if machine ID matches
        if (licenseData.machineId !== currentMachineId) {
             return { valid: false, machineId: currentMachineId, reason: 'Machine ID Mismatch' };
        }

        // Verify the key integrity
        const isValid = verifyLicenseKey(licenseData.licenseKey, SECRET_SALT);
        
        return { 
            valid: isValid, 
            machineId: currentMachineId,
            activatedAt: licenseData.activatedAt
        };

    } catch (error) {
        console.error("License check error:", error);
        return { valid: false, machineId: getMachineId() };
    }
}

// GET /api/license/status
router.get('/status', (req, res) => {
    const status = checkLicense();
    res.json(status);
});

// POST /api/license/activate
router.post('/activate', (req, res) => {
    const { licenseKey } = req.body;
    const machineId = getMachineId();

    if (!licenseKey) {
        return res.status(400).json({ error: 'License key is required' });
    }

    // Verify
    const expectedKey = generateLicenseKey(machineId, SECRET_SALT);
    
    if (licenseKey.trim() !== expectedKey) {
        return res.status(400).json({ error: 'Invalid License Key' });
    }

    // Save
    try {
        if (!fs.existsSync(LICENSE_DIR)) {
            fs.mkdirSync(LICENSE_DIR, { recursive: true });
        }

        const licenseData = {
            machineId,
            licenseKey: licenseKey.trim(),
            activatedAt: new Date().toISOString()
        };

        fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenseData, null, 2));

        res.json({ success: true, message: 'Activation Successful' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to save license file' });
    }
});

module.exports = router;
