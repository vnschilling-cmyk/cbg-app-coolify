/**
 * Zusammenfassung der anstehenden Gottesdienste für die Gottesdienstleitung.
 * Alle Daten kommen aus ChurchTools (Events + eventServices + Personen).
 *
 * Rollen werden über den DIENST-NAMEN erkannt (robust gegenüber IDs):
 *  - "Predigt"            -> predigt
 *  - "Leitung"/"Moderation" -> leitung
 *  - "Beitrag"/"frei"     -> beitraege (freie Beiträge)
 *  - "Abendmahl"/"verteil" -> abendmahl
 *  - sonst                -> sonstige (mit Dienstnamen)
 */
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';
import { format, addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Berlin';

function roleOf(serviceName: string): string {
    const n = (serviceName || '').toLowerCase();
    if (n.includes('predigt')) return 'predigt';
    if (n.includes('leit') || n.includes('moderation')) return 'leitung';
    if (n.includes('beitr') || n.includes('frei')) return 'beitraege';
    if (n.includes('abendmahl') || n.includes('verteil')) return 'abendmahl';
    return 'sonstige';
}

function personName(person: any): string {
    if (!person) return '';
    const da = person.domainAttributes;
    if (da && (da.firstName || da.lastName)) {
        return `${da.firstName || ''} ${da.lastName || ''}`.trim();
    }
    return person.title || '';
}

export async function loadLeadership(user: any, fromStr?: string, toStr?: string) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    const today = new Date();
    const from = fromStr || format(today, 'yyyy-MM-dd');
    const to = toStr || format(addDays(today, 14), 'yyyy-MM-dd');

    // Dienst-IDs -> Name
    const svcName = new Map<number, string>();
    try {
        const servicesRaw = await client.getServices();
        for (const s of servicesRaw) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
        }
    } catch (e) {
        console.error('Leadership: getServices failed', e);
    }

    const services: any[] = [];
    try {
        const events = await client.getEventsWithServices(from, to);
        for (const ev of events) {
            if (!ev.startDate) continue;
            const d = new Date(ev.startDate);
            const weekday = Number(formatInTimeZone(d, TZ, 'i')); // 1=Mo..7=So
            const hour = Number(formatInTimeZone(d, TZ, 'H'));

            let slot: string | null = null;
            if (weekday === 7) slot = hour < 12 ? 'so_vm' : 'so_nm';
            else if (weekday === 5) slot = 'fr';
            if (!slot) continue;

            const roles: Record<string, string[]> = {
                predigt: [],
                leitung: [],
                beitraege: [],
                abendmahl: [],
                sonstige: [],
            };
            for (const es of ev.eventServices || []) {
                const nm = personName(es.person);
                if (!nm) continue;
                const sname = svcName.get(es.serviceId) || '';
                const r = roleOf(sname);
                if (r === 'sonstige') {
                    roles.sonstige.push(sname ? `${nm} (${sname})` : nm);
                } else {
                    roles[r].push(nm);
                }
            }

            services.push({
                slot,
                date: formatInTimeZone(d, TZ, 'yyyy-MM-dd'),
                time: formatInTimeZone(d, TZ, 'HH:mm'),
                weekday,
                title: ev.name || ev.caption || 'Gottesdienst',
                roles,
            });
        }
        services.sort((a, b) =>
            `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
        );
    } catch (e) {
        console.error('Leadership: events failed', e);
    }

    // Geburtstage der über-80-Jährigen im Zeitfenster (best effort)
    let birthdays: any[] = [];
    try {
        birthdays = await loadBirthdays(client, addDays(today, -7), addDays(today, 14));
    } catch (e) {
        console.error('Leadership: birthdays failed', e);
    }

    return { from, to, services, birthdays };
}

async function loadBirthdays(client: ChurchToolsClient, fromD: Date, toD: Date) {
    const persons: any[] = [];
    for (let page = 1; page <= 8; page++) {
        const r = await client.request(`persons?page=${page}&limit=100`);
        const batch = r.data || [];
        persons.push(...batch);
        if (batch.length < 100) break;
    }

    const nowYear = new Date().getFullYear();
    const out: any[] = [];
    for (const p of persons) {
        const bday: string | undefined = p.birthday || p.domainAttributes?.birthday;
        if (!bday) continue;
        const parts = bday.split('-').map(Number);
        if (parts.length < 3 || !parts[0]) continue;
        const [by, bm, bd] = parts;

        const age = nowYear - by;
        if (age < 80) continue;

        // Geburtstag dieses Jahr; ggf. nächstes Jahr, falls schon vorbei vor Fenster
        let bdayThis = new Date(fromD.getFullYear(), bm - 1, bd);
        if (bdayThis < fromD) bdayThis = new Date(fromD.getFullYear() + 1, bm - 1, bd);
        if (bdayThis >= fromD && bdayThis <= toD) {
            const name =
                `${p.firstName || ''} ${p.lastName || ''}`.trim() ||
                p.domainAttributes?.firstName ||
                '';
            out.push({
                name,
                age,
                date: `${String(bd).padStart(2, '0')}.${String(bm).padStart(2, '0')}.`,
            });
        }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}
