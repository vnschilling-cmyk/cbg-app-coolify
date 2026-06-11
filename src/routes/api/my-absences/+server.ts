import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * GET /api/my-absences?personId=123
 * Liefert ALLE eingetragenen Abwesenheiten einer Person über einen weiten
 * Zeitraum (laufendes Jahr bis +2 Jahre). Gedacht für die eigene Übersicht.
 */
export const GET: RequestHandler = async ({ request, url }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert', absences: [] }, 401);
    }

    const personId = url.searchParams.get('personId') || '';
    if (!personId) {
        return json({ success: false, error: 'personId fehlt', absences: [] }, 400);
    }

    const now = new Date();
    const from = `${now.getFullYear()}-01-01`;
    const to = `${now.getFullYear() + 2}-12-31`;

    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    try {
        const raw = await client.getPersonAbsences(personId, from, to);
        const absences = raw
            .map((a: any) => ({
                id: String(a.id ?? ''),
                startDate: a.startDate,
                endDate: a.endDate,
                reason: a.absenceReason?.nameTranslated || a.reason || '',
            }))
            .filter((a: any) => a.startDate)
            .sort((a: any, b: any) =>
                String(a.startDate).localeCompare(String(b.startDate)));
        return json({ success: true, absences });
    } catch (e: any) {
        console.error('API my-absences failed:', e);
        return json(
            { success: false, error: e?.message || 'Abruf fehlgeschlagen', absences: [] },
            500,
        );
    }
};
