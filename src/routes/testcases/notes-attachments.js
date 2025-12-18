/**
 * Notes and Attachments Routes
 * Handles testcase notes and file attachments
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { validateInstance } = require('../../middleware/global');
const { upload } = require('../../middleware/testcases');
const { parseTestcaseXML, saveTestcaseXML } = require('../../utils/testcases');

// ============================================
// Notes Endpoints
// ============================================

/**
 * POST /api/:instance/testcase/:module/:category/:filename/notes
 * Add a note to a testcase
 */
router.post('/:instance/testcase/:module/:category/:filename/notes', validateInstance, async (req, res) => {
  const { module, category, filename } = req.params;
  const { text, author } = req.body;
  
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  
  // Testcase XMLs are in testcases/ subfolder
  const filePath = path.join(req.testcasesPath, module, category, filename);
  
  try {
    const testcase = await parseTestcaseXML(filePath);
    
    if (!testcase.notes) {
      testcase.notes = [];
    }
    
    const newNote = {
      text: text.trim(),
      timestamp: new Date().toISOString(),
      author: author || ''
    };
    
    testcase.notes.push(newNote);
    await saveTestcaseXML(filePath, testcase);
    
    res.json({ 
      success: true, 
      note: newNote,
      notes: testcase.notes
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/:instance/testcase/:module/:category/:filename/notes/:index
 * Delete a note from a testcase
 */
router.delete('/:instance/testcase/:module/:category/:filename/notes/:index', validateInstance, async (req, res) => {
  const { module, category, filename, index } = req.params;
  const noteIndex = parseInt(index, 10);
  
  const filePath = path.join(req.testcasesPath, module, category, filename);
  
  try {
    const testcase = await parseTestcaseXML(filePath);
    
    if (!testcase.notes || noteIndex < 0 || noteIndex >= testcase.notes.length) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    testcase.notes.splice(noteIndex, 1);
    await saveTestcaseXML(filePath, testcase);
    
    res.json({ 
      success: true, 
      notes: testcase.notes
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Attachments Endpoints
// ============================================

/**
 * POST /api/:instance/testcase/:module/:category/:testcaseId/attachments
 * Upload an attachment
 */
router.post('/:instance/testcase/:module/:category/:testcaseId/attachments', 
  validateInstance, 
  upload.single('file'), 
  async (req, res) => {
    const { module, category, testcaseId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Handle both "II_EXF_01" and "II_EXF_01.xml" as testcaseId
    const filename = testcaseId.endsWith('.xml') ? testcaseId : `${testcaseId}.xml`;
    // Testcase XMLs are in testcases/ subfolder
    const filePath = path.join(req.testcasesPath, module, category, filename);
    
    try {
      const testcase = await parseTestcaseXML(filePath);
      
      if (!testcase.attachments) {
        testcase.attachments = [];
      }
      
      const newAttachment = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        timestamp: new Date().toISOString(),
        description: req.body.description || '',
        mimeType: req.file.mimetype,
        size: req.file.size
      };
      
      testcase.attachments.push(newAttachment);
      await saveTestcaseXML(filePath, testcase);
      
      res.json({ 
        success: true, 
        attachment: newAttachment,
        attachments: testcase.attachments
      });
    } catch (error) {
      console.error('Error adding attachment:', error);
      // Clean up uploaded file on error
      try {
        await fs.unlink(req.file.path);
      } catch {}
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/:instance/attachments/:testcaseId/:filename
 * Serve an attachment file
 * Note: Attachments are stored in instance root, not in testcases/ subfolder
 */
router.get('/:instance/attachments/:testcaseId/:filename', validateInstance, async (req, res) => {
  const { testcaseId, filename } = req.params;
  // Remove .xml extension if present for consistent folder naming
  const cleanTestcaseId = testcaseId.replace(/\.xml$/, '');
  // Attachments are in instance root, not in testcases/
  const filePath = path.join(req.instancePath, '_attachments', cleanTestcaseId, filename);
  
  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.sendFile(filePath);
});

/**
 * DELETE /api/:instance/testcase/:module/:category/:testcaseId/attachments/:filename
 * Delete an attachment
 */
router.delete('/:instance/testcase/:module/:category/:testcaseId/attachments/:filename', 
  validateInstance, 
  async (req, res) => {
    const { module, category, testcaseId, filename: attachmentFilename } = req.params;
    
    // Handle both "II_EXF_01" and "II_EXF_01.xml" as testcaseId
    const xmlFilename = testcaseId.endsWith('.xml') ? testcaseId : `${testcaseId}.xml`;
    const cleanTestcaseId = testcaseId.replace(/\.xml$/, '');
    // Testcase XMLs are in testcases/ subfolder
    const xmlPath = path.join(req.testcasesPath, module, category, xmlFilename);
    // Attachments are in instance root
    const attachmentPath = path.join(req.instancePath, '_attachments', cleanTestcaseId, attachmentFilename);
    
    try {
      const testcase = await parseTestcaseXML(xmlPath);
      
      if (!testcase.attachments) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      
      const attachmentIndex = testcase.attachments.findIndex(a => a.filename === attachmentFilename);
      if (attachmentIndex === -1) {
        return res.status(404).json({ error: 'Attachment not found in testcase' });
      }
      
      // Remove from testcase
      testcase.attachments.splice(attachmentIndex, 1);
      await saveTestcaseXML(xmlPath, testcase);
      
      // Delete file
      try {
        if (fsSync.existsSync(attachmentPath)) {
          await fs.unlink(attachmentPath);
        }
      } catch (err) {
        console.warn('Could not delete attachment file:', err.message);
      }
      
      res.json({ 
        success: true, 
        attachments: testcase.attachments
      });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
