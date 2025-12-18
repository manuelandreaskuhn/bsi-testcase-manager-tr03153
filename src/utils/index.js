/**
 * Utils Router
 * Routes to testcases or interfacedesign utils based on module
 */

const testcasesUtils = require('./testcases');
const interfacedesignUtils = require('./interfacedesign');
const globalUtils = require('./global');

module.exports = {
  testcases: testcasesUtils,
  interfacedesign: interfacedesignUtils,
  global: globalUtils
};
