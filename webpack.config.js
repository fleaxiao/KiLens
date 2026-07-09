/* eslint-env node */

'use strict';

const path = require('path');
const webpack = require('webpack');

const baseConfig = {
	mode: 'none',
	devtool: 'source-map',
	resolve: {
		mainFields: ['browser', 'module', 'main'],
		extensions: ['.ts', '.js'],
		fallback: {
			assert: require.resolve('assert'),
			path: require.resolve('path-browserify'),
			process: require.resolve('process/browser')
		}
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader'
					}
				]
			}
		]
	},
	plugins: [
		new webpack.ProvidePlugin({
			process: 'process/browser'
		})
	],
	externals: {
		vscode: 'commonjs vscode'
	}
};

const webExtensionConfig = {
	...baseConfig,
	target: 'webworker',
	entry: './src/web/extension.ts',
	output: {
		filename: 'extension.js',
		path: path.resolve(__dirname, 'dist', 'web'),
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../[resource-path]'
	}
};

const webTestConfig = {
	...baseConfig,
	target: 'web',
	entry: './src/web/test/suite/index.ts',
	output: {
		filename: 'index.js',
		path: path.resolve(__dirname, 'dist', 'web', 'test', 'suite'),
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../../../../[resource-path]'
	}
};

module.exports = [webExtensionConfig, webTestConfig];
