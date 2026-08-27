/**
 * Hilfsfunktionen für die JSON-API, die von der Flutter-App genutzt wird.
 * Auth läuft hier über einen `Authorization: Bearer <pb-token>`-Header
 * (statt Cookie), plus CORS, da die Flutter-Web-App auf einer anderen
 * Origin läuft.
 */
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

const PB_URL =
    PUBLIC_POCKETBASE_URL ||
    'https://db.dienst.cbgg.de';

export const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}

/** Antwort auf CORS-Preflight (OPTIONS). */
export function preflight(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Baut eine PocketBase-Instanz aus dem Bearer-Token des Requests und lädt
 * (falls möglich) den zugehörigen User-Datensatz.
 */
export async function pbFromRequest(
    request: Request,
): Promise<{ pb: PocketBase; user: any | null }> {
    const pb = new PocketBase(PB_URL);
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) return { pb, user: null };

    pb.authStore.save(token, null);
    try {
        const res = await pb.collection('users').authRefresh();
        return { pb, user: res.record };
    } catch {
        // Token ungültig, abgelaufen oder PocketBase nicht erreichbar: Token
        // verwerfen. `authStore.isValid` prüft nur die exp-Claim im JWT, NICHT
        // die Signatur – ein selbst gebautes Token gälte sonst als gültig.
        pb.authStore.clear();
        return { pb, user: null };
    }
}
