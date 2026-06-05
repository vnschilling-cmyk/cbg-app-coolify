/**
 * Besprechungs-Protokolle.
 *   GET  /api/protocols  -> { protocols: [...] }
 *   POST /api/protocols  (multipart: file) -> erstellt Protokoll mit Original-Datei
 *
 * Die KI-Überarbeitung (Textextraktion + LLM) läuft separat über
 * POST /api/protocols/[id]/rework, sobald ein LLM hinterlegt ist.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureProtocols,
    extractDocxText,
    normalizeProtocol,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

function mapRecord(r: any) {
    return {
        id: r.id,
        title: r.title || '',
        date: r.date || '',
        status: r.status || 'neu',
        hasFile: !!r.original_b64,
        fileName: r.file_name || '',
        originalText: r.original_text || '',
        reworkedText: r.reworked_text || '',
        created: r.created || '',
    };
}

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        const pb = await adminPb();
        await ensureProtocols(pb);
        // KEIN sort:'-created' — Base-Collections in PB v0.38 haben kein
        // created-Feld; das war die Ursache des 500. Neueste zuerst über id.
        const list = await pb
            .collection('protocols')
            .getFullList({ sort: '-id' });

        // Einmaliger, idempotenter Backfill: Alt-Titel auf das einheitliche
        // Schema „YYYY-MM-DD Protokoll BR" bringen. Nur schreiben, wenn sich
        // etwas ändert – danach passiert hier nur noch ein Vergleich.
        for (const r of list) {
            const norm = normalizeProtocol(
                (r as any).file_name || '',
                (r as any).original_text || '',
            );
            if ((r as any).title !== norm.title ||
                (r as any).date !== norm.date) {
                try {
                    await pb.collection('protocols').update(r.id, {
                        title: norm.title,
                        date: norm.date,
                    });
                    (r as any).title = norm.title;
                    (r as any).date = norm.date;
                } catch (e: any) {
                    console.error('Backfill-Umbenennung fehlgeschlagen:',
                        r.id, e?.message || e);
                }
            }
        }

        // Neuestes Protokoll immer oben: nach Sitzungsdatum absteigend,
        // bei Gleichstand nach id (Upload-Reihenfolge) absteigend.
        const mapped = list.map(mapRecord).sort((a, b) => {
            const d = (b.date || '').localeCompare(a.date || '');
            if (d !== 0) return d;
            return (b.id || '').localeCompare(a.id || '');
        });
        return json({ protocols: mapped });
    } catch (e: any) {
        // PB-Detailfehler (Feldfehler etc.) durchreichen, um die Ursache zu sehen.
        const detail = e?.response?.data ?? e?.response?.message ?? e?.data;
        console.error('GET /api/protocols failed:', e?.message,
            JSON.stringify(e?.response || {}));
        return json({
            error: (e?.message || 'Fehler beim Laden') +
                (detail ? ' | ' + JSON.stringify(detail) : ''),
        }, 500);
    }
}

export async function POST({ request }) {
    // Komplett umschlossen, damit JEDE Antwort die CORS-Header trägt
    // (sonst meldet der Browser nur „Failed to fetch").
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        // JSON-Body. Zwei Wege:
        //  - Word-Upload:   { name, b64 }
        //  - Agenda-Gerüst: { name, text }  (Protokoll-Entwurf aus einer Agenda)
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const b64: string = (body?.b64 || '').toString();
        const skeleton: string = (body?.text || '').toString();
        if (!b64 && !skeleton) {
            return json({ error: 'Keine Datei oder Vorlage übermittelt' }, 400);
        }

        const pb = await adminPb();
        await ensureProtocols(pb);

        // Agenda-Gerüst: kein Word-Upload, Text dient als Rohprotokoll-Entwurf.
        if (!b64) {
            const name = (body?.name || 'Agenda').toString();
            const { title, date } = normalizeProtocol(name, skeleton);
            const rec = await pb.collection('protocols').create({
                title,
                date,
                status: 'entwurf',
                file_name: '',
                original_b64: '',
                original_text: skeleton.slice(0, 1900000),
            });
            return json({ protocol: mapRecord(rec) });
        }

        const name: string = (body?.name || 'Protokoll.docx').toString();

        const buf = Buffer.from(b64, 'base64');

        // Word-Text direkt extrahieren (schnell) – aber KEINE KI im Upload!
        // Die Gemini-Auswertung läuft separat über /rework, damit der Upload
        // nicht durch lange Laufzeiten (Proxy-Timeout) abbricht.
        let originalText = '';
        try {
            originalText = extractDocxText(buf).slice(0, 1900000);
        } catch (e: any) {
            console.error('Textextraktion fehlgeschlagen:', e?.message || e);
        }

        // Einheitlicher Titel „YYYY-MM-DD Protokoll <Gremium>" + Sitzungsdatum.
        const { title, date } = normalizeProtocol(name, originalText);

        const rec = await pb.collection('protocols').create({
            title,
            date,
            status: 'neu',
            file_name: name,
            original_b64: b64,
            original_text: originalText,
        });
        return json({ protocol: mapRecord(rec) });
    } catch (e: any) {
        const detail = e?.response?.data ?? e?.data;
        console.error('POST /api/protocols failed:', e?.message,
            JSON.stringify(e?.response || {}));
        return json({
            error: (e?.message || 'Upload fehlgeschlagen') +
                (detail ? ' | ' + JSON.stringify(detail) : ''),
        }, 500);
    }
}
