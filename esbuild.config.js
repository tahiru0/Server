import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { moduleSplitterPlugin } from './plugins/moduleSplitter.js';

const commonConfig = {
  entryPoints: ['server.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/server.js',
  target: 'node16',
  minify: true,
  sourcemap: true,
  treeShaking: true,
  mainFields: ['module', 'main'],
  allowOverwrite: true,
  loader: {
    '.js': 'jsx',
    '.mjs': 'jsx',
    '.cjs': 'jsx'
  },
  plugins: [
    nodeExternalsPlugin({
      allowList: [], // Các package cần bundle
      dependencies: true,
    }),
    moduleSplitterPlugin() // Plugin tự phân tích modules
  ],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

async function build() {
  try {
    // Build main file
    await esbuild.build(commonConfig);
    
    // Build ESM modules file
    await esbuild.build({
      entryPoints: ['dist/esm-modules.js'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: 'dist/esm-modules.js',
      target: 'node16',
      minify: true,
      sourcemap: true,
    });

    // Run fix-imports
    await import('./fix-imports.mjs');
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build(); 