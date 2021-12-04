import * as assert from 'assert';
import * as cobble from 'cobble';
import * as fs from 'fs';

import * as tmp from 'tmp-promise';
import { TypescriptPlugin, TypescriptSettings } from '../typescript';

describe('typescript plugin', () => {
    const defer: (() => void)[] = [];
    afterEach(() => {
        defer.forEach(f => f());
        defer.length = 0;
    });

    it('should clean up after itself', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = cobble.ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'window.alert("hello");');
        await fs.promises.writeFile(ts2FilePath.toString(), 'window.alert("world");');
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new cobble.FakeWatcher();
        const plugin = new TypescriptPlugin({ 'tmp': basePath.join('tmp'), 'verbose': 0 });
        const settings = await cobble.BuildSettings.from(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`, `${plugin.name()}:${ts2FilePath.toString()}`],
            },
            {
                'basePath': basePath,
                'pluginNames': [plugin.name()],
            },
        );

        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });

    it('should find other imports', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = cobble.ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'import {double} from "./b"; window.alert(double(2));');
        await fs.promises.writeFile(
            ts2FilePath.toString(),
            'export function double(a: number): number { return 2 * a; }',
        );
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new cobble.FakeWatcher();
        const plugin = new TypescriptPlugin({ 'tmp': basePath.join('tmp'), 'verbose': 0 });
        const settings = await cobble.BuildSettings.from<{ ts: TypescriptSettings }>(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`],
                'ts': {
                    'config': tsconfigFilePath.toString(),
                },
            },
            {
                'basePath': basePath,
                'pluginNames': [plugin.name()],
            },
        );

        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });

    it('should stop watching files that are no longer used', async () => {
        const { path: dirPath, cleanup: dirCleanup } = await tmp.dir({ unsafeCleanup: true });
        defer.push(dirCleanup);

        const basePath = cobble.ResolvedPath.absolute(dirPath);
        const ts1FilePath = basePath.join('a.ts');
        const ts2FilePath = basePath.join('b.ts');
        const tsconfigFilePath = basePath.join('tsconfig.json');
        await fs.promises.writeFile(ts1FilePath.toString(), 'import {double} from "./b"; window.alert(double(2));');
        await fs.promises.writeFile(
            ts2FilePath.toString(),
            'export function double(a: number): number { return 2 * a; }',
        );
        await fs.promises.writeFile(tsconfigFilePath.toString(), '{}');

        const watcher = new cobble.FakeWatcher();
        const plugin = new TypescriptPlugin({ 'tmp': basePath.join('tmp'), 'verbose': 0 });
        const settings = await cobble.BuildSettings.from<{ ts: TypescriptSettings }>(
            {
                'name': 'test',
                'srcs': [`${plugin.name()}:${ts1FilePath.toString()}`],
                'ts': {
                    'config': tsconfigFilePath.toString(),
                },
            },
            {
                'basePath': basePath,
                'pluginNames': [plugin.name()],
            },
        );

        // First build
        const cleanup = await plugin.process(watcher, settings);
        assert.strictEqual(watcher.callbacks.size, 2);

        // Change file and rebuild
        await fs.promises.writeFile(ts1FilePath.toString(), 'window.alert(4);');
        await watcher.emit(new cobble.Event(cobble.EventType.ChangeFile, ts1FilePath));
        assert.strictEqual(watcher.callbacks.size, 1);

        // Cleanup
        cleanup();
        assert.strictEqual(watcher.callbacks.size, 0);
    });
});
