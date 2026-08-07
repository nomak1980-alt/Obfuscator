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
            // T10: caughtErrors: 'none' entfernt das Rauschen der bewusst
            // ungenutzten catch-Parameter. Erst dadurch bleiben nur inhaltliche
            // Treffer stehen – und erst dann ist --max-warnings 0 sinnvoll.
            'no-unused-vars': ['warn', { caughtErrors: 'none' }]
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
                __dirname: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                // Browser-Globals: tauchen in page.evaluate()-Callback-Bodies auf,
                // die ESLint als normalen Node-Code parst, aber im Browser laufen.
                document: 'readonly',
                window: 'readonly',
                getComputedStyle: 'readonly',
                localStorage: 'readonly',
                ObfuscatorUI: 'readonly'
            }
        },
        rules: {
            // T10: caughtErrors: 'none' entfernt das Rauschen der bewusst
            // ungenutzten catch-Parameter. Erst dadurch bleiben nur inhaltliche
            // Treffer stehen – und erst dann ist --max-warnings 0 sinnvoll.
            'no-unused-vars': ['warn', { caughtErrors: 'none' }]
        }
    },
    {
        ignores: ['node_modules/', 'publish/', 'coverage/']
    }
];
