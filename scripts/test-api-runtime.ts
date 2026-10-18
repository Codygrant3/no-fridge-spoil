import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Vite/Vitest resolve extensionless imports that deployed Node ESM cannot.
// Emit the API graph, then load it in a fresh Node process without a TS loader.
const root = process.cwd();
const tempRoot = path.join(root, 'node_modules', '.tmp');
await mkdir(tempRoot, { recursive: true });
const output = await mkdtemp(path.join(tempRoot, 'api-runtime-'));
if (!output.startsWith(tempRoot + path.sep)) throw new Error('Unexpected smoke output path.');

try {
    const configPath = path.join(root, 'tsconfig.api.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
        noEmit: false,
        noEmitOnError: true,
        incremental: false,
        tsBuildInfoFile: undefined,
        rootDir: root,
        outDir: output,
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length) {
        throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => root,
            getNewLine: () => '\n',
        }));
    }
    if (program.emit().emitSkipped) throw new Error('API JavaScript emit was skipped.');

    await writeFile(path.join(output, 'package.json'), '{"type":"module"}');
    const smokePath = path.join(output, 'smoke.mjs');
    await writeFile(smokePath, `
import assert from 'node:assert/strict';

globalThis.fetch = async () => { throw new Error('Runtime smoke tests must not access the network.'); };
const cases = [
    ['health', 200, 'healthy'],
    ['account', 401, 'authentication-required'],
    ['household', 401, 'authentication-required'],
    ['receipt-jobs', 401, 'authentication-required'],
    ['receipt-aliases', 405],
    ['receipt-ocr', 503],
    ['receipt-worker', 503],
    ['maintenance', 503],
];
for (const [route, status, bodyStatus] of cases) {
    const { default: handler } = await import('./api/' + route + '.js');
    const response = await handler.fetch(new Request('http://localhost/api/' + route));
    assert.equal(response.status, status, route);
    assert.match(response.headers.get('content-type') ?? '', /application\\/json/, route);
    const body = await response.json();
    if (bodyStatus) assert.equal(body.status, bodyStatus, route);
    if (route === 'health') assert.equal(body.checks, undefined);
    console.log(route + ': HTTP ' + response.status);
}
console.log('All 8 emitted API handlers loaded and responded in plain Node ESM.');
`);
    // Do not pass account/provider/cron credentials or NODE_OPTIONS to the child.
    const env: NodeJS.ProcessEnv = {};
    for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
        if (process.env[name]) env[name] = process.env[name];
    }
    execFileSync(process.execPath, [smokePath], {
        cwd: root,
        env,
        stdio: 'inherit',
        timeout: 30_000,
    });
} finally {
    await rm(output, { recursive: true, force: true });
}
