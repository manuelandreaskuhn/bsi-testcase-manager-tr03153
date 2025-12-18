/**
 * Utility exports
 */

const xml = require('./xml');
const fileSystem = require('./fileSystem');
const testcase = require('./testcase');

module.exports = {
  // XML utilities
  parseTestcaseXML: xml.parseTestcaseXML,
  saveTestcaseXML: xml.saveTestcaseXML,
  parseProfilesXML: xml.parseProfilesXML,
  buildProfilesXML: xml.buildProfilesXML,
  
  // File system utilities
  readFolderStructure: fileSystem.readFolderStructure,
  searchTestcases: fileSystem.searchTestcases,
  getDashboardData: fileSystem.getDashboardData,
  copyDirectory: fileSystem.copyDirectory,
  getProfilesStructure: fileSystem.getProfilesStructure,
  getHashtagsStructure: fileSystem.getHashtagsStructure,
  
  // Testcase utilities
  parseTestcaseId: testcase.parseTestcaseId,
  variantToNumber: testcase.variantToNumber,
  numberToVariant: testcase.numberToVariant,
  groupTestcasesWithVariants: testcase.groupTestcasesWithVariants,
  collectAllTestcases: testcase.collectAllTestcases,
  collectDetailedTestcases: testcase.collectDetailedTestcases,
  calculateDerivedProfiles: testcase.calculateDerivedProfiles
};
