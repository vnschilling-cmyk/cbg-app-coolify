/**
 * Bruderrat-Daten (Agenda, Beschlüsse, Aufgaben) – ohne eigene Collections,
 * als JSON-Arrays in `app_config` (Schlüssel `bruderrat_<kind>`).
 *
 *   GET    /api/bruderrat/<kind>            -> { items: [...] }
 *   POST   /api/bruderrat/<kind>   {item}   -> { item }  (id wird vergeben)
 *   PATCH  /api/bruderrat/<kind>   {id,...}  -> { item }
 *   DELETE /api/bruderrat/<kind>?id=…        -> { ok: true }
 *
 * kind ∈ { agendas, decisions, tasks }.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureAppConfig, getConfig, setConfig, genId } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

const KINDS = new Set([
    'agendas', 'decisions', 'tasks', 'agenda_protocols', 'deferred',
]);
const keyFor = (kind: string) => `bruderrat_${kind}`;

function badKind(kind: string) {
    return !KINDS.has(kind);
}

async function readList(pb: any, kind: string): Promise<any[]> {
    const v = await getConfig(pb, keyFor(kind));
    return Array.isArray(v) ? v : [];
}

export async function GET({ request, params }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (badKind(params.kind)) return json({ error: 'Unbekannter Bereich' }, 404);
    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);
        return json({ items: await readList(pb, params.kind) });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler beim Laden' }, 500);
    }
}

export async function POST({ request, params }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (badKind(params.kind)) return json({ error: 'Unbekannter Bereich' }, 404);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const list = await readList(pb, params.kind);
        const item = {
            ...body,
            id: genId(),
            createdAt: new Date().toISOString(),
        };
        list.unshift(item); // neueste zuerst
        await setConfig(pb, keyFor(params.kind), list);
        // Beim Anlegen einer Agenda: vertagte Punkte „verbrauchen" (die für
        // dieses Datum bzw. ohne Datum gemerkten kommen nun in der Agenda vor).
        if (params.kind === 'agendas') {
            try {
                const dlist = await readList(pb, 'deferred');
                const aDate = ((item as any).date || '').toString();
                const remain = dlist.filter((d: any) => {
                    const dd = (d?.date || '').toString();
                    return dd && dd !== aDate;
                });
                if (remain.length !== dlist.length) {
                    await setConfig(pb, keyFor('deferred'), remain);
                }
            } catch { /* Vertagungen optional */ }
        }
        return json({ item });
    } catch (e: any) {
        return json({ error: e?.message || 'Anlegen fehlgeschlagen' }, 500);
    }
}

export async function PATCH({ request, params }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (badKind(params.kind)) return json({ error: 'Unbekannter Bereich' }, 404);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const id = (body?.id || '').toString();
        if (!id) return json({ error: 'id fehlt' }, 400);
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const list = await readList(pb, params.kind);
        const i = list.findIndex((x: any) => x?.id === id);
        if (i < 0) return json({ error: 'Nicht gefunden' }, 404);
        list[i] = { ...list[i], ...body, id };
        await setConfig(pb, keyFor(params.kind), list);
        return json({ item: list[i] });
    } catch (e: any) {
        return json({ error: e?.message || 'Aktualisieren fehlgeschlagen' }, 500);
    }
}

export async function DELETE({ request, params, url }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (badKind(params.kind)) return json({ error: 'Unbekannter Bereich' }, 404);
    try {
        const id = url.searchParams.get('id') || '';
        if (!id) return json({ error: 'id fehlt' }, 400);
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const list = await readList(pb, params.kind);
        const next = list.filter((x: any) => x?.id !== id);
        await setConfig(pb, keyFor(params.kind), next);
        return json({ ok: true });
    } catch (e: any) {
        return json({ error: e?.message || 'Löschen fehlgeschlagen' }, 500);
    }
}
