/**
 * Instance Management Routes
 * Handles listing, creating, and managing instances
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { INSTANCES_ROOT, TEMPLATES_ROOT } = require('../../config');
const { copyDirectory } = require('../../utils/global');

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
    
    const instances = [];
    
    // Get instances from different modules
    try {
        const instancesTestcases = require('../testcases/instances');
        const result = await instancesTestcases.getInstances();
        for (const instance of result) {
            instances.push(instance);
        }
    } catch (error) { }

    try {
        const instancesInterfacedesign = require('../interfacedesign/instances');
        const resultID = await instancesInterfacedesign.getInstances();
        for (const instance of resultID) {
            const match = instances.find(i => i.id === instance.id);
            if (match) {
                match.hasInterfaces = instance.hasInterfaces;
                match.functionCount = instance.functionCount || 0;
                match.exceptionCount = instance.exceptionCount || 0;
                match.typeCount = instance.typeCount || 0;
                match.enumCount = instance.enumCount || 0;
            } else {
                instances.push(instance);
            }
        }
    } catch (error) { }
    
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

      const hasTestcases = fsSync.existsSync(path.join(templatePath, 'testcases'));
      const testcaseCount = hasTestcases ? (await fs.readdir(path.join(templatePath, 'testcases'))).length : 0;
      const hasInterfaces = fsSync.existsSync(path.join(templatePath, 'interfacedesign'));
      const interfaceCount = hasInterfaces ? (await fs.readdir(path.join(templatePath, 'interfacedesign'))).length : 0;
      
      res.status(201).json({ 
        success: true, 
        message: `Instanz "${name}" aus Template "${templateId}" erstellt`,
        instanceId: name,
        hasTestcases,
        testcaseCount,
        hasInterfaces,
        interfaceCount
      });
    } else {
      // Create empty instance with subfolders
      await fs.mkdir(instancePath, { recursive: true });
      await fs.mkdir(path.join(instancePath, 'testcases'), { recursive: true });
      await fs.mkdir(path.join(instancePath, 'interfacedesign'), { recursive: true });
      
      res.status(201).json({ 
        success: true, 
        message: `Leere Instanz "${name}" erstellt`,
        instanceId: name,
        hasTestcases: false,
        testcaseCount: 0,
        hasInterfaces: true,
        interfaceCount: 0
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
    
    const templates = [];
    
    // Get templates from different modules
    try {
        const templatesTestcases = require('../testcases/instances');
        const result = await templatesTestcases.getTemplates();
        for (const template of result) {
            templates.push(template);
        }
    } catch (error) { }

    try {
        const templatesInterfacedesign = require('../interfacedesign/instances');
        const resultID = await templatesInterfacedesign.getTemplates();
        for (const template of resultID) {
            const match = templates.find(t => t.id === template.id);
            if (match) {
                match.hasInterfaces = template.hasInterfaces;
            } else {
                templates.push(template);
            }
        }
    } catch (error) { }
    
    res.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
