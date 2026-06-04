/**
 * Zusammenfassung der anstehenden Gottesdienste für die Gottesdienstleitung.
 * Alle Daten kommen aus ChurchTools (Events + eventServices + Personen + Abwesenheiten).
 *
 * Rollen werden über den DIENST-NAMEN erkannt. Personen als Objekt
 * { name, initials, id }. Avatar via /api/person-image/{id}.
 * Archivierte Personen werden ausgeschlossen.
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
    if (n.includes('abendmahl') || n.includes('verteil')) return 'abendmahl';
    if (n.includes('beitr') || n.includes('frei')) return 'beitraege';
    if (n.includes('bibel')) return 'leitung_bs';
    if (n.includes('gebet')) return 'leitung_gs';
    if (n.includes('leit') || n.includes('moderation')) return 'leitung';
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

function isArchived(p: any): boolean {
    return p?.isArchived === true || p?.archived === true ||
        p?.domainAttributes?.isArchived === true;
}

const _emptyRoles = (): Record<string, Person[]> => ({
    predigt: [], leitung: [], leitung_bs: [], leitung_gs: [],
    beitraege: [], abendmahl: [], sonstige: [],
});

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

    // Geburtstage der Ü80 (ohne Archiv) einmal laden – pro So-Vormittag zuordnen.
    let bdayPool: any[] = [];
    try {
        bdayPool = await loadOver80(client);
    } catch (e) {
        console.error('Leadership: birthdays failed', e);
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
            if (/reinig/i.test(title)) continue;

            const roles = _emptyRoles();
            for (const es of ev.eventServices || []) {
                if (isArchived(es.person)) continue;
                const nm = personName(es.person);
                if (!nm) continue;
                const sname = svcName.get(es.serviceId) || '';
                const r = roleOf(sname);
                if (r === 'sonstige') {
                    roles.sonstige.push(
                        personObj(es.person, sname ? `${nm} (${sname})` : nm));
                } else {
                    roles[r].push(personObj(es.person));
                }
            }
            for (const k of Object.keys(roles)) roles[k] = dedupByName(roles[k]);

            const anyone = Object.values(roles).some((a) => a.length > 0);
            if (!anyone) continue;

            const dateStr = formatInTimeZone(d, TZ, 'yyyy-MM-dd');
            const svc: any = {
                slot,
                date: dateStr,
                time: formatInTimeZone(d, TZ, 'HH:mm'),
                weekday,
                title,
                roles,
            };
            // Ü80-Geburtstage der Woche Mo–So vor diesem Sonntag-Vormittag.
            if (slot === 'so_vm') svc.birthdays = birthdaysForSunday(bdayPool, dateStr);
            services.push(svc);
        }
        services.sort((a, b) =>
            `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    } catch (e) {
        console.error('Leadership: events failed', e);
    }

    // Abwesenheiten im Zeitraum (ohne Archiv).
    let absences: any[] = [];
    try {
        const raw = await client.getAbsences(from, to);
        absences = raw
            .filter((a: any) => !isArchived(a.person))
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
                (a.startDate || '').localeCompare(b.startDate || ''));
    } catch (e) {
        console.error('Leadership: absences failed', e);
    }

    return { from, to, services, absences };
}

/** Alle Personen ≥80 Jahre (ohne Archiv) mit Geburtsdaten. */
async function loadOver80(client: ChurchToolsClient) {
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
        if (isArchived(p)) continue;
        const bday: string | undefined = p.birthday || p.domainAttributes?.birthday;
        if (!bday) continue;
        const parts = bday.split('-').map(Number);
        if (parts.length < 3 || !parts[0]) continue;
        const [by, bm, bd] = parts;
        if (nowYear - by < 80) continue;
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        const id = p.domainIdentifier ?? p.id ?? null;
        out.push({ name, initials: initialsOf(name),
            id: id != null ? String(id) : null,
            birthYear: by, bm, bd });
    }
    return out;
}

/** Ü80-Geburtstage in der Woche Montag–Sonntag, die auf [sundayIso] endet. */
function birthdaysForSunday(pool: any[], sundayIso: string) {
    const parts = sundayIso.split('-').map(Number);
    const sunday = new Date(parts[0], parts[1] - 1, parts[2]);
    const monday = new Date(sunday);
    monday.setDate(sunday.getDate() - 6);

    const out: any[] = [];
    for (const p of pool) {
        // Geburtstag in diesem Jahr (und Nachbarjahre wg. Jahreswechsel).
        for (const yr of [sunday.getFullYear() - 1, sunday.getFullYear(), sunday.getFullYear() + 1]) {
            const cand = new Date(yr, p.bm - 1, p.bd);
            if (cand >= monday && cand <= sunday) {
                out.push({
                    name: p.name,
                    initials: p.initials,
                    id: p.id,
                    age: cand.getFullYear() - p.birthYear,
                    date: `${String(p.bd).padStart(2, '0')}.${String(p.bm).padStart(2, '0')}.${p.birthYear}`,
                });
                break;
            }
        }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}
