/**
 * GET /api/protocols/[id]/file – liefert die Original-Datei eines Protokolls.
 * Die Datei liegt als Base64 im Feld `original_b64` (kein PB-Datei-Feld).
 */
import { preflight, corsHeaders } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function GET({ params }) {
    try {
        const pb = await adminPb();
        const rec = await pb.collection('protocols').getOne(params.id);
        const b64: string = rec.original_b64 || '';
        const filename: string = rec.file_name || 'Protokoll.docx';
        if (!b64) {
            return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const buf = Buffer.from(b64, 'base64');
        return new Response(buf, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (e: any) {
        console.error('GET /api/protocols/[id]/file:', e?.message || e);
        return new Response('Error', { status: 500, headers: corsHeaders });
    }
}
