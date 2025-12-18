/**
 * Routes Router
 * Routes to testcases or interfacedesign routes based on module
 */

const testcasesRoutes = require('./testcases');
const interfacedesignRoutes = require('./interfacedesign');

module.exports = {
  testcases: testcasesRoutes,
  interfacedesign: interfacedesignRoutes
};
