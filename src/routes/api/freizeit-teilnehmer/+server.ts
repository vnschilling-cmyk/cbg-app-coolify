import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureFreizeitTeilnehmer, ensureFreizeiten, isJugendLeitung,
} from '$lib/server/admin';
import {
    loadGroupPersonIds, loadPersonBirthday, JUGEND_WORTDIENST_GROUP_ID,
} from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['freizeit', 'person_id', 'person_name', 'geburtsdatum',
    'mitfahren', 'bezahlt', 'betrag', 'fahrer', 'helfer', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
const yes = (v: any) => num(v) === 1;

/** Alter in Jahren aus yyyy-MM-dd (grob über das Jahr). */
function alter(geb: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(geb || '');
    if (!m) return null;
    const today = new Date();
    let a = today.getFullYear() - Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (today.getMonth() + 1 < mm ||
        (today.getMonth() + 1 === mm && today.getDate() < dd)) a--;
    return a >= 0 && a < 120 ? a : null;
}

/** GET /api/freizeit-teilnehmer?freizeit=ID -> {teilnehmer, stats, beitrag, canEdit}. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const freizeit = url.searchParams.get('freizeit') || '';
    if (!freizeit) return json({ error: 'freizeit nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureFreizeitTeilnehmer(pb);
        const list = await pb.collection('freizeit_teilnehmer').getFullList({
            filter: `freizeit="${freizeit}"`,
            sort: 'person_name',
        });

        // Beitrag aus der Freizeit (für Einnahmen-Berechnung).
        let beitrag = 0;
        try {
            await ensureFreizeiten(pb);
            const fz = await pb.collection('freizeiten').getOne(freizeit);
            beitrag = num(fz.teilnehmer_beitrag);
        } catch { /* ignore */ }

        // Verfügbare Prediger: Teilnehmer ∩ CT-Gruppe „Jugend Wortdienst" (228).
        let prediger = new Set<string>();
        try {
            prediger = await loadGroupPersonIds(user, JUGEND_WORTDIENST_GROUP_ID);
        } catch { /* ignore */ }

        const teilnehmer = list.map((t: any) => ({
            ...t,
            prediger: prediger.has(String(t.person_id)) ? 1 : 0,
        }));

        // Statistik (nur über Mitfahrende).
        const mit = teilnehmer.filter((t) => yes(t.mitfahren));
        const helfer = mit.filter((t) => yes(t.helfer));
        const jugend = mit.filter((t) => !yes(t.helfer));
        const ages = jugend
            .map((t) => alter((t.geburtsdatum || '').toString()))
            .filter((a): a is number => a != null);
        const einnahmen = mit
            .filter((t) => yes(t.bezahlt))
            .reduce((s, t) => s + (num(t.betrag) > 0 ? num(t.betrag) : beitrag), 0);

        const stats = {
            gesamt: teilnehmer.length,
            mitfahrer: mit.length,
            helfer: helfer.length,
            jugendliche: jugend.length,
            fahrer: mit.filter((t) => yes(t.fahrer)).length,
            prediger: mit.filter((t) => t.prediger === 1).length,
            altersdurchschnitt: ages.length
                ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10
                : 0,
            einnahmen,
            soll: mit.length * beitrag,
            offen: mit.filter((t) => !yes(t.bezahlt)).length,
        };

        return json({
            teilnehmer,
            stats,
            beitrag,
            canEdit: await isJugendLeitung(user),
        });
    } catch (e: any) {
        console.error('GET /api/freizeit-teilnehmer failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/freizeit-teilnehmer -> Teilnehmer hinzufügen (nur Jugendleitung). */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    if (!((body?.freizeit ?? '').toString())) {
        return json({ error: 'freizeit nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureFreizeitTeilnehmer(pb);
        const data = pick(body);
        if (data.mitfahren === undefined) data.mitfahren = 1;
        // Geburtsdatum aus CT ziehen, falls nicht mitgegeben (für Alter).
        if (!data.geburtsdatum && body.person_id) {
            data.geburtsdatum =
                await loadPersonBirthday(user, body.person_id.toString());
        }
        const rec = await pb.collection('freizeit_teilnehmer').create(data);
        return json({ teilnehmer: rec });
    } catch (e: any) {
        console.error('POST /api/freizeit-teilnehmer failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
