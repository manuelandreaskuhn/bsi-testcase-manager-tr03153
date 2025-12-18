/**
 * Middleware Router
 * Routes to testcases or interfacedesign middleware based on module
 */

const testcasesMiddleware = require('./testcases');
const interfacedesignMiddleware = require('./interfacedesign');
const globalMiddleware = require('./global');

module.exports = {
  testcases: testcasesMiddleware,
  interfacedesign: interfacedesignMiddleware,
  global: globalMiddleware
};
