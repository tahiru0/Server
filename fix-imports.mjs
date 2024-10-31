import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'dist', 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

// Thêm các polyfills và fixes cần thiết
const fixes = `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

`;

content = fixes + content;
fs.writeFileSync(filePath, content); 