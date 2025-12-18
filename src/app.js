/**
 * Express Application Setup
 * Configures middleware and routes for both testcases and interfacedesign modules
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Global configuration
const globalConfig = require('./config');
const globalMiddleware = require('./middleware/global');
const globalRoutes = require('./routes/global');

// Import testcases module
let testcasesRoutes;
try {
  testcasesRoutes = require('./routes/testcases');
} catch (err) { console.info("Testcase Module not found") }

// Import interfacedesign module
let interfacedesignRoutes;
try {
  interfacedesignRoutes = require('./routes/interfacedesign');
} catch (err) { console.info("InterfaceDesign Module not found") }

const app = express();

// ============================================
// Middleware
// ============================================

app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(globalConfig.PUBLIC_DIR));

// ============================================
// API Routes - TestCases Module
// ============================================

// Instance management (no instance prefix)
app.use('/api/instances', globalRoutes.instances);
app.use('/api/templates', (req, res, next) => {
  // Redirect /api/templates to instances router which handles it
  req.url = '/templates' + req.url;
  globalRoutes.instances(req, res, next);
});

// Instance-specific routes for testcases
if(testcasesRoutes) {
  app.use('/api', testcasesRoutes.testcases);
  app.use('/api', testcasesRoutes.profiles);
  app.use('/api', testcasesRoutes.export);
  app.use('/api', testcasesRoutes.notesAttachments);
}

// ============================================
// API Routes - InterfaceDesign Module (placeholder)
// ============================================

// InterfaceDesign API routes
if (interfacedesignRoutes) {
  app.use('/api', interfacedesignRoutes.content);
}

// ============================================
// HTML Routing - Module Selection based on URL
// ============================================

// InterfaceDesign Module HTML
if (interfacedesignRoutes) {
  app.get('/:instance/interfacedesign', globalMiddleware.validateInstance, (req, res) => {
    res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'interfacedesign.html'));
  });

  app.get('/:instance/interfacedesign/*path', globalMiddleware.validateInstance, (req, res) => {
    res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'interfacedesign.html'));
  });
}

// TestCases Module HTML (default)
app.get('/:instance/*path', globalMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'testcases.html'));
});

app.get('/:instance', globalMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'testcases.html'));
});

// Root - Instance Selection (served by index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'index.html'));
});

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
