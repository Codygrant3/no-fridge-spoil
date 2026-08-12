import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const migrationDirectory = path.resolve('supabase', 'migrations');
const files = (await readdir(migrationDirectory))
    .filter(file => file.endsWith('.sql'))
    .sort();
const errors: string[] = [];
const timestamps = new Set<string>();

for (const [index, file] of files.entries()) {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) {
        errors.push(`${file}: expected YYYYMMDDHHMMSS_snake_case.sql`);
        continue;
    }
    if (timestamps.has(match[1])) errors.push(`${file}: duplicate migration timestamp ${match[1]}`);
    timestamps.add(match[1]);
    if (index > 0 && file <= files[index - 1]) errors.push(`${file}: migrations are not strictly ordered`);

    const sql = (await readFile(path.join(migrationDirectory, file), 'utf8')).trim().toLowerCase();
    if (!sql.startsWith('begin;')) errors.push(`${file}: migration must start with begin;`);
    if (!sql.endsWith('commit;')) errors.push(`${file}: migration must end with commit;`);
}

if (files.length === 0) errors.push('No Supabase migrations found.');
if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Verified ${files.length} ordered Supabase migration${files.length === 1 ? '' : 's'}.`);
}
