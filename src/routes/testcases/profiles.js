/**
 * Profile Routes
 * Handles ICS checklist and profile configuration
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { validateInstance } = require('../../middleware/global');
const { 
  getProfilesStructure, 
  getHashtagsStructure,
  parseProfilesXML, 
  buildProfilesXML,
  calculateDerivedProfiles 
} = require('../../utils/testcases');

/**
 * GET /api/:instance/profiles
 * Get profiles with their testcases
 */
router.get('/:instance/profiles', validateInstance, async (req, res) => {
  try {
    const profiles = await getProfilesStructure(req.testcasesPath);
    res.json({ profiles: Object.values(profiles) });
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/hashtags
 * Get hashtags (RefFunction and RefUser) with their testcases
 */
router.get('/:instance/hashtags', validateInstance, async (req, res) => {
  try {
    const hashtags = await getHashtagsStructure(req.testcasesPath);
    res.json({ 
      functions: Object.values(hashtags.functions).sort((a, b) => a.name.localeCompare(b.name)),
      users: Object.values(hashtags.users).sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error) {
    console.error('Error getting hashtags:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/profile-config
 * Get ICS checklist configuration
 * Reads from profiles.xml if exists, otherwise falls back to profiles-template.xml
 */
router.get('/:instance/profile-config', validateInstance, async (req, res) => {
  try {
    // profiles.xml is now in testcases/ subfolder
    const profilesPath = path.join(req.testcasesPath, 'profiles.xml');
    const templatePath = path.join(req.testcasesPath, 'profiles-template.xml');
    
    // Prefer profiles.xml (user data), fall back to template
    let xmlPath = null;
    if (fsSync.existsSync(profilesPath)) {
      xmlPath = profilesPath;
    } else if (fsSync.existsSync(templatePath)) {
      xmlPath = templatePath;
    }
    
    if (!xmlPath) {
      return res.json({ 
        exists: false, 
        message: 'No profiles configuration found' 
      });
    }
    
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    const profilesData = await parseProfilesXML(xmlContent);
    
    // Calculate derived/active profiles
    const derivedProfiles = calculateDerivedProfiles(profilesData);
    
    res.json({ 
      exists: true,
      ...profilesData,
      derivedProfiles,        // Frontend expects this name
      activeProfiles: derivedProfiles  // Also include for backwards compatibility
    });
  } catch (error) {
    console.error('Error reading profile config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/:instance/profile-config
 * Save ICS checklist configuration
 * Always saves to profiles.xml (not template)
 */
router.put('/:instance/profile-config', validateInstance, async (req, res) => {
  try {
    const profilesPath = path.join(req.testcasesPath, 'profiles.xml');
    const profilesData = req.body;
    
    // Build and save XML
    const xml = buildProfilesXML(profilesData);
    await fs.writeFile(profilesPath, xml, 'utf-8');
    
    // Calculate derived profiles for response
    const derivedProfiles = calculateDerivedProfiles(profilesData);
    
    res.json({ 
      success: true, 
      message: 'Profile configuration saved',
      derivedProfiles,        // Frontend expects this name
      activeProfiles: derivedProfiles  // Also include for backwards compatibility
    });
  } catch (error) {
    console.error('Error saving profile config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/:instance/profile-config
 * Reset ICS checklist configuration
 */
router.delete('/:instance/profile-config', validateInstance, async (req, res) => {
  try {
    const profilesPath = path.join(req.testcasesPath, 'profiles.xml');
    try { 
      await fs.unlink(profilesPath); 
    } catch {}
    res.json({ success: true, message: 'Profil-Konfiguration zurückgesetzt' });
  } catch (error) {
    console.error('Error deleting profile config:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
