/**
 * Zusammenfassung der anstehenden Gottesdienste für die Gottesdienstleitung.
 * Alle Daten kommen aus ChurchTools (Events + eventServices + Personen + Abwesenheiten).
 *
 * Rollen werden über den DIENST-NAMEN erkannt. Personen als Objekt
 * { name, initials, id }. Avatar via /api/person-image/{id}.
 * Archivierte Personen werden ausgeschlossen.
 */
import { ChurchToolsClient } from '$lib/server/churchtools';
import {
    CHURCHTOOLS_TOKEN,
    CHURCHTOOLS_BASE_URL,
    PREACHER_GROUP_ID,
} from '$env/static/private';
import { format, addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getConfig, setConfig, genId } from '$lib/server/admin';

const TZ = 'Europe/Berlin';

// ChurchTools-Gruppe „Bruderrat" (per MCP verifiziert). Für die Abwesenheits-
// Ermittlung im Protokoll – einen globalen Absences-Endpunkt gibt es nicht,
// Abwesenheiten müssen pro Gruppe abgefragt werden.
const BRUDERRAT_GROUP_ID = '31';

// Kalender „Schulungen-Treffen" (per MCP verifiziert, id 60): Termine wie
// Predigergemeinschaft/Dirigenten-Treffen – auch an Wochentagen, die nicht ins
// Sonntags-/Freitags-Raster der Gottesdienstleitung passen.
const SCHULUNGEN_TREFFEN_CALENDAR = 60;

// Vom Prediger-Plan verwaltete serviceIds (synchron zu editor-core.ts
// MANAGED_SERVICE_IDS): Predigt(1), Leitung(3), Verteiler(61), Einleitung(88),
// Leitung BS(91), Leitung GS(94), Abschluss(117). Leere Slots dieser Dienste
// gelten als „unbesetzt" und werden gemeldet.
const MANAGED_SERVICE_IDS = new Set<number>([1, 3, 61, 88, 91, 94, 117]);

type Person = { name: string; initials: string; id: string | null; service?: string };

function roleOf(serviceName: string): string {
    const n = (serviceName || '').toLowerCase();
    if (n.includes('predigt')) return 'predigt';
    if (n.includes('abendmahl') || n.includes('verteil')) return 'abendmahl';
    // „Begleitung" (Musik) darf NICHT als Leitung gelten – daher VOR der
    // Leitung-Prüfung als Beitrag einsortieren.
    if (n.includes('begleit')) return 'beitraege';
    if (n.includes('beitr') || n.includes('frei') || n.includes('segnung') ||
        n.includes('lied') || n.includes('musik') || n.includes('gedicht') ||
        n.includes('chor') || n.includes('instrument')) {
        return 'beitraege';
    }
    if (n.includes('bibel')) return 'leitung_bs';
    if (n.includes('gebet')) return 'leitung_gs';
    // Bewusst nur „leitung"/„moderation" (NICHT bloß „leit", sonst greift es
    // fälschlich bei „Begleitung").
    if (n.includes('leitung') || n.includes('moderation')) return 'leitung';
    return 'sonstige';
}

/** Zahl aus einem Dienstnamen ziehen (z. B. „Predigt 2" -> 2). */
function numOf(s: string): number {
    const m = (s || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
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
    const svcSort = new Map<number, number>(); // serviceId -> sortKey (CT-Reihenfolge)
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
            svcSort.set(s.id, typeof s.sortKey === 'number' ? s.sortKey : 999);
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

            const title = ev.name || ev.caption || 'Gottesdienst';
            if (/reinig/i.test(title)) continue;

            let slot: string | null = null;
            // Gemeindestunde (Sondergemeinschaft) IMMER zuerst – auch am Freitag.
            // Sonst würde eine Freitags-Gemeindestunde faelschlich als Bibel-Gebet
            // ('fr') mit „Leitung BS/GS" behandelt.
            if (/gemeindestunde/i.test(title)) slot = 'gemeindestunde';
            else if (weekday === 7) slot = hour < 12 ? 'so_vm' : 'so_nm';
            else if (weekday === 5) slot = 'fr';
            if (!slot) continue;

            // Pro Rolle sammeln + nach CT-Reihenfolge (sortKey) ordnen, damit
            // „Predigt 1/2", „Verteiler 1–5" usw. wie in ChurchTools stehen.
            const buckets: Record<string, { p: Person; key: number; kind: string }[]> = {};
            // Gemeindestunde: echte CT-Dienstnamen (Einleitung/Abschluss/…) je
            // Person sammeln, statt sie über roleOf in generische Rollen zu
            // pressen (z. B. „Einleitung" → faelschlich „Leitung").
            const gsList: { service: string; person: any; sort: number; key: number }[] = [];
            // Unbesetzte, vom Plan verwaltete Dienste (leerer Slot ohne Person).
            // Trägt serviceId + eventId mit, damit die App direkt zuweisen kann.
            const openSlots: { name: string; serviceId: number; eventId: string }[] = [];
            let order = 0;
            for (const es of ev.eventServices || []) {
                const nm = personName(es.person);
                const filled = !!nm && !isArchived(es.person);
                if (!filled) {
                    if (MANAGED_SERVICE_IDS.has(es.serviceId)) {
                        openSlots.push({
                            name: svcName.get(es.serviceId) || `Dienst ${es.serviceId}`,
                            serviceId: es.serviceId,
                            eventId: String(ev.id ?? ''),
                        });
                    }
                    continue;
                }
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
                } else if (gname.includes('beitr') || gname.includes('frei') ||
                    gname.includes('musik')) {
                    // Musik-Dienste (auch „Leitung Ges." = Gesang-Leitung) sind
                    // Beiträge, NICHT die Gottesdienst-Leitung.
                    r = 'beitraege';
                } else {
                    r = roleOf(sname);
                }
                // CT-Reihenfolge: explizites `index` (bzw. `counter`) bevorzugen,
                // erst dann auf die eventService-ID zurückfallen.
                const key = typeof es.index === 'number'
                    ? es.index
                    : typeof es.counter === 'number'
                        ? es.counter
                        : (typeof es.id === 'number' ? es.id : order);
                order++;
                const p = r === 'sonstige'
                    ? personObj(es.person, sname ? `${nm} (${sname})` : nm)
                    : personObj(es.person);
                // Echten ChurchTools-Dienstnamen je Person mitführen (für die
                // Anzeige „Predigt 1 / Leitung BS / Gedicht …" statt generisch).
                p.service = kind || sname;
                if (slot === 'gemeindestunde') {
                    gsList.push({
                        service: sname || kind,
                        person: personObj(es.person),
                        sort: svcSort.get(es.serviceId) ?? 999,
                        key,
                    });
                }
                (buckets[r] ||= []).push({ p, key, kind });
            }
            const roles = _emptyRoles();
            let beitragKinds: string[] | undefined;
            for (const k of Object.keys(buckets)) {
                // Predigt/Abendmahl nach der NUMMER im Dienstnamen ordnen
                // („Predigt 1" vor „Predigt 2"); sonst nach CT-sortKey.
                if (k === 'predigt' || k === 'abendmahl') {
                    buckets[k].sort((a, b) =>
                        (numOf(a.kind) - numOf(b.kind)) || (a.key - b.key));
                } else {
                    buckets[k].sort((a, b) => a.key - b.key);
                }
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
            // Gemeindestunden sowie Termine mit unbesetzten Plan-Diensten auch
            // ohne zugewiesene Personen anzeigen (damit das Fehlende sichtbar wird).
            if (!anyone && openSlots.length === 0 && slot !== 'gemeindestunde') {
                continue;
            }

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
            // Unbesetzte Plan-Dienste (zum Markieren in der Anzeige).
            if (openSlots.length) svc.openServices = openSlots;
            // Gemeindestunde: echte Dienste in CT-Reihenfolge (sortKey) anhaengen.
            if (slot === 'gemeindestunde' && gsList.length) {
                gsList.sort((a, b) => (a.sort - b.sort) || (a.key - b.key));
                svc.gsServices = gsList.map((e) => ({
                    service: e.service,
                    person: e.person,
                }));
            }
            // Ü80-Geburtstage der Woche Mo–So vor diesem Sonntag-Vormittag.
            if (slot === 'so_vm') svc.birthdays = birthdaysForSunday(bdayPool, dateStr);
            services.push(svc);
        }
        services.sort((a, b) =>
            `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    } catch (e) {
        console.error('Leadership: events failed', e);
    }

    // Abwesenheiten im Zeitraum (ohne Archiv). Scope = Prediger-Gruppe (164):
    // einen globalen Absences-Endpunkt gibt es in CT nicht, nur pro Gruppe/Person.
    let absences: any[] = [];
    try {
        const raw = await client.getAbsences(from, to, PREACHER_GROUP_ID);
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

    // Schulungen & Treffen (Kalender 60): wichtige Termine (z. B.
    // Predigergemeinschaft), auch an anderen Tagen/Zeiten. Termine, die bereits
    // als Gottesdienst-Slot (Datum+Zeit) erfasst sind, werden nicht doppelt
    // gezeigt.
    let treffen: any[] = [];
    try {
        const serviceKeys = new Set(
            services.map((s: any) => `${s.date} ${s.time}`));
        const appts = await client.getAppointments(
            [SCHULUNGEN_TREFFEN_CALENDAR], from, to);
        treffen = (appts || [])
            .map((a: any) => {
                const base = a.base || a.appointment?.base || a;
                const calc = a.calculated || a.appointment?.calculated || base;
                const start = calc?.startDate || base?.startDate;
                if (!start) return null;
                const d = new Date(start);
                return {
                    date: formatInTimeZone(d, TZ, 'yyyy-MM-dd'),
                    time: String(start).length > 10
                        ? formatInTimeZone(d, TZ, 'HH:mm')
                        : '',
                    weekday: Number(formatInTimeZone(d, TZ, 'i')),
                    title: base?.title || base?.caption || 'Treffen',
                    subtitle: base?.subtitle || base?.note || '',
                };
            })
            .filter((t: any) =>
                t && !serviceKeys.has(`${t.date} ${t.time}`))
            .sort((a: any, b: any) =>
                `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    } catch (e) {
        console.error('Leadership: treffen failed', e);
    }

    return { from, to, services, absences, treffen };
}

/**
 * Anstehende Gemeindestunden (Events mit „Gemeindestunde" im Titel) inkl. der
 * Prediger-Dienste Einleitung/Abschluss aus ChurchTools – für die
 * Gemeindestunden-Agenda (Datumsauswahl + Vorbelegung der Personen).
 *
 * Einleitung/Abschluss werden über den Dienstnamen erkannt; nutzt eine
 * Gemeindestunde nur zwei „Predigt"-Dienste (ältere Termine), gilt der erste
 * als Einleitung und der zweite als Abschluss.
 */
export async function loadGemeindestunden(user: any, fromStr?: string, toStr?: string) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    const today = new Date();
    // Auch kürzlich vergangene Gemeindestunden einbeziehen (~4 Monate zurück),
    // damit beim Bearbeiten einer bereits stattgefundenen Gemeindestunde die
    // Prediger (Einleitung/Abschluss) weiterhin aus dem Termin vorbelegt werden.
    const from = fromStr || format(addDays(today, -120), 'yyyy-MM-dd');
    const to = toStr || format(addDays(today, 240), 'yyyy-MM-dd'); // ~8 Monate

    const svcName = new Map<number, string>();
    const svcSort = new Map<number, number>();
    try {
        for (const s of await client.getServices()) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
            svcSort.set(s.id, typeof s.sortKey === 'number' ? s.sortKey : 999);
        }
    } catch (e) {
        console.error('Gemeindestunden: getServices failed', e);
    }

    const out: any[] = [];
    try {
        const events = await client.getEventsWithServices(from, to);
        for (const ev of events) {
            if (!ev.startDate) continue;
            const title = ev.name || ev.caption || '';
            if (!/gemeindestunde/i.test(title)) continue;
            const d = new Date(ev.startDate);

            // Zugewiesene Dienste (mit Person) in CT-Reihenfolge sammeln.
            const svcs: { service: string; person: Person; sort: number; key: number }[] = [];
            let order = 0;
            for (const es of ev.eventServices || []) {
                if (!es.person || isArchived(es.person)) continue;
                const nm = personName(es.person);
                if (!nm) continue;
                const sname = svcName.get(es.serviceId) || '';
                const key = typeof es.index === 'number'
                    ? es.index
                    : typeof es.counter === 'number'
                        ? es.counter
                        : (typeof es.id === 'number' ? es.id : order);
                order++;
                svcs.push({
                    service: sname,
                    person: personObj(es.person),
                    sort: svcSort.get(es.serviceId) ?? 999,
                    key,
                });
            }
            svcs.sort((a, b) => (a.sort - b.sort) || (a.key - b.key));

            // Einleitung/Abschluss über den Dienstnamen, sonst „Predigt 1/2".
            let opener: Person | null = null;
            let closer: Person | null = null;
            const preachers: Person[] = [];
            for (const s of svcs) {
                const n = s.service.toLowerCase();
                if (!opener &&
                    (n.includes('einleitung') || n.includes('eröffnung') ||
                        n.includes('eroeffnung'))) {
                    opener = s.person;
                } else if (!closer &&
                    (n.includes('abschluss') || n.includes('schluss'))) {
                    closer = s.person;
                } else if (n.includes('predigt')) {
                    preachers.push(s.person);
                }
            }
            if (!opener && preachers.length) opener = preachers[0];
            if (!closer && preachers.length > 1) closer = preachers[1];

            out.push({
                date: formatInTimeZone(d, TZ, 'yyyy-MM-dd'),
                time: formatInTimeZone(d, TZ, 'HH:mm'),
                title,
                opener: opener ? { name: opener.name, id: opener.id } : null,
                closer: closer ? { name: closer.name, id: closer.id } : null,
                services: svcs.map((s) => ({
                    service: s.service, name: s.person.name, id: s.person.id,
                })),
            });
        }
        out.sort((a, b) =>
            `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    } catch (e) {
        console.error('Gemeindestunden: events failed', e);
    }

    return { appointments: out };
}

/**
 * Stellt sicher, dass für jede ANSTEHENDE ChurchTools-Gemeindestunde ein
 * GEPLANTER Agenda-Datensatz (`bruderrat_gemeindestunden`) existiert –
 * vorbefüllt mit Datum + Einleitung/Abschluss (Prediger aus CT). So ist die
 * Gemeindestunde überall „eingepflegt", ohne dass sie von Hand angelegt werden
 * muss. Dedup über das Datum; bestehende Datensätze bleiben unverändert.
 */
export async function ensureGemeindestunden(pb: any, user: any): Promise<void> {
    let appts: any[] = [];
    try {
        // Nur den näheren Vorlauf (~6 Wochen) automatisch einpflegen.
        const to = format(addDays(new Date(), 45), 'yyyy-MM-dd');
        const res = await loadGemeindestunden(user, undefined, to);
        appts = Array.isArray(res?.appointments) ? res.appointments : [];
    } catch (e) {
        console.error('ensureGemeindestunden: CT failed', e);
        return;
    }
    if (!appts.length) return;

    const raw = await getConfig(pb, 'bruderrat_gemeindestunden');
    const list: any[] = Array.isArray(raw) ? raw : [];
    const haveDates = new Set(
        list.map((g: any) => (g?.date || '').toString()).filter(Boolean));
    const todayIso = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');

    let changed = false;
    for (const a of appts) {
        const date = (a?.date || '').toString();
        if (!date || date < todayIso) continue; // nur anstehende
        if (haveDates.has(date)) continue;       // schon vorhanden
        const op = a?.opener;
        const cl = a?.closer;
        list.unshift({
            id: genId(),
            date,
            status: 'geplant',
            intro: op
                ? { name: op.name || '', id: (op.id || '').toString() }
                : { name: '' },
            closing: cl
                ? { name: cl.name || '', id: (cl.id || '').toString() }
                : { name: '' },
            items: [],
            attendance: [],
            source: 'ChurchTools',
            createdAt: new Date().toISOString(),
        });
        haveDates.add(date);
        changed = true;
    }
    if (changed) await setConfig(pb, 'bruderrat_gemeindestunden', list);
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

/** Alle Gemeindemitglieder mit Geburtstag in der aktuellen Woche (Mo–So). */
export async function loadWeekBirthdays(user: any) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
    const persons: any[] = [];
    for (let page = 1; page <= 12; page++) {
        const r = await client.request(`persons?page=${page}&limit=100`);
        const batch = r.data || [];
        persons.push(...batch);
        if (batch.length < 100) break;
    }
    // Aktuelle Woche Montag–Sonntag (lokal).
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0 = Montag
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const out: any[] = [];
    for (const p of persons) {
        if (isArchived(p)) continue;
        const bday: string | undefined = p.birthday || p.domainAttributes?.birthday;
        if (!bday) continue;
        const parts = String(bday).split('-').map(Number);
        if (parts.length < 3 || !parts[0]) continue;
        const [by, bm, bd] = parts;
        const name = `${p.firstName || p.domainAttributes?.firstName || ''} `
            + `${p.lastName || p.domainAttributes?.lastName || ''}`;
        const nm = name.trim();
        if (!nm) continue;
        const id = p.domainIdentifier ?? p.id ?? null;
        for (const yr of [monday.getFullYear(), sunday.getFullYear()]) {
            const cand = new Date(yr, bm - 1, bd);
            if (cand >= monday && cand <= sunday) {
                out.push({
                    name: nm,
                    initials: initialsOf(nm),
                    id: id != null ? String(id) : null,
                    // CT-Personenstatus (3 = Mitglied, 8 = Kind) für die
                    // Aufteilung der Geburtstagsliste im Frontend.
                    statusId: p.statusId ?? p.domainAttributes?.statusId ?? null,
                    age: cand.getFullYear() - by,
                    date: `${String(bd).padStart(2, '0')}.${String(bm).padStart(2, '0')}.${by}`,
                    iso: `${yr}-${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`,
                });
                break;
            }
        }
    }
    out.sort((a, b) => a.iso.localeCompare(b.iso));
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
export async function loadAgendaTemplate(user: any, targetDate?: string) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    // Kommende Bruderrat-Termine (für die Auswahlliste im Frontend).
    let upcoming: string[] = [];
    let date = targetDate || nextSaturdayIso();
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
        // Weiter Vorlauf (~4 Monate), damit man 2–3 Bruderräte im Voraus planen kann.
        const to = format(addDays(today, 120), 'yyyy-MM-dd');
        const events = await client.getEventsWithServices(from, to);
        const brs = (events || []).filter((ev: any) =>
            /bruder\s*-?\s*rat/i.test(`${ev?.name || ''} ${ev?.caption || ''}`));
        brs.sort((a: any, b: any) =>
            String(a.startDate || '').localeCompare(String(b.startDate || '')));
        upcoming = brs
            .map((e: any) => e?.startDate
                ? formatInTimeZone(new Date(e.startDate), TZ, 'yyyy-MM-dd')
                : '')
            .filter((d: string, i: number, arr: string[]) =>
                d !== '' && arr.indexOf(d) === i);
        // Gewählten Termin nehmen, sonst den nächsten.
        const ev = targetDate
            ? brs.find((e: any) => e?.startDate &&
                formatInTimeZone(new Date(e.startDate), TZ, 'yyyy-MM-dd') ===
                    targetDate)
            : brs[0];
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

    // CT-Abwesenheiten am Sitzungstag -> diese Personen-IDs gelten als abwesend.
    // WICHTIG: mit der Bruderrat-Gruppe abfragen (ohne Gruppe liefert CT 404 →
    // vorher waren Abwesenheiten im Protokoll NIE gesetzt).
    const absentIds: string[] = [];
    try {
        const abs = await client.getAbsences(date, date, BRUDERRAT_GROUP_ID);
        for (const a of abs || []) {
            const s = (a.startDate || '').slice(0, 10);
            const e = (a.endDate || '').slice(0, 10);
            if ((!s || s <= date) && (!e || e >= date)) {
                const id = a.person?.domainIdentifier ?? a.personId ?? a.person?.id;
                if (id != null) absentIds.push(String(id));
            }
        }
    } catch (e) {
        console.error('loadAgendaTemplate absences failed', e);
    }

    return {
        date,
        opener, openerId,
        closer, closerId,
        moderator, moderatorId,
        absentIds,
        upcoming,
    };
}
