/**
 * File System Utilities
 * Handles directory structure reading, searching, and file operations
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Copy directory recursively
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 */
async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

module.exports = {
  copyDirectory
};
