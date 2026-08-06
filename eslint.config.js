'use strict';

const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        files: ['obfuscator.js', 'obfuscator-core.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                confirm: 'readonly',
                navigator: 'readonly',
                FileReader: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                console: 'readonly',
                module: 'writable',
                require: 'readonly',
                self: 'readonly',
                ObfuscatorCore: 'writable'
            }
        },
        rules: {
            'no-unused-vars': 'warn'
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'writable',
                process: 'readonly',
                console: 'readonly',
                __dirname: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'warn'
        }
    },
    {
        ignores: ['node_modules/', 'publish/', 'tests.html']
    }
];
