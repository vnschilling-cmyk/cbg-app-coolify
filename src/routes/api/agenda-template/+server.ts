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

        // Offene Aufgaben + vertagte Punkte aus der Sammlung.
        let openTasks: any[] = [];
        let deferred: any[] = [];
        try {
            const pb = await adminPb();
            await ensureAppConfig(pb);
            const arr = await getConfig(pb, 'bruderrat_tasks');
            openTasks = (Array.isArray(arr) ? arr : [])
                .filter((t: any) => t && t.done !== true);
            const dl = await getConfig(pb, 'bruderrat_deferred');
            deferred = (Array.isArray(dl) ? dl : []).filter((d: any) => {
                const dd = (d?.date || '').toString();
                return !dd || dd === tmpl.date; // ohne Datum = „nächster BR"
            });
        } catch (e) {
            console.error('agenda-template tasks/deferred failed', e);
        }
        // Jede offene Aufgabe wird ein eigener Punkt unter dem TOP.
        const taskPoints = openTasks.length
            ? openTasks.map((t: any) =>
                `${t.title}${t.assignee ? ` (${t.assignee})` : ''}`)
            : ['Keine offenen Aufgaben.'];

        const items: any[] = [
            {
                title: 'Gebetszeit (Eröffnung)',
                points: tmpl.opener
                    ? [{ text: '', name: tmpl.opener, id: tmpl.openerId }]
                    : [],
            },
            { title: 'Offene Aufgaben', points: taskPoints },
            { title: '', points: [] },
            {
                title: 'Gebetszeit (Abschluss)',
                points: tmpl.closer
                    ? [{ text: '', name: tmpl.closer, id: tmpl.closerId }]
                    : [],
            },
        ];

        // Vertagte Punkte als eigener TOP direkt vor der Abschluss-Gebetszeit.
        if (deferred.length) {
            items.splice(items.length - 1, 0, {
                title: 'Vertagte Punkte',
                points: deferred.map((d: any) => ({
                    text: (d.text || '').toString(),
                    ...(d.name ? { name: d.name } : {}),
                    ...(d.id ? { id: d.id } : {}),
                })),
            });
        }

        return json({
            template: {
                title: `${tmpl.date} Agenda BR`,
                date: tmpl.date,
                moderator: tmpl.moderator,
                moderatorId: tmpl.moderatorId,
                opener: tmpl.opener,
                closer: tmpl.closer,
                absentIds: tmpl.absentIds,
                items,
            },
        });
    } catch (e: any) {
        return json({ error: e?.message || 'Vorlage fehlgeschlagen' }, 500);
    }
}
