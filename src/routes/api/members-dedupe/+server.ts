/**
 * POST /api/members-dedupe  (nur Admin)
 * Bereinigt doppelte `members`-Datensätze: Wenn es zu einem Namen in einer
 * Gruppe genau EINEN Datensatz mit `ct_id` (Foto/CT-verknüpft) und zusätzlich
 * id-lose Dubletten (Altbestand) gibt, werden deren `allowed_services` in den
 * ct_id-Datensatz übernommen (Vereinigung) und die Dubletten gelöscht.
 *
 * Sicherheit: Gibt es zu einem Namen MEHRERE ct_id-Datensätze (zwei echte
 * Personen mit gleichem Namen), wird NICHT gelöscht (übersprungen).
 * Antwort: { deleted, merged, skipped, details: [...] }.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureAppConfig, getConfig, effectiveRole,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

const normName = (s: string) =>
    (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Admin-Gate.
    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        if (effectiveRole(user.id, user.role, roleMap) !== 'admin') {
            return json({ error: 'Forbidden' }, 403);
        }
    } catch {
        return json({ error: 'Forbidden' }, 403);
    }

    try {
        const pb = await adminPb();
        const rows = await pb.collection('members').getFullList();

        // Buckets je Gruppe + normalisierter Name.
        const buckets = new Map<string, any[]>();
        for (const m of rows) {
            const key = `${(m.group ?? '').toString()}|${normName((m.name ?? '').toString())}`;
            const arr = buckets.get(key);
            if (arr) arr.push(m);
            else buckets.set(key, [m]);
        }

        let deleted = 0;
        let merged = 0;
        let skipped = 0;
        const details: any[] = [];

        for (const [, list] of buckets) {
            const withId = list.filter((m) => (m.ct_id ?? '').toString().trim());
            const noId = list.filter((m) => !(m.ct_id ?? '').toString().trim());
            if (noId.length === 0) continue; // keine Dublette

            if (withId.length !== 1) {
                // 0 = nur id-lose (kein kanonischer Datensatz) ODER
                // >1 = mehrere echte Personen gleichen Namens -> nicht anfassen.
                skipped += noId.length;
                details.push({
                    name: (noId[0].name ?? '').toString(),
                    action: 'skipped',
                    reason: withId.length === 0 ? 'kein ct_id-Datensatz' : 'mehrdeutig',
                });
                continue;
            }

            const primary = withId[0];
            const primAllowed: string[] = Array.isArray(primary.allowed_services)
                ? primary.allowed_services.map((c: any) => String(c))
                : [];
            const union = new Set(primAllowed);
            for (const dup of noId) {
                const a = Array.isArray(dup.allowed_services)
                    ? dup.allowed_services.map((c: any) => String(c))
                    : [];
                for (const c of a) union.add(c);
            }
            // allowed_services nur aktualisieren, wenn sich etwas ergänzt.
            if (union.size !== primAllowed.length) {
                await pb.collection('members').update(primary.id, {
                    allowed_services: [...union],
                });
                merged++;
            }
            for (const dup of noId) {
                await pb.collection('members').delete(dup.id);
                deleted++;
            }
            details.push({
                name: (primary.name ?? '').toString(),
                action: 'deduped',
                removed: noId.length,
            });
        }

        return json({ deleted, merged, skipped, details });
    } catch (e: any) {
        console.error('POST /api/members-dedupe failed:', e?.message || e);
        return json({ error: e?.message || 'Bereinigung fehlgeschlagen' }, 500);
    }
}
