import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureFreizeitTeilnehmer, isJugendLeitung } from '$lib/server/admin';
import { loadJugendGroupMembers, loadPersonsBirthdayMap } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * POST /api/freizeit-teilnehmer/gruppe { freizeit } -> alle Mitglieder der
 * CT-Jugendgruppe (19) als Teilnehmer anlegen (die noch nicht vorhanden sind).
 * Nur Jugendleitung.
 */
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
    const freizeit = (body?.freizeit ?? '').toString();
    if (!freizeit) return json({ error: 'freizeit nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureFreizeitTeilnehmer(pb);

        const vorhanden = await pb.collection('freizeit_teilnehmer').getFullList({
            filter: `freizeit="${freizeit}"`,
        });
        const haveIds = new Set(vorhanden.map((t: any) => String(t.person_id)));

        const { people } = await loadJugendGroupMembers(user);
        const bdays = await loadPersonsBirthdayMap(user);

        let added = 0;
        for (const p of people) {
            const id = String(p.id);
            if (!id || haveIds.has(id)) continue;
            await pb.collection('freizeit_teilnehmer').create({
                freizeit,
                person_id: id,
                person_name: p.name,
                geburtsdatum: bdays.get(id) || '',
                mitfahren: 1,
                bezahlt: 0,
                betrag: 0,
                fahrer: 0,
                helfer: 0,
            });
            added++;
        }
        return json({ added });
    } catch (e: any) {
        console.error('POST /api/freizeit-teilnehmer/gruppe failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
