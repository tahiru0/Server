const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Tạo thư mục dist nếu chưa tồn tại
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Plugin transform code
const transformPlugin = {
  name: 'transform',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');
      
      // Transform ESM to CJS
      contents = contents
        // Remove ESM imports
        .replace(/import\s+.*\s+from\s+['"]url['"]/g, '')
        .replace(/import\s+.*\s+from\s+['"]path['"]/g, '')
        
        // Replace ESM exports with CJS exports
        .replace(/export\s+{\s*(.*)\s*}/g, 'module.exports = { $1 }')
        .replace(/export\s+default/g, 'module.exports =')
        
        // Replace import.meta.url
        .replace(/import\.meta\.url/g, '""')
        
        // Replace ESM imports with requires
        .replace(/import\s+(\w+)\s+from\s+['"](.+)['"]/g, 'const $1 = require("$2")')
        .replace(/import\s*{\s*(.+)\s*}\s*from\s+['"](.+)['"]/g, 'const { $1 } = require("$2")');

      return { 
        contents,
        loader: 'js'
      };
    });
  }
};

// Build config
const config = {
  entryPoints: ['server.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/server.cjs',
  target: 'node16',
  minify: true,
  sourcemap: true,
  external: [
    'mongoose',
    'mongodb',
    'bson'
  ],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: `
      const path = require('path');
      const { fileURLToPath } = require('url');
    `
  },
  plugins: [transformPlugin]
};

esbuild.build(config)
  .then(() => {
    // Copy assets & env
    ['public', 'assets'].forEach(folder => {
      if (fs.existsSync(folder)) {
        fs.cpSync(folder, `dist/${folder}`, { recursive: true });
      }
    });
    fs.copyFileSync('.env.production', 'dist/.env');
    
    // Create package.json
    const pkg = {
      "type": "commonjs",
      "dependencies": {
        "mongoose": "^8.4.4",
        "mongodb": "^6.8.0",
        "bson": "^6.5.0"
      }
    };
    fs.writeFileSync('dist/package.json', JSON.stringify(pkg, null, 2));
    
    console.log('Build completed!');
  })
  .catch(() => process.exit(1));