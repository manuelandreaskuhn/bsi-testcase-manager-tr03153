#!/usr/bin/env node
/**
 * TestCase Manager Server
 * Entry point for the application
 */

const fs = require('fs');
const path = require('path');
const app = require('./app');
const { PORT, INSTANCES_ROOT, TEMPLATES_ROOT } = require('./config');

// ============================================
// Startup
// ============================================

// Ensure required directories exist
if (!fs.existsSync(INSTANCES_ROOT)) {
  fs.mkdirSync(INSTANCES_ROOT, { recursive: true });
}

// Count instances and templates
let instanceCount = 0;
let templateCount = 0;

try {
  instanceCount = fs.readdirSync(INSTANCES_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .length;
} catch {}

try {
  templateCount = fs.readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .length;
} catch {}

// Start server
app.listen(PORT, () => {
  console.log(`
=================================================
TestCase and Interface Design Manager Server
=================================================
Server läuft auf: http://localhost:${PORT}
Instanzen Verzeichnis: ${INSTANCES_ROOT}
Templates Verzeichnis: ${TEMPLATES_ROOT}
  → ${instanceCount} Instanz(en) gefunden
  → ${templateCount} Template(s) gefunden

Verfügbare URLs:
  http://localhost:${PORT}/           - Instanz-Auswahl
  http://localhost:${PORT}/<instance> - Instanz öffnen
  http://localhost:${PORT}/<instance>/interfacedesign - InterfaceDesign öffnen
=================================================
`);
});
