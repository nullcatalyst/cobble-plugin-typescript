import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { BuildSettings } from 'cobble/lib/composer/settings';
import { BasePlugin, ResetPluginWatchedFilesFn } from 'cobble/lib/plugins/base';
import { createMailbox } from 'cobble/lib/util/mailbox';
import { BaseWatcher } from 'cobble/lib/watcher/base';
import { Event, EventType } from 'cobble/lib/watcher/event';
import * as fs from 'fs';
import * as rollup from 'rollup';
import * as ts from 'typescript';

export class TypescriptPlugin extends BasePlugin {
    constructor(opts?: any) {
        super(opts);
    }

    override name(): string {
        return 'ts';
    }

    override provideProtocolExtensions(): string[] {
        return ['ts', 'tsx'];
    }

    override async process(watcher: BaseWatcher, settings: BuildSettings): Promise<ResetPluginWatchedFilesFn> {
        const srcs = settings.srcs.filter(src => src.protocol == this.name());
        const inputContents = srcs.map(src => `import "${src.path.toString().replaceAll('\\', '/')}";\n`).join('');
        const inputName = '__virtual__';

        const watchedFiles: { [filePath: string]: () => void } = {};
        const build = createMailbox(async () => {
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
                    typescript({
                        module: 'esnext',
                        // TODO: Make it so that the tsconfig is not required
                        tsconfig: settings.raw('tsconfig') || settings.basePath.join('tsconfig.json').toString(),
                        // TODO: This appears to be a bug in @rollup/plugin-typescript, it requires a root directory to be set for it to work
                        rootDir: settings.basePath.toString(),
                        include: [inputName, '*.ts', '**/*.ts'],
                        typescript: ts,
                    }),
                    nodeResolve({
                        browser: true,
                    }),
                    commonjs({
                        include: ['node_modules/**'],
                    }),
                    replace({
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
                } else {
                    if (chunkOrAsset.fileName === `${inputName}.js`) {
                        outputContents += chunkOrAsset.code;
                        continue;
                    }

                    // if (verbosity > 0) {
                    //     console.log(`WARN: unused code chunk: ${chunkOrAsset.fileName}`);
                    // }
                }
            }

            await fs.promises.writeFile(settings.outputPath.toString(), outputContents);
            await bundle.close();
        });
        await build(new Event(EventType.AddFile, settings.outputPath));

        return async () => {
            for (const [filePath, cleanup] of Object.entries(watchedFiles)) {
                cleanup();
            }
        };
    }
}
