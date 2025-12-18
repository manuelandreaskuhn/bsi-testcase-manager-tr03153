/**
 * Express Application Setup
 * Configures middleware and routes for both testcases and interfacedesign modules
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Global configuration
const globalConfig = require('./config');

// Import testcases module
const testcasesMiddleware = require('./middleware/testcases');
const testcasesRoutes = require('./routes/testcases');

// Import interfacedesign module
const interfacedesignMiddleware = require('./middleware/interfacedesign');
const interfacedesignRoutes = require('./routes/interfacedesign');

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
app.use('/api/instances', testcasesRoutes.instances);
app.use('/api/templates', (req, res, next) => {
  // Redirect /api/templates to instances router which handles it
  req.url = '/templates' + req.url;
  testcasesRoutes.instances(req, res, next);
});
app.use('/api/debug', (req, res, next) => {
  req.url = '/debug';
  testcasesRoutes.instances(req, res, next);
});

// Instance-specific routes for testcases
app.use('/api', testcasesRoutes.testcases);
app.use('/api', testcasesRoutes.profiles);
app.use('/api', testcasesRoutes.export);
app.use('/api', testcasesRoutes.notesAttachments);

// ============================================
// API Routes - InterfaceDesign Module (placeholder)
// ============================================

// InterfaceDesign API routes
app.use('/api/interfacedesign', interfacedesignRoutes.main);

// ============================================
// HTML Routing - Module Selection based on URL
// ============================================

// InterfaceDesign Module HTML
app.get('/:instance/interfacedesign', interfacedesignMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'interfacedesign.html'));
});

app.get('/:instance/interfacedesign/*path', interfacedesignMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'interfacedesign.html'));
});

// TestCases Module HTML (default)
app.get('/:instance/*path', testcasesMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'testcases.html'));
});

app.get('/:instance', testcasesMiddleware.validateInstance, (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'testcases.html'));
});

// Root - Instance Selection (served by testcases.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(globalConfig.PUBLIC_DIR, 'testcases.html'));
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
