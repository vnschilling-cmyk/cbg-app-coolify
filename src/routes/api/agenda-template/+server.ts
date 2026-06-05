/**
 * GET /api/agenda-template
 * Liefert eine vorbefüllte Bruderrat-Agenda-Vorlage:
 *  - Name „YYYY-MM-DD Agenda BR" + Datum (nächster Bruderrat-Termin/Samstag)
 *  - Moderator + Eröffnung/Abschluss aus ChurchTools
 *  - Standard-Struktur inkl. offener Aufgaben aus der Sammlung.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadAgendaTemplate } from '$lib/server/leadership';
import { adminPb, ensureAppConfig, getConfig } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        const tmpl = await loadAgendaTemplate(user);

        // Offene Aufgaben aus der Sammlung (done != true).
        let openTasks: any[] = [];
        try {
            const pb = await adminPb();
            await ensureAppConfig(pb);
            const arr = await getConfig(pb, 'bruderrat_tasks');
            openTasks = (Array.isArray(arr) ? arr : [])
                .filter((t: any) => t && t.done !== true);
        } catch (e) {
            console.error('agenda-template tasks failed', e);
        }
        // Jede offene Aufgabe wird ein eigener Punkt unter dem TOP.
        const taskPoints = openTasks.length
            ? openTasks.map((t: any) =>
                `${t.title}${t.assignee ? ` (${t.assignee})` : ''}`)
            : ['Keine offenen Aufgaben.'];

        const items = [
            {
                title: 'Gebetszeit (Eröffnung)',
                points: tmpl.opener ? [`Leitung: ${tmpl.opener}`] : [],
            },
            { title: 'Offene Aufgaben', points: taskPoints },
            { title: '', points: [] },
            {
                title: 'Gebetszeit (Abschluss)',
                points: tmpl.closer ? [`Leitung: ${tmpl.closer}`] : [],
            },
        ];

        return json({
            template: {
                title: `${tmpl.date} Agenda BR`,
                date: tmpl.date,
                moderator: tmpl.moderator,
                opener: tmpl.opener,
                closer: tmpl.closer,
                items,
            },
        });
    } catch (e: any) {
        return json({ error: e?.message || 'Vorlage fehlgeschlagen' }, 500);
    }
}
