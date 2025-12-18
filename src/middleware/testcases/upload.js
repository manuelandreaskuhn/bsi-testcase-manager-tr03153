/**
 * File Upload Middleware
 * Configures multer for attachment uploads
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { INSTANCES_ROOT, UPLOAD_CONFIG } = require('../../config');

/**
 * Storage configuration for multer
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const { instance, testcaseId } = req.params;
    // Remove .xml extension if present for consistent folder naming
    const cleanTestcaseId = testcaseId.replace(/\.xml$/, '');
    const attachmentsDir = path.join(INSTANCES_ROOT, instance, '_attachments', cleanTestcaseId);
    
    try {
      await fs.mkdir(attachmentsDir, { recursive: true });
      cb(null, attachmentsDir);
    } catch (err) {
      cb(err);
    }
  },
  
  filename: (req, file, cb) => {
    // Keep original filename but make it safe
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

/**
 * File filter - only allow specific file types
 */
const fileFilter = (req, file, cb) => {
  if (UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

/**
 * Configured multer instance
 */
const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_CONFIG.maxFileSize },
  fileFilter
});

module.exports = upload;
