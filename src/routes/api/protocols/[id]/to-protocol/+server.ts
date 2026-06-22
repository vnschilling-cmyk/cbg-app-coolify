/**
 * POST /api/protocols/[id]/to-protocol
 * Übernimmt ein importiertes (KI-überarbeitetes) Protokoll als reguläres
 * Bruderrat-Protokoll (kind=meetings, Status „protokolliert"): die KI
 * strukturiert die Fassung in TOP-Items, die ins Bruderrat-„meetings"-Array
 * (app_config) geschrieben werden. Idempotent über importProtocolId; das
 * Original bleibt über die protocols-Datei verknüpft (download).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, getLlmConfig, geminiProtocolToItems, ensureAppConfig,
    ensureBruderratMeetings, getConfig, setConfig, genId,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request, params }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    try {
        const pb = await adminPb();
        const llm = await getLlmConfig(pb);
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 400);

        const rec = await pb.collection('protocols').getOne(params.id!);
        const source = (rec.reworked_text || rec.original_text || '').toString();
        if (!source.trim()) {
            return json(
                { error: 'Bitte das Protokoll zuerst per KI auswerten.' }, 422);
        }

        const structured = await geminiProtocolToItems(source, llm.key);
        if (!structured.items.length) {
            return json({ error: 'Keine TOPs erkennbar.' }, 422);
        }

        const date = (structured.date || rec.date || '').toString().slice(0, 10);

        await ensureAppConfig(pb);
        await ensureBruderratMeetings(pb);
        const v = await getConfig(pb, 'bruderrat_meetings');
        const list: any[] = Array.isArray(v) ? v : [];

        // Idempotent: bereits übernommenes Protokoll aktualisieren statt doppeln.
        const existingIdx = list.findIndex(
            (m: any) => (m?.importProtocolId || '') === rec.id);

        const base = {
            title: (rec.title || '').toString(),
            date,
            status: 'protokolliert',
            mode: 'top',
            moderator: structured.moderator || '',
            attendance: [],
            items: structured.items,
            importProtocolId: rec.id,
            importFileName: (rec.file_name || '').toString(),
            anwesendText: structured.anwesend || '',
        };

        let meetingId: string;
        if (existingIdx >= 0) {
            meetingId = list[existingIdx].id || genId();
            list[existingIdx] = { ...list[existingIdx], ...base, id: meetingId };
        } else {
            meetingId = genId();
            list.unshift({ ...base, id: meetingId, createdAt: new Date().toISOString() });
        }
        await setConfig(pb, 'bruderrat_meetings', list);

        return json({ meetingId, items: structured.items.length });
    } catch (e: any) {
        console.error('POST /api/protocols/[id]/to-protocol failed:', e?.message || e);
        return json({ error: e?.message || 'Übernahme fehlgeschlagen' }, 500);
    }
}
