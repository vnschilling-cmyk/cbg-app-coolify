/**
 * GET /api/protocols/[id]/file – liefert die Original-Datei eines Protokolls
 * (über die PocketBase-Admin-Auth, da die Collection geschützt ist).
 */
import { preflight, corsHeaders } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

const PB_URL =
    PUBLIC_POCKETBASE_URL ||
    'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io';

export const OPTIONS = async () => preflight();

export async function GET({ params }) {
    try {
        const pb = await adminPb();
        const rec = await pb.collection('protocols').getOne(params.id);
        const filename = rec.original_file;
        if (!filename) {
            return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const token = await pb.files.getToken();
        const url =
            `${PB_URL}/api/files/protocols/${rec.id}/` +
            `${encodeURIComponent(filename)}?token=${token}`;
        const r = await fetch(url);
        if (!r.ok) {
            return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const buf = await r.arrayBuffer();
        return new Response(buf, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type':
                    r.headers.get('content-type') || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (e: any) {
        return new Response('Error', { status: 500, headers: corsHeaders });
    }
}
