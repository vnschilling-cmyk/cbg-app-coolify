/**
 * Gemeindeverzeichnis: Rechteprüfung, erlaubte Felder und Geokodierung.
 *
 * Geokodierung über OpenStreetMap/Nominatim. Deren Nutzungsregeln verlangen
 * höchstens eine Anfrage pro Sekunde und eine erkennbare Anwendung im
 * User-Agent – beides wird hier zentral eingehalten.
 */
import {
    adminPb, getConfig, effectiveRole, accessForUser, type AccessLevel,
} from '$lib/server/admin';

/** Zugriffsstufe des Nutzers auf das Gemeindeverzeichnis (null = keiner). */
export async function gemeindenAccess(
    user: { id: string; role?: string } | null,
): Promise<AccessLevel | null> {
    if (!user) return null;
    try {
        const pb = await adminPb();
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        const rolePerms = (await getConfig(pb, 'role_perms')) || {};
        const userPerms = (await getConfig(pb, 'user_perms')) || {};
        const userAccess = (await getConfig(pb, 'user_access')) || {};
        const role = effectiveRole(user.id, user.role, roleMap);
        const acc = accessForUser(user.id, role, userAccess, rolePerms, userPerms);
        return acc.gemeinden ?? null;
    } catch {
        // Rechteprüfung fehlgeschlagen -> kein Zugriff (fail-closed).
        return null;
    }
}

const TEXT_FIELDS = [
    'name', 'bund', 'strasse', 'plz', 'ort', 'bundesland', 'gottesdienst',
    'telefon', 'email', 'website', 'notiz', 'geprueft_am',
] as const;

const str = (v: unknown, max = 2000) =>
    (v ?? '').toString().trim().slice(0, max);

function pickArea(v: any): Record<string, string> {
    const a = v && typeof v === 'object' ? v : {};
    return {
        ansprechperson: str(a.ansprechperson, 200),
        treffen: str(a.treffen, 200),
        alter: str(a.alter, 100),
        angebote: str(a.angebote, 500),
        notiz: str(a.notiz, 2000),
    };
}

function pickKontakte(v: any): Record<string, unknown>[] {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 100)
        .filter((k) => k && typeof k === 'object' && str(k.name))
        .map((k) => ({
            name: str(k.name, 200),
            rolle: str(k.rolle, 100),
            telefon: str(k.telefon, 100),
            email: str(k.email, 200),
            notiz: str(k.notiz, 1000),
            einwilligung: k.einwilligung === true,
        }));
}

/** Übernimmt nur erlaubte Felder (nur die im Body vorhandenen). */
export function pickGemeinde(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!body || typeof body !== 'object') return out;
    for (const f of TEXT_FIELDS) {
        if (f in body) out[f] = str(body[f]);
    }
    if ('kontakte' in body) out.kontakte = pickKontakte(body.kontakte);
    if ('kinder' in body) out.kinder = pickArea(body.kinder);
    if ('jugend' in body) out.jugend = pickArea(body.jugend);
    for (const f of ['lat', 'lng'] as const) {
        if (f in body) {
            const n = Number(body[f]);
            out[f] = Number.isFinite(n) ? n : null;
        }
    }
    return out;
}

// ── Geokodierung ────────────────────────────────────────────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Secretarius/1.0 (+https://api.dienst.cbgg.de)';
let lastCall = 0;

/** Wartet so lange, dass zwischen zwei Anfragen mind. 1,1 s liegen. */
async function throttle(): Promise<void> {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
}

async function nominatim(params: Record<string, string>): Promise<any[]> {
    await throttle();
    const url = new URL(NOMINATIM);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('countrycodes', 'de');
    url.searchParams.set('accept-language', 'de');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

export type GeoResult = { lat: number; lng: number; status: 'ok' | 'ort' | 'fehler' };

/**
 * Ermittelt Koordinaten zur Adresse: erst Straße + PLZ + Ort, dann nur
 * PLZ + Ort (ungenauer, Status 'ort').
 */
export async function geocodeAddress(
    strasse: string, plz: string, ort: string,
): Promise<GeoResult> {
    // Ortsteile wie „Grünberg-Queckborn" findet Nominatim oft nur ohne Zusatz.
    const city = ort.replace(/\s*\(.*\)\s*$/, '').trim();
    const postalcode = plz.padStart(5, '0');
    if (strasse) {
        const hit = await nominatim({
            street: strasse, postalcode, city, limit: '1',
        });
        if (hit[0]) return { lat: +hit[0].lat, lng: +hit[0].lon, status: 'ok' };
    }
    let hit = await nominatim({ postalcode, city, limit: '1' });
    if (!hit[0] && city.includes('-')) {
        hit = await nominatim({ postalcode, limit: '1' });
    }
    if (hit[0]) return { lat: +hit[0].lat, lng: +hit[0].lon, status: 'ort' };
    return { lat: 0, lng: 0, status: 'fehler' };
}

const placeCache = new Map<string, { label: string; lat: number; lng: number }[]>();

/** Ortssuche für die Umkreissuche (freier Text: Ort, PLZ, Adresse). */
export async function searchPlace(
    q: string,
): Promise<{ label: string; lat: number; lng: number }[]> {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    const cached = placeCache.get(key);
    if (cached) return cached;
    const hits = await nominatim({ q: q.trim(), limit: '5', addressdetails: '1' });
    const list = hits.map((h: any) => {
        const a = h.address || {};
        const place = a.city || a.town || a.village || a.municipality || a.hamlet
            || a.suburb || h.name || '';
        const parts = [a.road ? `${a.road} ${a.house_number || ''}`.trim() : '',
            [a.postcode, place].filter(Boolean).join(' '), a.state || '']
            .filter(Boolean);
        return {
            label: parts.join(', ') || h.display_name,
            lat: +h.lat,
            lng: +h.lon,
        };
    });
    if (placeCache.size > 500) placeCache.clear();
    placeCache.set(key, list);
    return list;
}
