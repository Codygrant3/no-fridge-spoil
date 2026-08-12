/// <reference types="node" />

import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCronRequest(request: Request): boolean {
    const secret = process.env.CRON_SECRET?.trim() ?? '';
    const authorization = request.headers.get('authorization');
    if (secret.length < 16 || !authorization?.startsWith('Bearer ')) return false;

    const supplied = Buffer.from(authorization.slice(7));
    const configured = Buffer.from(secret);
    return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export function cronConfigurationResponse(): Response | null {
    const secret = process.env.CRON_SECRET?.trim() ?? '';
    if (secret.length >= 16) return null;
    return Response.json({ message: 'Scheduled operations are not configured.' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
    });
}
