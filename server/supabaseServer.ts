/// <reference types="node" />

import { createHmac } from 'node:crypto';
import {
    createClient,
    type SupabaseClient,
    type User,
} from '@supabase/supabase-js';

export type HouseholdRole = 'owner' | 'admin' | 'member';

interface ServerSupabaseConfig {
    url: string;
    publishableKey: string;
    secretKey: string;
}

export interface AuthenticatedRequest {
    accessToken: string;
    user: User;
    admin: SupabaseClient;
}

export interface AuthorizedHouseholdRequest extends AuthenticatedRequest {
    householdId: string;
    role: HouseholdRole;
}

export class ServerRequestError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'ServerRequestError';
        this.status = status;
        this.code = code;
    }
}

function firstConfiguredValue(...values: Array<string | undefined>): string | null {
    const value = values.find(candidate => candidate?.trim() && candidate.trim() !== 'undefined');
    return value?.trim() ?? null;
}

function getServerSupabaseConfig(): ServerSupabaseConfig {
    const url = firstConfiguredValue(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL);
    const publishableKey = firstConfiguredValue(
        process.env.SUPABASE_PUBLISHABLE_KEY,
        process.env.SUPABASE_ANON_KEY,
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        process.env.VITE_SUPABASE_ANON_KEY,
    );
    const secretKey = firstConfiguredValue(
        process.env.SUPABASE_SECRET_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    if (!url || !publishableKey || !secretKey) {
        throw new ServerRequestError(
            503,
            'account-service-not-configured',
            'Cloud account services are not configured on the app server.',
        );
    }

    return { url, publishableKey, secretKey };
}

function createRequestClients(): { verifier: SupabaseClient; admin: SupabaseClient } {
    const config = getServerSupabaseConfig();
    const auth = {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
    };

    return {
        verifier: createClient(config.url, config.publishableKey, { auth }),
        admin: createClient(config.url, config.secretKey, { auth }),
    };
}

export function createServiceAdminClient(): SupabaseClient {
    return createRequestClients().admin;
}

function getBearerToken(request: Request): string {
    const authorization = request.headers.get('authorization')?.trim() ?? '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) {
        throw new ServerRequestError(401, 'authentication-required', 'Sign in to continue.');
    }
    return match[1];
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest> {
    const accessToken = getBearerToken(request);
    const { verifier, admin } = createRequestClients();
    const { data, error } = await verifier.auth.getUser(accessToken);

    if (error || !data.user) {
        throw new ServerRequestError(401, 'invalid-session', 'Your session is invalid or has expired.');
    }

    return { accessToken, user: data.user, admin };
}

export async function authorizeHouseholdRequest(request: Request): Promise<AuthorizedHouseholdRequest> {
    const authenticated = await authenticateRequest(request);
    const householdId = request.headers.get('x-household-id')?.trim() ?? '';

    if (!isUuid(householdId)) {
        throw new ServerRequestError(400, 'household-required', 'Choose a valid household and try again.');
    }

    const { data, error } = await authenticated.admin
        .from('household_members')
        .select('role')
        .eq('household_id', householdId)
        .eq('user_id', authenticated.user.id)
        .maybeSingle();

    if (error) {
        console.error('Household authorization lookup failed:', error.message);
        throw new ServerRequestError(503, 'account-service-error', 'Household access could not be verified.');
    }
    if (!data) {
        throw new ServerRequestError(403, 'household-access-denied', 'You do not have access to this household.');
    }

    const role = data.role as HouseholdRole;
    if (!['owner', 'admin', 'member'].includes(role)) {
        throw new ServerRequestError(403, 'household-access-denied', 'You do not have access to this household.');
    }

    return { ...authenticated, householdId, role };
}

function requestIp(request: Request): string {
    const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
    const forwarded = request.headers.get('x-forwarded-for');
    const candidate = vercelForwarded || forwarded || request.headers.get('cf-connecting-ip') || 'unknown';
    return candidate.split(',')[0].trim().slice(0, 128) || 'unknown';
}

export function hashRequestIp(request: Request): string {
    const salt = firstConfiguredValue(process.env.RATE_LIMIT_SALT);
    if (!salt || salt.length < 32) {
        throw new ServerRequestError(
            503,
            'rate-limit-not-configured',
            'Receipt abuse protection is not configured on the app server.',
        );
    }

    return createHmac('sha256', salt).update(requestIp(request)).digest('hex');
}

export function serverRequestErrorResponse(error: unknown): Response | null {
    if (!(error instanceof ServerRequestError)) return null;
    return Response.json({
        status: error.code,
        message: error.message,
    }, {
        status: error.status,
        headers: { 'Cache-Control': 'no-store' },
    });
}
