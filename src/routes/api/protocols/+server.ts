/**
 * Besprechungs-Protokolle.
 *   GET  /api/protocols  -> { protocols: [...] }
 *   POST /api/protocols  (multipart: file) -> erstellt Protokoll mit Original-Datei
 *
 * Die KI-Überarbeitung (Textextraktion + LLM) läuft separat über
 * POST /api/protocols/[id]/rework, sobald ein LLM hinterlegt ist.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureProtocols } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

function mapRecord(r: any) {
    return {
        id: r.id,
        title: r.title || '',
        date: r.date || '',
        status: r.status || 'neu',
        hasFile: !!r.original_file,
        fileName: r.original_file || '',
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
        const list = await pb
            .collection('protocols')
            .getFullList({ sort: '-created' });
        return json({ protocols: list.map(mapRecord) });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler beim Laden' }, 500);
    }
}

export async function POST({ request }) {
    // Komplett umschlossen, damit JEDE Antwort die CORS-Header trägt
    // (sonst meldet der Browser nur „Failed to fetch").
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const form = await request.formData();
        const file: any = form.get('file');
        // Kein `instanceof File` (im Node-Runtime evtl. kein globales File):
        // per Duck-Typing prüfen.
        if (!file || typeof file === 'string' ||
            typeof file.arrayBuffer !== 'function') {
            return json({ error: 'Keine Datei übermittelt' }, 400);
        }

        const pb = await adminPb();
        await ensureProtocols(pb);

        const name: string = file.name || 'Protokoll.docx';
        const title = name.replace(/\.[^.]+$/, '');
        const today = new Date().toISOString().slice(0, 10);

        const buf = Buffer.from(await file.arrayBuffer());
        const fd = new FormData();
        fd.append('title', title);
        fd.append('date', today);
        fd.append('status', 'neu');
        fd.append('original_file', new Blob([buf]), name);

        const rec = await pb.collection('protocols').create(fd);
        return json({ protocol: mapRecord(rec) });
    } catch (e: any) {
        console.error('POST /api/protocols failed:', e?.message || e);
        return json({ error: e?.message || 'Upload fehlgeschlagen' }, 500);
    }
}
