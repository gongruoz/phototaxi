#!/usr/bin/env node
// Print before loading anything else so we see output even if index.js hangs during import
process.stdout.write('[s] server starting...\n');
await import('./index.js');
