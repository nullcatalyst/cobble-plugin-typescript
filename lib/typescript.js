"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypescriptPlugin = void 0;
const plugin_commonjs_1 = __importDefault(require("@rollup/plugin-commonjs"));
const plugin_node_resolve_1 = __importDefault(require("@rollup/plugin-node-resolve"));
const plugin_replace_1 = __importDefault(require("@rollup/plugin-replace"));
const plugin_typescript_1 = __importDefault(require("@rollup/plugin-typescript"));
const cobble = __importStar(require("cobble"));
const fs = __importStar(require("fs"));
const rollup = __importStar(require("rollup"));
const terser = __importStar(require("terser"));
const ts = __importStar(require("typescript"));
class TypescriptPlugin extends cobble.BasePlugin {
    name() {
        return 'ts';
    }
    provideProtocolExtensions() {
        return ['ts', 'tsx'];
    }
    async process(watcher, settings) {
        const inputContents = this.filterSrcs(settings)
            .map(src => `import "${src.path.toString().replaceAll('\\', '/')}";\n`)
            .join('');
        const inputName = '__virtual__';
        const pluginSettings = settings.pluginSettings(this);
        const tsconfig = settings.basePath.join(pluginSettings['config'] || 'tsconfig.json');
        const watchedFiles = {};
        const build = cobble.createMailbox(async () => {
            const bundle = await rollup.rollup({
                input: inputName,
                plugins: [
                    {
                        name: 'virtual',
                        resolveId(id) {
                            if (id === inputName) {
                                return inputName;
                            }
                        },
                        load(id) {
                            if (id === inputName) {
                                return { code: inputContents };
                            }
                        },
                    },
                    (0, plugin_typescript_1.default)({
                        module: 'esnext',
                        // TODO: Make it so that the tsconfig is not required
                        tsconfig: tsconfig.toString(),
                        // TODO: This appears to be a bug in @rollup/plugin-typescript, it requires a root directory to be set for it to work
                        rootDir: settings.basePath.toString(),
                        include: [inputName, '*.ts', '**/*.ts'],
                        typescript: ts,
                    }),
                    (0, plugin_node_resolve_1.default)({
                        browser: true,
                    }),
                    (0, plugin_commonjs_1.default)({
                        include: ['node_modules/**'],
                    }),
                    (0, plugin_replace_1.default)({
                        preventAssignment: true,
                        'process.env.NODE_ENV': settings.release
                            ? JSON.stringify('production')
                            : JSON.stringify('development'),
                    }),
                ],
            });
            const { output } = await bundle.generate({
                format: 'cjs',
            });
            // Make a copy of the previous watched files
            // This will be used to determine whether new files are being watched, as well as to stop watching unused files
            const prevWatchFiles = Object.assign({}, watchedFiles);
            for (const watchFile of bundle.watchFiles) {
                if (watchFile === inputName) {
                    continue;
                }
                const filePath = settings.basePath.join(watchFile);
                if (filePath.toString() in watchedFiles) {
                    // This file is already being watched and is still being used, don't remove it from the list
                    delete prevWatchFiles[filePath.toString()];
                    continue;
                }
                // Start watching a new file
                const cleanup = watcher.add(filePath, build);
                watchedFiles[filePath.toString()] = cleanup;
            }
            // Remove any files that are no longer needed
            for (const [filePath, cleanup] of Object.entries(prevWatchFiles)) {
                delete watchedFiles[filePath.toString()];
                cleanup();
            }
            let outputContents = '';
            for (const chunkOrAsset of output) {
                if (chunkOrAsset.type === 'asset') {
                    // if (verbosity > 0) {
                    //     console.log(`WARN: unused rollup asset: ${chunkOrAsset.fileName}`);
                    // }
                }
                else {
                    if (chunkOrAsset.fileName === `${inputName}.js`) {
                        outputContents += chunkOrAsset.code;
                        continue;
                    }
                    // if (verbosity > 0) {
                    //     console.log(`WARN: unused code chunk: ${chunkOrAsset.fileName}`);
                    // }
                }
            }
            await bundle.close();
            if (this.release) {
                const result = await terser.minify(outputContents, {
                    compress: true,
                    toplevel: true,
                    mangle: {
                        keep_classnames: false,
                        keep_fnames: false,
                        module: false,
                        properties: {
                            builtins: false,
                            debug: false,
                            keep_quoted: true,
                            regex: /^_/,
                        },
                        toplevel: true,
                    },
                    output: {
                        comments: false,
                    },
                });
                outputContents = result.code;
            }
            await fs.promises.writeFile(settings.outDir.join(`${settings.name}.js`).toString(), outputContents);
        });
        await build(new cobble.Event(cobble.EventType.AddFile, settings.outDir));
        return async () => {
            for (const [filePath, cleanup] of Object.entries(watchedFiles)) {
                cleanup();
            }
        };
    }
}
exports.TypescriptPlugin = TypescriptPlugin;
//# sourceMappingURL=typescript.js.map