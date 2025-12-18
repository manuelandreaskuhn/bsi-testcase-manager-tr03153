/**
 * Instance Management Routes
 * Handles listing, creating, and managing instances
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const { INSTANCES_ROOT, TEMPLATES_ROOT } = require('../../config');

// Valid instance name pattern (URL-safe)
const INSTANCE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;


async function getInstances() {
  try {
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
          filteredTestcaseCount: 0,
          hasInterfaces: false,
          hasTestCases: false
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

          info.hasTestCases = info.testcaseCount > 0;
        } catch (err) {
          console.warn('Error counting testcases:', err.message);
        }
        
        instances.push(info);
      }
    }
    return instances;
  } catch (error) {
    console.error('Error listing instances:', error);
    throw error;
  }
}


async function getTemplates() {
  try {
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
          testcaseCount: 0,
          hasInterfaces: false,
          hasTestCases: false
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
    return templates;
  } catch (error) {
    console.error('Error listing templates:', error);
    throw error;
  }
}


module.exports = {
  getInstances,
  getTemplates
}