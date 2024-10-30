const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './server.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'server.js',
    // Xóa library config vì không cần thiết cho CommonJS
  },
  // Xóa experiments vì không cần thiết cho CommonJS
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
          fs.copyFileSync('.env', path.join(compiler.options.output.path, '.env'));
          fs.copyFileSync('.env.example', path.join(compiler.options.output.path, '.env.example'));
          
          const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
          const newPackageJson = {
            name: packageJson.name,
            version: packageJson.version,
            main: 'server.js',
            // Xóa type module vì chúng ta đang sử dụng CommonJS
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