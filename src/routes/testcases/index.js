/**
 * Routes Index
 * Exports all route modules
 */

const instances = require('./instances');
const testcases = require('./testcases');
const profiles = require('./profiles');
const exportRoutes = require('./export');
const notesAttachments = require('./notes-attachments');

module.exports = {
  instances,
  testcases,
  profiles,
  export: exportRoutes,
  notesAttachments
};
