/**
 * Zusammenfassung der anstehenden Gottesdienste für die Gottesdienstleitung.
 * Alle Daten kommen aus ChurchTools (Events + eventServices + Personen + Abwesenheiten).
 *
 * Rollen werden über den DIENST-NAMEN erkannt (robust gegenüber IDs).
 * Personen werden als Objekt geliefert: { name, initials, id }.
 * Das Avatar-Bild lädt die Flutter-App über /api/person-image/{id} (Proxy).
 */
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';
import { format, addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Berlin';

type Person = { name: string; initials: string; id: string | null };

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

function initialsOf(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const f = parts[0][0] || '';
    const l = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (f + l).toUpperCase();
}

function personObj(person: any, nameOverride?: string): Person {
    const name = nameOverride ?? personName(person);
    const id = person?.domainIdentifier ?? person?.id ?? null;
    return { name, initials: initialsOf(name), id: id != null ? String(id) : null };
}

function dedupByName(list: Person[]): Person[] {
    const map = new Map<string, Person>();
    for (const p of list) if (!map.has(p.name)) map.set(p.name, p);
    return [...map.values()];
}

export async function loadLeadership(user: any, fromStr?: string, toStr?: string) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    const today = new Date();
    const from = fromStr || format(today, 'yyyy-MM-dd');
    const to = toStr || format(addDays(today, 14), 'yyyy-MM-dd');

    const svcName = new Map<number, string>();
    try {
        for (const s of await client.getServices()) {
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
            const weekday = Number(formatInTimeZone(d, TZ, 'i'));
            const hour = Number(formatInTimeZone(d, TZ, 'H'));

            let slot: string | null = null;
            if (weekday === 7) slot = hour < 12 ? 'so_vm' : 'so_nm';
            else if (weekday === 5) slot = 'fr';
            if (!slot) continue;

            const title = ev.name || ev.caption || 'Gottesdienst';
            if (/reinig/i.test(title)) continue; // Reinigung ausklammern

            const roles: Record<string, Person[]> = {
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
                    roles.sonstige.push(
                        personObj(es.person, sname ? `${nm} (${sname})` : nm),
                    );
                } else {
                    roles[r].push(personObj(es.person));
                }
            }
            for (const k of Object.keys(roles)) roles[k] = dedupByName(roles[k]);

            const anyone = Object.values(roles).some((a) => a.length > 0);
            if (!anyone) continue;

            services.push({
                slot,
                date: formatInTimeZone(d, TZ, 'yyyy-MM-dd'),
                time: formatInTimeZone(d, TZ, 'HH:mm'),
                weekday,
                title,
                roles,
            });
        }
        services.sort((a, b) =>
            `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
        );
    } catch (e) {
        console.error('Leadership: events failed', e);
    }

    // Abwesenheiten im Zeitraum
    let absences: any[] = [];
    try {
        const raw = await client.getAbsences(from, to);
        absences = raw
            .map((a: any) => {
                const name =
                    a.person?.title ||
                    `${a.person?.domainAttributes?.firstName || ''} ${a.person?.domainAttributes?.lastName || ''}`.trim();
                const id = a.person?.domainIdentifier ?? a.personId ?? null;
                return {
                    name,
                    initials: initialsOf(name),
                    id: id != null ? String(id) : null,
                    startDate: a.startDate,
                    endDate: a.endDate,
                    reason: a.absenceReason?.nameTranslated || a.reason || '',
                };
            })
            .filter((a: any) => a.name)
            .sort((a: any, b: any) =>
                (a.startDate || '').localeCompare(b.startDate || ''),
            );
    } catch (e) {
        console.error('Leadership: absences failed', e);
    }

    // Geburtstage der über-80-Jährigen im 2-Wochen-Fenster
    let birthdays: any[] = [];
    try {
        birthdays = await loadBirthdays(client, today, addDays(today, 14));
    } catch (e) {
        console.error('Leadership: birthdays failed', e);
    }

    return { from, to, services, absences, birthdays };
}

async function loadBirthdays(client: ChurchToolsClient, fromD: Date, toD: Date) {
    const persons: any[] = [];
    for (let page = 1; page <= 8; page++) {
        const r = await client.request(`persons?page=${page}&limit=100`);
        const batch = r.data || [];
        persons.push(...batch);
        if (batch.length < 100) break;
    }
    const out: any[] = [];
    for (const p of persons) {
        const bday: string | undefined = p.birthday || p.domainAttributes?.birthday;
        if (!bday) continue;
        const parts = bday.split('-').map(Number);
        if (parts.length < 3 || !parts[0]) continue;
        const [by, bm, bd] = parts;
        const age = new Date().getFullYear() - by;
        if (age < 80) continue;
        let bdayThis = new Date(fromD.getFullYear(), bm - 1, bd);
        if (bdayThis < fromD) bdayThis = new Date(fromD.getFullYear() + 1, bm - 1, bd);
        if (bdayThis >= fromD && bdayThis <= toD) {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
            const id = p.domainIdentifier ?? p.id ?? null;
            out.push({
                name,
                initials: initialsOf(name),
                id: id != null ? String(id) : null,
                age,
                date: `${String(bd).padStart(2, '0')}.${String(bm).padStart(2, '0')}.`,
            });
        }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}
