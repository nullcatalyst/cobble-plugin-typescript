import * as assert from 'assert';
import { BuildSettings } from 'cobble/lib/composer/settings';
import { ResolvedPath } from 'cobble/lib/util/resolved_path';
import { FakeWatcher } from 'cobble/lib/watcher/fake';
import { Event, EventType } from 'cobble/lib/watcher/event';
import * as fs from 'fs';

import * as tmp from 'tmp-promise';
import { TypescriptPlugin } from '../typescript';

describe('typescript plugin', () => {
    const defer: (() => void)[] = [];
    afterEach(() => {
        defer.forEach(f => f());
        defer.length = 0;
    });

    it('should clean up after itself', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'window.alert("hello");');
        await fs.promises.writeFile(ts2FilePath.toString(), 'window.alert("world");');
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new FakeWatcher();
        const plugin = new TypescriptPlugin({});
        const settings = new BuildSettings('linux');
        await settings.load(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`, `${plugin.name()}:${ts2FilePath.toString()}`],
            },
            basePath.join('build.json'),
        );

        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });

    it('should find other imports', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'import {double} from "./b"; window.alert(double(2));');
        await fs.promises.writeFile(
            ts2FilePath.toString(),
            'export function double(a: number): number { return 2 * a; }',
        );
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new FakeWatcher();
        const plugin = new TypescriptPlugin({});
        const settings = new BuildSettings('linux');
        await settings.load(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`],
                'tsconfig': tsconfigFilePath.toString(),
            } as any,
            basePath.join('build.json'),
        );

        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });

    it('should stop watching files that are no longer used', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'import {double} from "./b"; window.alert(double(2));');
        await fs.promises.writeFile(
            ts2FilePath.toString(),
            'export function double(a: number): number { return 2 * a; }',
        );
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new FakeWatcher();
        const plugin = new TypescriptPlugin({});
        const settings = new BuildSettings('linux');
        await settings.load(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`],
                'tsconfig': tsconfigFilePath.toString(),
            } as any,
            basePath.join('build.json'),
        );

        // First build
        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);

        // Change file and rebuild
        await fs.promises.writeFile(ts1FilePath.toString(), 'window.alert(4);');
        await watcher.emit(new Event(EventType.ChangeFile, ts1FilePath));
        assert.strictEqual(watcher.callbacks.size, 1);

        // Cleanup
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });
});
