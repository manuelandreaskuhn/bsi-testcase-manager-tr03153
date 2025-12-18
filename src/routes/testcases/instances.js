/**
 * Instance Management Routes
 * Handles listing, creating, and managing instances
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { INSTANCES_ROOT, TEMPLATES_ROOT } = require('../../config/testcases');
const { copyDirectory } = require('../../utils/testcases');

// Valid instance name pattern (URL-safe)
const INSTANCE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /api/instances
 * List all available instances
 */
router.get('/', async (req, res) => {
  try {
    // Ensure instances directory exists
    try {
      await fs.access(INSTANCES_ROOT);
    } catch {
      await fs.mkdir(INSTANCES_ROOT, { recursive: true });
    }
    
    const entries = await fs.readdir(INSTANCES_ROOT, { withFileTypes: true });
    const instances = [];
    
    // Import utilities
    const { parseProfilesXML } = require('../../utils/testcases/xml');
    const { calculateDerivedProfiles, collectAllTestcases } = require('../../utils/testcases/testcase');
    
    for (const entry of entries) {
      if (entry.isDirectory() && INSTANCE_NAME_PATTERN.test(entry.name)) {
        const instancePath = path.join(INSTANCES_ROOT, entry.name);
        // Testcases and profiles are now in testcases/ subfolder
        const testcasesPath = path.join(instancePath, 'testcases');
        
        let info = {
          id: entry.name,
          name: entry.name,
          path: instancePath,
          hasProfiles: false,
          profilesCompleted: false,
          activeProfileCount: 0,
          activeProfiles: [],
          profileFilterMode: 'OR',
          moduleCount: 0,
          testcaseCount: 0,
          filteredTestcaseCount: 0
        };
        
        // Check for profiles - prefer profiles.xml over template (now in testcases/ subfolder)
        const profilesPath = path.join(testcasesPath, 'profiles.xml');
        const templatePath = path.join(testcasesPath, 'profiles-template.xml');
        
        let xmlPath = null;
        try {
          await fs.access(profilesPath);
          xmlPath = profilesPath;
        } catch {
          try {
            await fs.access(templatePath);
            xmlPath = templatePath;
          } catch {}
        }
        
        if (xmlPath) {
          info.hasProfiles = true;
          
          try {
            const xmlContent = await fs.readFile(xmlPath, 'utf-8');
            const profilesData = await parseProfilesXML(xmlContent);
            
            if (profilesData.metadata?.productName) info.name = profilesData.metadata.productName;
            if (profilesData.metadata?.manufacturer) info.manufacturer = profilesData.metadata.manufacturer;
            if (profilesData.metadata?.productVersion) info.version = profilesData.metadata.productVersion;
            
            info.profilesCompleted = profilesData.completed || false;
            info.activeProfiles = calculateDerivedProfiles(profilesData);
            info.activeProfileCount = info.activeProfiles.length;
            
            // Get profile filter mode from configuration
            info.profileFilterMode = profilesData.templateConfiguration?.profileFilterMode || 'OR';
          } catch (err) {
            console.warn('Error parsing profiles:', err.message);
          }
        }
        
        // Use collectAllTestcases for consistent counting (with testcasesPath)
        try {
          // Get all testcases (unfiltered)
          const allModules = await collectAllTestcases(testcasesPath, null, 'OR');
          info.moduleCount = allModules.length;
          info.testcaseCount = allModules.reduce((sum, mod) => 
            sum + mod.categories.reduce((catSum, cat) => catSum + cat.testcases.length, 0), 0);
          
          // Get filtered testcases if profiles are completed (using configured filter mode)
          if (info.profilesCompleted && info.activeProfiles.length > 0) {
            const filteredModules = await collectAllTestcases(testcasesPath, info.activeProfiles, info.profileFilterMode);
            info.filteredTestcaseCount = filteredModules.reduce((sum, mod) => 
              sum + mod.categories.reduce((catSum, cat) => catSum + cat.testcases.length, 0), 0);
          } else {
            info.filteredTestcaseCount = info.testcaseCount;
          }
        } catch (err) {
          console.warn('Error counting testcases:', err.message);
        }
        
        instances.push(info);
      }
    }
    
    res.json({ instances });
  } catch (error) {
    console.error('Error listing instances:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/instances
 * Create a new instance
 */
router.post('/', async (req, res) => {
  try {
    const { name, templateId } = req.body;
    
    // Validate name
    if (!name || !INSTANCE_NAME_PATTERN.test(name)) {
      return res.status(400).json({ 
        error: 'Ungültiger Instanzname. Erlaubt sind nur: a-z, A-Z, 0-9, _ und -' 
      });
    }
    
    const instancePath = path.join(INSTANCES_ROOT, name);
    
    // Check if already exists
    if (fsSync.existsSync(instancePath)) {
      return res.status(409).json({ error: `Instanz "${name}" existiert bereits` });
    }
    
    // Create from template or empty
    if (templateId) {
      const templatePath = path.join(TEMPLATES_ROOT, templateId);
      
      if (!fsSync.existsSync(templatePath)) {
        return res.status(404).json({ error: `Template "${templateId}" nicht gefunden` });
      }
      
      // Copy template
      await copyDirectory(templatePath, instancePath);
      
      // Remove TemplateInfo from profiles-template.xml (now in testcases/ subfolder)
      const profilesPath = path.join(instancePath, 'testcases', 'profiles-template.xml');
      if (fsSync.existsSync(profilesPath)) {
        try {
          const xmlContent = await fs.readFile(profilesPath, 'utf-8');
          const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
          const result = await parser.parseStringPromise(xmlContent);
          
          if (result.ProfileConfiguration?.TemplateInfo) {
            delete result.ProfileConfiguration.TemplateInfo;
            
            const builder = new xml2js.Builder({ 
              headless: false, 
              renderOpts: { pretty: true, indent: '  ', newline: '\n' }
            });
            const newXml = builder.buildObject(result);
            await fs.writeFile(profilesPath, newXml, 'utf-8');
          }
        } catch (err) {
          console.warn('Could not remove TemplateInfo:', err.message);
        }
      }
      
      res.status(201).json({ 
        success: true, 
        message: `Instanz "${name}" aus Template "${templateId}" erstellt`,
        instanceId: name
      });
    } else {
      // Create empty instance with subfolders
      await fs.mkdir(instancePath, { recursive: true });
      await fs.mkdir(path.join(instancePath, 'testcases'), { recursive: true });
      await fs.mkdir(path.join(instancePath, 'interfacedesign'), { recursive: true });
      
      res.status(201).json({ 
        success: true, 
        message: `Leere Instanz "${name}" erstellt`,
        instanceId: name
      });
    }
  } catch (error) {
    console.error('Error creating instance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/templates
 * List all available templates
 */
router.get('/templates', async (req, res) => {
  try {
    // Ensure templates directory exists
    try {
      await fs.access(TEMPLATES_ROOT);
    } catch {
      await fs.mkdir(TEMPLATES_ROOT, { recursive: true });
    }
    
    const entries = await fs.readdir(TEMPLATES_ROOT, { withFileTypes: true });
    const templates = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        const templatePath = path.join(TEMPLATES_ROOT, entry.name);
        // Testcases and profiles are in testcases/ subfolder
        const testcasesPath = path.join(templatePath, 'testcases');
        
        let template = {
          id: entry.name,
          name: entry.name,
          description: '',
          moduleCount: 0,
          testcaseCount: 0
        };
        
        // Get template info (now in testcases/ subfolder)
        const profilesPath = path.join(testcasesPath, 'profiles-template.xml');
        try {
          const xmlContent = await fs.readFile(profilesPath, 'utf-8');
          const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
          const result = await parser.parseStringPromise(xmlContent);
          const config = result.ProfileConfiguration;
          
          if (config?.TemplateInfo) {
            if (config.TemplateInfo.Name) template.name = config.TemplateInfo.Name;
            if (config.TemplateInfo.Description) template.description = config.TemplateInfo.Description;
          }
        } catch {}
        
        // Count modules and testcases (now in testcases/ subfolder)
        try {
          const moduleEntries = await fs.readdir(testcasesPath, { withFileTypes: true });
          for (const mod of moduleEntries) {
            if (mod.isDirectory() && !mod.name.startsWith('.') && !mod.name.startsWith('_')) {
              template.moduleCount++;
              const modulePath = path.join(testcasesPath, mod.name);
              const catEntries = await fs.readdir(modulePath, { withFileTypes: true });
              
              for (const cat of catEntries) {
                if (cat.isDirectory() && !cat.name.startsWith('.') && !cat.name.startsWith('_')) {
                  const catPath = path.join(modulePath, cat.name);
                  const files = await fs.readdir(catPath);
                  template.testcaseCount += files.filter(f => f.endsWith('.xml')).length;
                }
              }
            }
          }
        } catch {}
        
        templates.push(template);
      }
    }
    
    res.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/debug
 * Debug info for troubleshooting
 */
router.get('/debug', async (req, res) => {
  const debug = {
    cwd: process.cwd(),
    instancesRoot: INSTANCES_ROOT,
    instancesRootResolved: path.resolve(INSTANCES_ROOT),
    templatesRoot: TEMPLATES_ROOT,
    templatesRootResolved: path.resolve(TEMPLATES_ROOT),
    instances: [],
    templates: []
  };
  
  try {
    const instanceEntries = await fs.readdir(INSTANCES_ROOT, { withFileTypes: true });
    debug.instances = instanceEntries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
  } catch (err) {
    debug.instancesError = err.message;
  }
  
  try {
    const templateEntries = await fs.readdir(TEMPLATES_ROOT, { withFileTypes: true });
    debug.templates = templateEntries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
  } catch (err) {
    debug.templatesError = err.message;
  }
  
  res.json(debug);
});

module.exports = router;
