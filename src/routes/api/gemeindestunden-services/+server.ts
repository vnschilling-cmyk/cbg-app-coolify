import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadGemeindestunden } from '$lib/server/leadership';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * GET /api/gemeindestunden-services?from=&to=
 * Anstehende Gemeindestunde-Termine (aus ChurchTools) mit den Prediger-Diensten
 * Einleitung/Abschluss – für die Datumsauswahl + Personen-Vorbelegung der
 * Gemeindestunden-Agenda.
 */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadGemeindestunden(
            user,
            url.searchParams.get('from') || undefined,
            url.searchParams.get('to') || undefined,
        );
        return json(data);
    } catch (e: any) {
        console.error('API gemeindestunden-services failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
