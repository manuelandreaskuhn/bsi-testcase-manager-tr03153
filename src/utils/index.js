/**
 * Utils Router
 * Routes to testcases or interfacedesign utils based on module
 */

const testcasesUtils = require('./testcases');
const interfacedesignUtils = require('./interfacedesign');

module.exports = {
  testcases: testcasesUtils,
  interfacedesign: interfacedesignUtils
};
