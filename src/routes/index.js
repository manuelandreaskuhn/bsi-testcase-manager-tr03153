/**
 * Routes Router
 * Routes to testcases or interfacedesign routes based on module
 */

const testcasesRoutes = require('./testcases');
const interfacedesignRoutes = require('./interfacedesign');
const globalRoutes = require('./global');

module.exports = {
  testcases: testcasesRoutes,
  interfacedesign: interfacedesignRoutes,
  global: globalRoutes,
};
