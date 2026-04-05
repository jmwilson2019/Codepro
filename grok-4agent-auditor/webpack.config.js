const path = require('path');

/**
 * @type {import('webpack').Configuration}
 */
const config = {
  mode: 'development',
  target: 'node',
  entry: './src/extension.ts',
  externals: {
    vscode: 'commonjs vscode',
    openai: 'commonjs openai'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [{
      test: /\.ts$/,
      exclude: /node_modules/,
      use: [{
        loader: 'ts-loader'
      }]
    }]
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: 'log'
  }
};

module.exports = config;