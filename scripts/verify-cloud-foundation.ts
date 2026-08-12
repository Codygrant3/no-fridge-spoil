import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { handleAccountRequest } from '../api/account.ts';
import { handleMaintenanceRequest } from '../api/maintenance.ts';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;

if (!url || !publishableKey || !secretKey || !cronSecret) {
    throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, and CRON_SECRET.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const clientA = createClient(url, publishableKey, options);
const clientB = createClient(url, publishableKey, options);
const clientC = createClient(url, publishableKey, options);
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Verify-${crypto.randomUUID()}!`;
const createdUsers: User[] = [];
let verificationStep = 'initialization';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function createVerifiedUser(client: SupabaseClient, label: string): Promise<User> {
    const email = `cloud-${label}-${suffix}@example.test`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Cloud ${label}` },
    });
    if (createError || !created.user) throw createError || new Error(`Could not create ${label}.`);
    createdUsers.push(created.user);

    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return created.user;
}

async function householdFor(client: SupabaseClient, userId: string): Promise<string> {
    const { data, error } = await client
        .from('household_members')
        .select('household_id, role, households(name)')
        .eq('user_id', userId)
        .single();
    if (error) throw error;
    assert(data.role === 'owner', 'New account was not made household owner.');
    assert(data.households, 'New account household relation is missing.');
    return data.household_id;
}

async function reserve(
    userId: string,
    householdId: string,
    ipHash: string,
): Promise<{ allowed: boolean; reason: string; scan_id: string | null }> {
    const { data, error } = await admin.rpc('reserve_receipt_scan', {
        request_id: crypto.randomUUID(),
        request_user_id: userId,
        request_household_id: householdId,
        request_ip_hash: ipHash,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    assert(row, 'Quota reservation did not return a row.');
    return row;
}

async function accessToken(client: SupabaseClient): Promise<string> {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) throw error || new Error('Test session is missing.');
    return data.session.access_token;
}

try {
    verificationStep = 'creating test users';
    const userA = await createVerifiedUser(clientA, 'alpha');
    const userB = await createVerifiedUser(clientB, 'beta');
    verificationStep = 'checking account bootstrap';
    const householdA = await householdFor(clientA, userA.id);
    const householdB = await householdFor(clientB, userB.id);
    assert(householdA !== householdB, 'New users unexpectedly share a household.');

    const profileBId = crypto.randomUUID();
    verificationStep = 'creating household profile';
    const { error: profileError } = await clientB.from('household_profiles').insert({
        id: profileBId,
        household_id: householdB,
        name: 'Beta profile',
        created_by: userB.id,
    });
    if (profileError) throw profileError;

    const inventoryId = crypto.randomUUID();
    verificationStep = 'checking inventory RLS';
    const inventoryBase = {
        id: inventoryId,
        household_id: householdA,
        name: 'Verification milk',
        expiration_date: '2026-07-20',
        created_by: userA.id,
    };
    const { error: insertError } = await clientA.from('inventory_items').insert(inventoryBase);
    if (insertError) throw insertError;

    const receiptAliasId = crypto.randomUUID();
    verificationStep = 'checking receipt alias RLS';
    const receiptAlias = {
        id: receiptAliasId,
        household_id: householdA,
        merchant_name: 'Verification Market',
        merchant_key: 'verification market',
        raw_description: 'ORG WHL MLK',
        raw_description_key: 'org whl mlk',
        canonical_name: 'Organic Whole Milk',
        category: 'Dairy',
        created_by: userA.id,
        updated_by: userA.id,
    };
    const { error: aliasInsertError } = await clientA.from('receipt_item_aliases').insert(receiptAlias);
    if (aliasInsertError) throw aliasInsertError;

    const { data: ownAliases, error: ownAliasError } = await clientA
        .from('receipt_item_aliases')
        .select('id, canonical_name')
        .eq('id', receiptAliasId);
    if (ownAliasError) throw ownAliasError;
    assert(ownAliases.length === 1, 'Household member could not read its receipt alias.');

    const { data: foreignAliases, error: foreignAliasError } = await clientB
        .from('receipt_item_aliases')
        .select('id')
        .eq('id', receiptAliasId);
    if (foreignAliasError) throw foreignAliasError;
    assert(foreignAliases.length === 0, 'RLS exposed another household receipt alias.');

    const { error: crossAliasError } = await clientB.from('receipt_item_aliases').insert({
        ...receiptAlias,
        id: crypto.randomUUID(),
        created_by: userB.id,
        updated_by: userB.id,
    });
    assert(crossAliasError, 'A user could write a receipt alias into another household.');

    const { error: catalogInsertError } = await clientA.from('receipt_catalog_aliases').insert({
        merchant_name: 'Verification Market',
        merchant_key: 'verification market',
        raw_description: 'PRIVATE CATALOG TEST',
        raw_description_key: 'private catalog test',
        canonical_name: 'Private Catalog Test',
        source: 'cloud-verifier',
        verified_by: 'cloud-verifier',
    });
    assert(catalogInsertError, 'Authenticated client could write to the service-only catalog.');

    verificationStep = 'checking account export';
    const exportResponse = await handleAccountRequest(new Request('http://localhost/api/account', {
        headers: {
            Authorization: `Bearer ${await accessToken(clientA)}`,
            'X-Household-Id': householdA,
        },
    }));
    assert(exportResponse.status === 200, `Account export returned HTTP ${exportResponse.status}.`);
    const exported = await exportResponse.json() as {
        account?: { id?: string };
        data?: {
            inventory_items?: Array<{ id?: string }>;
            receipt_item_aliases?: Array<{ id?: string }>;
        };
    };
    assert(exported.account?.id === userA.id, 'Account export returned the wrong user.');
    assert(exported.data?.inventory_items?.some(item => item.id === inventoryId), 'Account export omitted inventory.');
    assert(
        exported.data?.receipt_item_aliases?.some(item => item.id === receiptAliasId),
        'Account export omitted learned receipt aliases.',
    );

    verificationStep = 'checking owner deletion guard';
    const { error: temporaryMemberError } = await admin.from('household_members').insert({
        household_id: householdA,
        user_id: userB.id,
        role: 'member',
    });
    if (temporaryMemberError) throw temporaryMemberError;
    const guardedDelete = await handleAccountRequest(new Request('http://localhost/api/account', {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${await accessToken(clientA)}`,
            'X-Household-Id': householdA,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation: userA.email }),
    }));
    assert(guardedDelete.status === 409, 'Owner deletion was not blocked while another member remained.');
    const { error: removeTemporaryMemberError } = await admin
        .from('household_members')
        .delete()
        .eq('household_id', householdA)
        .eq('user_id', userB.id);
    if (removeTemporaryMemberError) throw removeTemporaryMemberError;

    verificationStep = 'checking account deletion anonymization';
    const userC = await createVerifiedUser(clientC, 'gamma');
    const { error: sharedMemberError } = await admin.from('household_members').insert({
        household_id: householdA,
        user_id: userC.id,
        role: 'member',
    });
    if (sharedMemberError) throw sharedMemberError;
    const sharedShoppingId = crypto.randomUUID();
    const { error: sharedShoppingError } = await clientC.from('shopping_items').insert({
        id: sharedShoppingId,
        household_id: householdA,
        name: 'Shared deletion test',
        created_by: userC.id,
    });
    if (sharedShoppingError) throw sharedShoppingError;
    const sharedAliasId = crypto.randomUUID();
    const { error: sharedAliasError } = await clientC.from('receipt_item_aliases').insert({
        id: sharedAliasId,
        household_id: householdA,
        merchant_name: 'Shared Verification Market',
        merchant_key: 'shared verification market',
        raw_description: 'MLK MEMBER CORRECTION',
        raw_description_key: 'mlk member correction',
        canonical_name: 'Member Corrected Milk',
        category: 'Dairy',
        created_by: userC.id,
        updated_by: userC.id,
    });
    if (sharedAliasError) throw sharedAliasError;
    const deleteResponse = await handleAccountRequest(new Request('http://localhost/api/account', {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${await accessToken(clientC)}`,
            'X-Household-Id': householdA,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation: userC.email }),
    }));
    assert(deleteResponse.status === 200, `Solo account deletion returned HTTP ${deleteResponse.status}.`);
    const userCIndex = createdUsers.findIndex(user => user.id === userC.id);
    if (userCIndex >= 0) createdUsers.splice(userCIndex, 1);
    const { data: retainedSharedRow, error: retainedSharedError } = await admin
        .from('shopping_items')
        .select('id, created_by')
        .eq('id', sharedShoppingId)
        .single();
    if (retainedSharedError) throw retainedSharedError;
    assert(retainedSharedRow.created_by === null, 'Deleted member attribution was not anonymized.');
    const { data: retainedAliasRow, error: retainedAliasError } = await admin
        .from('receipt_item_aliases')
        .select('id, created_by, updated_by')
        .eq('id', sharedAliasId)
        .single();
    if (retainedAliasError) throw retainedAliasError;
    assert(
        retainedAliasRow.created_by === null && retainedAliasRow.updated_by === null,
        'Deleted member receipt alias attribution was not anonymized.',
    );

    const { data: leakedRows, error: leakError } = await clientB
        .from('inventory_items')
        .select('id')
        .eq('id', inventoryId);
    if (leakError) throw leakError;
    assert(leakedRows.length === 0, 'RLS exposed another household inventory row.');

    const { error: crossProfileError } = await clientA.from('inventory_items').insert({
        ...inventoryBase,
        id: crypto.randomUUID(),
        profile_id: profileBId,
    });
    assert(crossProfileError, 'Cross-household profile reference was accepted.');

    verificationStep = 'checking service-only RPC grants';
    const { error: clientRpcError } = await clientA.rpc('reserve_receipt_scan', {
        request_id: crypto.randomUUID(),
        request_user_id: userA.id,
        request_household_id: householdA,
        request_ip_hash: 'client-must-not-call',
    });
    assert(clientRpcError, 'Authenticated client could execute the service-only quota RPC.');

    let firstScanId: string | null = null;
    verificationStep = 'checking receipt quotas';
    const burstIpHash = `same-ip-${suffix}`;
    for (let index = 0; index < 10; index += 1) {
        const result = await reserve(userA.id, householdA, burstIpHash);
        assert(result.allowed, `Burst request ${index + 1} should have been allowed: ${JSON.stringify(result)}.`);
        firstScanId ??= result.scan_id;
    }
    const burstDenied = await reserve(userA.id, householdA, burstIpHash);
    assert(!burstDenied.allowed && burstDenied.reason === 'ip-burst-limit', 'IP burst limit did not activate.');

    for (let index = 0; index < 9; index += 1) {
        const result = await reserve(userA.id, householdA, `rotating-ip-${suffix}-${index}`);
        assert(result.allowed, `Daily quota setup request ${index + 1} should have been allowed.`);
    }
    const dailyDenied = await reserve(userA.id, householdA, `rotating-ip-${suffix}-final`);
    assert(!dailyDenied.allowed && dailyDenied.reason === 'user-daily-limit', 'User daily limit did not activate.');
    assert(firstScanId, 'No accepted receipt reservation was created.');

    const completion = {
        request_id: firstScanId,
        completion_status: 'succeeded',
        completion_http_status: 200,
        completion_item_count: 3,
        completion_units: 2,
        completion_cost_cents: 1.25,
        completion_metadata: { verification: true },
    };
    verificationStep = 'checking idempotent usage completion';
    const firstCompletion = await admin.rpc('complete_receipt_scan', completion);
    if (firstCompletion.error) throw new Error(`First completion failed: ${JSON.stringify(firstCompletion.error)}`);
    const repeatedCompletion = await admin.rpc('complete_receipt_scan', completion);
    if (repeatedCompletion.error) throw new Error(`Repeated completion failed: ${JSON.stringify(repeatedCompletion.error)}`);

    const { data: completionRows, error: countError } = await admin
        .from('usage_events')
        .select('id')
        .eq('user_id', userA.id)
        .eq('status', 'succeeded');
    if (countError) throw new Error(`Usage count failed: ${JSON.stringify(countError)}`);
    assert(completionRows.length === 1, 'Repeated completion double-counted receipt usage.');

    verificationStep = 'checking usage view RLS';
    const { data: ownUsage, error: ownUsageError } = await clientA
        .from('household_usage_daily')
        .select('successful_scans, denied_scans, total_units, total_cost_cents')
        .eq('household_id', householdA);
    if (ownUsageError) throw new Error(`Own usage view query failed: ${JSON.stringify(ownUsageError)}`);
    const ownUsageTotals = ownUsage.reduce((totals, row) => ({
        successful: totals.successful + Number(row.successful_scans),
        denied: totals.denied + Number(row.denied_scans),
        units: totals.units + Number(row.total_units),
        cost: totals.cost + Number(row.total_cost_cents),
    }), { successful: 0, denied: 0, units: 0, cost: 0 });
    assert(ownUsageTotals.successful === 1, 'Successful customer usage was not aggregated.');
    assert(ownUsageTotals.denied === 2, 'Denied customer usage was not aggregated.');
    assert(ownUsageTotals.units === 2, 'Billable page units were not aggregated.');
    assert(ownUsageTotals.cost === 1.25, 'Customer OCR cost was not aggregated.');

    const { data: foreignUsage, error: foreignUsageError } = await clientB
        .from('household_usage_daily')
        .select('household_id')
        .eq('household_id', householdA);
    if (foreignUsageError) throw new Error(`Usage view query failed: ${JSON.stringify(foreignUsageError)}`);
    assert(foreignUsage.length === 0, 'Usage view exposed another household.');

    verificationStep = 'checking retention cleanup';
    const { error: expiredInsertError } = await admin.from('usage_events').insert({
        household_id: householdA,
        user_id: userA.id,
        event_type: 'cleanup-test',
        status: 'test',
        expires_at: '2000-01-01T00:00:00.000Z',
    });
    if (expiredInsertError) throw expiredInsertError;
    const unauthorizedMaintenance = await handleMaintenanceRequest(new Request('http://localhost/api/maintenance'));
    assert(unauthorizedMaintenance.status === 401, 'Maintenance endpoint accepted an unsigned request.');
    const maintenance = await handleMaintenanceRequest(new Request('http://localhost/api/maintenance', {
        headers: { Authorization: `Bearer ${cronSecret}` },
    }));
    assert(maintenance.status === 200, `Authorized maintenance returned HTTP ${maintenance.status}.`);
    const { data: expiredRows, error: expiredCountError } = await admin
        .from('usage_events')
        .select('id')
        .eq('event_type', 'cleanup-test');
    if (expiredCountError) throw expiredCountError;
    assert(expiredRows.length === 0, 'Retention cleanup left expired usage records.');

    console.log('Cloud foundation verified: auth, tenant RLS, receipt aliases, service-only catalogs, quotas, usage, export, guarded deletion, anonymization, and retention cleanup.');
} catch (error) {
    const details = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`Cloud verification failed during ${verificationStep}: ${details || 'unknown error'}`, { cause: error });
} finally {
    for (const user of createdUsers.reverse()) {
        for (const column of ['created_by', 'updated_by'] as const) {
            const { error: attributionError } = await admin
                .from('receipt_item_aliases')
                .update({ [column]: null })
                .eq(column, user.id);
            if (attributionError) {
                console.error(`Alias cleanup failed for ${user.id}/${column}: ${attributionError.message}`);
            }
        }
        const { error } = await admin.auth.admin.deleteUser(user.id, false);
        if (error) console.error(`Cleanup failed for ${user.id}: ${error.message}`);
    }
}
