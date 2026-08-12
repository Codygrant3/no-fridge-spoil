import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const BUILD_DIR = path.resolve('dist');
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.txt',
  '.webmanifest',
  '.xml',
]);

const FORBIDDEN_PATTERNS = [
  { label: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { label: 'Gemini API endpoint', pattern: /generativelanguage\.googleapis\.com/i },
  { label: 'Google TTS endpoint', pattern: /texttospeech\.googleapis\.com/i },
  { label: 'retired Google GenAI SDK', pattern: /@google\/genai/i },
] as const;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );

  return files.flat();
}

async function main(): Promise<void> {
  const files = (await listFiles(BUILD_DIR)).filter((file) =>
    TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );
  const findings: Array<{ label: string; file: string }> = [];

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(contents)) {
        findings.push({
          label: forbidden.label,
          file: path.relative(process.cwd(), file),
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error('Production build blocked by forbidden Google credentials or integrations:');
    for (const finding of findings) {
      console.error(`- ${finding.label}: ${finding.file}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Build security scan passed (${files.length} text assets checked).`);
}

main().catch((error: unknown) => {
  console.error('Build security scan could not complete.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
