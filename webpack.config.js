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

const desktopExtensionConfig = {
	...baseConfig,
	target: 'node',
	entry: './src/node/extension.ts',
	plugins: [],
	output: {
		filename: 'extension.js',
		path: path.resolve(__dirname, 'dist', 'node'),
		libraryTarget: 'commonjs2'
	}
};

const preview3dConfig = {
	...baseConfig,
	target: 'web',
	entry: './src/web/preview3d.ts',
	output: {
		filename: 'preview3d.js',
		chunkFilename: '[name].js',
		path: path.resolve(__dirname, 'media', '3d'),
		library: { name: 'KiLens3D', type: 'var' }
	}
};

module.exports = env => env?.extensionOnly ? [webExtensionConfig, desktopExtensionConfig, preview3dConfig] : [webExtensionConfig, desktopExtensionConfig, webTestConfig, preview3dConfig];
