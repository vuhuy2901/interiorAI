const fs = require('node:fs');
const path = require('node:path');

const nativeFile = path.resolve(__dirname, '..', 'node_modules', 'rollup', 'dist', 'native.js');
if (fs.existsSync(nativeFile)) {
  fs.writeFileSync(nativeFile, "module.exports = require('@rollup/wasm-node/dist/native.js');\n");
  console.log('[atelier] Rollup WASM fallback enabled');
}
