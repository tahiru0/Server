// webpack.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import fs from 'fs';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  target: 'node',
  mode: 'production',
  entry: './server.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'server.js',
    library: {
      type: 'module'
    },
    chunkFormat: 'module'
  },
  experiments: {
    outputModule: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            configFile: path.resolve(__dirname, 'babel.config.cjs')
          }
        }
      },
      {
        test: /\.html$/,
        use: ['html-loader']
      }
    ]
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^(mock-aws-s3|aws-sdk|nock)$/
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'assets', to: 'assets' }
      ]
    }),
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CopyEnvFilesAndCreatePackageJson', (compilation) => {
          // Sao chép .env và .env.example vào thư mục dist
          fs.copyFileSync('.env', path.join(compiler.options.output.path, '.env'));
          fs.copyFileSync('.env.example', path.join(compiler.options.output.path, '.env.example'));
          
          // Tạo package.json mới trong thư mục dist
          const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
          const newPackageJson = {
            name: packageJson.name,
            version: packageJson.version,
            main: 'server.js',
            type: 'module',
            scripts: {
              start: 'node server.js'
            }
          };
          fs.writeFileSync(
            path.join(compiler.options.output.path, 'package.json'),
            JSON.stringify(newPackageJson, null, 2)
          );
        });
      }
    }
  ],
  resolve: {
    fallback: {
      "fs": false,
      "path": false,
      "crypto": false
    }
  },
  externalsPresets: { node: true }
};
