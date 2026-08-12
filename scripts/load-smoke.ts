const baseUrl = (process.argv[2] || process.env.LOAD_SMOKE_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const requests = Number(process.env.LOAD_SMOKE_REQUESTS || '20');
const startedAt = performance.now();

const results = await Promise.all(Array.from({ length: requests }, async () => {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Accept: 'application/json' } });
    return { status: response.status, durationMs: performance.now() - started };
}));

const failures = results.filter(result => result.status >= 500);
const durations = results.map(result => result.durationMs).sort((a, b) => a - b);
const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0;
console.log(JSON.stringify({
    requests,
    failures: failures.length,
    p95Ms: Math.round(p95),
    totalMs: Math.round(performance.now() - startedAt),
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
