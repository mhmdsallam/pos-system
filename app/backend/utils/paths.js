const path = require("path");
const os = require("os");
const fs = require("fs");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getDataDir = () => {
  const baseDir =
    process.env.ELECTRON_USER_DATA_PATH ||
    path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Restaurant POS",
    );
  return ensureDir(baseDir);
};

const getUploadsDir = () => {
  const dir = path.join(getDataDir(), "uploads");
  return ensureDir(dir);
};

module.exports = {
  getDataDir,
  getUploadsDir,
};
