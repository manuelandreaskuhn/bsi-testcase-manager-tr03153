/**
 * Testcase Routes
 * Handles testcase CRUD operations
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const { validateInstance } = require('../../middleware/global');
const { 
  readFolderStructure, 
  searchTestcases, 
  getDashboardData,
  parseTestcaseXML, 
  saveTestcaseXML 
} = require('../../utils/testcases');

/**
 * GET /api/:instance/info
 * Get instance information
 */
router.get('/:instance/info', validateInstance, async (req, res) => {
  try {
    let info = { 
      id: req.instanceName, 
      name: req.instanceName, 
      path: req.instancePath 
    };
    
    // profiles.xml is now in testcases/ subfolder
    const profilesPath = path.join(req.testcasesPath, 'profiles.xml');
    const templatePath = path.join(req.testcasesPath, 'profiles-template.xml');
    
    let xmlPath = templatePath;
    try { 
      await fs.access(profilesPath); 
      xmlPath = profilesPath; 
    } catch {}
    
    try {
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');
      const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
      const result = await parser.parseStringPromise(xmlContent);
      const config = result.ProfileConfiguration;
      
      if (config?.Metadata?.ProductName) info.productName = config.Metadata.ProductName;
      if (config?.Metadata?.Manufacturer) info.manufacturer = config.Metadata.Manufacturer;
      if (config?.Metadata?.ProductVersion) info.version = config.Metadata.ProductVersion;
    } catch {}
    
    res.json(info);
  } catch (error) {
    console.error('Error getting instance info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/structure
 * Get folder structure for an instance
 */
router.get('/:instance/structure', validateInstance, async (req, res) => {
  try {
    const structure = await readFolderStructure(req.testcasesPath);
    res.json(structure);
  } catch (error) {
    console.error('Error reading folder structure:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/search
 * Search testcases
 */
router.get('/:instance/search', validateInstance, async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query.trim()) {
      return res.json({ results: [] });
    }
    
    const results = await searchTestcases(req.testcasesPath, query);
    res.json({ results });
  } catch (error) {
    console.error('Error searching testcases:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/dashboard
 * Get dashboard statistics
 */
router.get('/:instance/dashboard', validateInstance, async (req, res) => {
  try {
    const stats = await getDashboardData(req.testcasesPath);
    res.json(stats);
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/testcase/:module/:category/:filename
 * Get a specific testcase
 */
router.get('/:instance/testcase/:module/:category/:filename', validateInstance, async (req, res) => {
  const { module, category, filename } = req.params;
  const filePath = path.join(req.testcasesPath, module, category, filename);
  
  try {
    const testcase = await parseTestcaseXML(filePath);
    res.json(testcase);
  } catch (error) {
    console.error('Error reading testcase:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/:instance/testcase/:module/:category/:filename
 * Update a testcase
 */
router.put('/:instance/testcase/:module/:category/:filename', validateInstance, async (req, res) => {
  const { module, category, filename } = req.params;
  const filePath = path.join(req.testcasesPath, module, category, filename);
  const testcaseData = req.body;
  
  try {
    await saveTestcaseXML(filePath, testcaseData);
    res.json({ success: true, message: 'Testcase erfolgreich gespeichert' });
  } catch (error) {
    console.error('Error saving testcase:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
