/**
 * Instance Validation Middleware
 * Validates instance parameter and sets instancePath on request
 */

const path = require('path');
const fsSync = require('fs');
const { INSTANCES_ROOT } = require('../../config/testcases');

/**
 * Middleware to validate instance exists and is accessible
 * Sets both instancePath (root) and testcasesPath (testcases subfolder)
 */
const validateInstance = (req, res, next) => {
  const { instance } = req.params;
  
  // Basic validation
  if (!instance || !/^[a-zA-Z0-9_-]+$/.test(instance)) {
    return res.status(400).json({ error: 'Invalid instance name' });
  }
  
  const instancePath = path.join(INSTANCES_ROOT, instance);
  
  // Check if instance directory exists
  if (!fsSync.existsSync(instancePath)) {
    return res.status(404).json({ error: `Instance '${instance}' not found` });
  }
  
  // Testcases are now in a 'testcases' subfolder
  const testcasesPath = path.join(instancePath, 'testcases');
  
  // Attach paths to request for use in route handlers
  req.instancePath = instancePath;
  req.testcasesPath = testcasesPath;
  req.instanceName = instance;
  
  next();
};

module.exports = validateInstance;
