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
    if (n.includes('beitr') || n.includes('frei') || n.includes('segnung')) {
        return 'beitraege';
    }
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
    const svcGroup = new Map<number, string>(); // serviceId -> Gruppenname (z. B. „Kindersegnung")
    try {
        const groupName = new Map<number, string>();
        try {
            const gr = await client.request('servicegroups');
            for (const g of (gr.data || [])) {
                groupName.set(g.id, g.name || g.nameTranslated || '');
            }
        } catch (e) {
            console.error('Leadership: servicegroups failed', e);
        }
        for (const s of await client.getServices()) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
            const gid = s.serviceGroupId;
            if (gid != null) svcGroup.set(s.id, groupName.get(gid) || '');
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

            // Pro Rolle sammeln + nach CT-Reihenfolge (sortKey) ordnen, damit
            // „Predigt 1/2", „Verteiler 1–5" usw. wie in ChurchTools stehen.
            const buckets: Record<string, { p: Person; key: number; kind: string }[]> = {};
            let order = 0;
            for (const es of ev.eventServices || []) {
                if (isArchived(es.person)) continue;
                const nm = personName(es.person);
                if (!nm) continue;
                const sname = svcName.get(es.serviceId) || '';
                const gname = (svcGroup.get(es.serviceId) || '').toLowerCase();
                // Rolle bevorzugt über die Dienst-GRUPPE (Spalte in CT),
                // sonst über den Dienstnamen. Wichtig: „Kindersegnung" (Dienst
                // dort heißt „Gebet") darf NICHT als Gebetstunde gelten.
                let r: string;
                let kind = sname;
                if (gname.includes('kindersegnung')) {
                    r = 'beitraege';
                    kind = 'Kindersegnung';
                } else if (gname.includes('beitr') || gname.includes('frei')) {
                    r = 'beitraege';
                } else {
                    r = roleOf(sname);
                }
                const key = typeof es.sortKey === 'number'
                    ? es.sortKey
                    : (typeof es.id === 'number' ? es.id : order);
                order++;
                const p = r === 'sonstige'
                    ? personObj(es.person, sname ? `${nm} (${sname})` : nm)
                    : personObj(es.person);
                (buckets[r] ||= []).push({ p, key, kind });
            }
            const roles = _emptyRoles();
            let beitragKinds: string[] | undefined;
            for (const k of Object.keys(buckets)) {
                buckets[k].sort((a, b) => a.key - b.key);
                roles[k] = dedupByName(buckets[k].map((e) => e.p));
                // Art (Dienstname) je Beitrag, ausgerichtet an der dedup. Liste.
                if (k === 'beitraege') {
                    const seen = new Set<string>();
                    const kinds: string[] = [];
                    for (const e of buckets[k]) {
                        if (!seen.has(e.p.name)) {
                            seen.add(e.p.name);
                            kinds.push(e.kind || '');
                        }
                    }
                    beitragKinds = kinds;
                }
            }

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
            if (beitragKinds && beitragKinds.length) svc.beitragKinds = beitragKinds;
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

/** Nächster Samstag (ISO yyyy-MM-dd); ist heute Samstag, der in 7 Tagen. */
function nextSaturdayIso(): string {
    const now = new Date();
    let add = (6 - now.getDay() + 7) % 7; // getDay: 0=So..6=Sa
    if (add === 0) add = 7;
    return format(addDays(now, add), 'yyyy-MM-dd');
}

/**
 * Vorlage-Daten für eine neue Bruderrat-Agenda aus ChurchTools:
 * Datum (nächster Bruderrat-Termin bzw. nächster Samstag), Moderator/Eröffnung
 * (Predigt 1 bzw. „Anfang") und Abschluss (Predigt 2 bzw. „Schluss").
 */
export async function loadAgendaTemplate(user: any) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    let date = nextSaturdayIso();
    let moderator = '', moderatorId: string | null = null; // Dienst „Moderation"
    let opener = '', openerId: string | null = null; // „Einleitung" (Eröffnung)
    let closer = '', closerId: string | null = null; // „Abschluss"
    const pid = (p: any): string | null => {
        const v = p?.domainIdentifier ?? p?.id;
        return v != null ? String(v) : null;
    };
    try {
        const svcName = new Map<number, string>();
        for (const s of await client.getServices()) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
        }
        const today = new Date();
        const from = format(today, 'yyyy-MM-dd');
        const to = format(addDays(today, 35), 'yyyy-MM-dd');
        const events = await client.getEventsWithServices(from, to);
        const brs = (events || []).filter((ev: any) =>
            /bruder\s*-?\s*rat/i.test(`${ev?.name || ''} ${ev?.caption || ''}`));
        brs.sort((a: any, b: any) =>
            String(a.startDate || '').localeCompare(String(b.startDate || '')));
        const ev = brs[0];
        if (ev?.startDate) {
            date = formatInTimeZone(new Date(ev.startDate), TZ, 'yyyy-MM-dd');
            // Dienst-Namen im Bruderrat-Termin (siehe ChurchTools):
            //   Moderation -> Moderator, Einleitung -> Eröffnung,
            //   Abschluss -> Abschluss. „Predigt 1/2"/„Anfang" als Fallback.
            const predigt: { nm: string; id: string | null; key: number }[] = [];
            for (const es of ev.eventServices || []) {
                const nm = personName(es.person);
                if (!nm) continue;
                const id = pid(es.person);
                const sname = (svcName.get(es.serviceId) || '').toLowerCase();
                if (sname.includes('moderation') || sname.includes('moderator')) {
                    if (!moderator) { moderator = nm; moderatorId = id; }
                } else if (sname.includes('einleitung') ||
                    sname.includes('anfang') || sname.includes('eröffnung') ||
                    sname.includes('eroeffnung')) {
                    if (!opener) { opener = nm; openerId = id; }
                } else if (sname.includes('abschluss') ||
                    sname.includes('schluss')) {
                    if (!closer) { closer = nm; closerId = id; }
                } else if (sname.includes('predigt')) {
                    if (/1/.test(sname)) {
                        if (!opener) { opener = nm; openerId = id; }
                    } else if (/2/.test(sname)) {
                        if (!closer) { closer = nm; closerId = id; }
                    } else {
                        predigt.push({
                            nm, id,
                            key: typeof es.sortKey === 'number' ? es.sortKey : 0,
                        });
                    }
                }
            }
            if (predigt.length) {
                predigt.sort((a, b) => a.key - b.key);
                if (!opener) { opener = predigt[0].nm; openerId = predigt[0].id; }
                if (!closer && predigt.length > 1) {
                    closer = predigt[1].nm; closerId = predigt[1].id;
                }
            }
        }
    } catch (e) {
        console.error('loadAgendaTemplate failed', e);
    }
    if (!moderator) { moderator = opener; moderatorId = openerId; }
    return {
        date,
        opener, openerId,
        closer, closerId,
        moderator, moderatorId,
    };
}
