#!/usr/bin/env node
/**
 * TestCase Manager Server
 * 
 * This file exists for backwards compatibility.
 * The actual server code is in src/server.js
 * 
 * Usage:
 *   node server.js      -> Works (loads src/server.js)
 *   npm start           -> Recommended (uses src/server.js directly)
 */

// Load the modular server
require('./src/server.js');
