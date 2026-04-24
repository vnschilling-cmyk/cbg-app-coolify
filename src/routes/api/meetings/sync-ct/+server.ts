import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
    const logs: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    try {
        const { meetingId } = await request.json();

        if (!meetingId) {
            return json({ error: 'Missing meetingId' }, { status: 400 });
        }

        const client = new ChurchToolsClient(env.CHURCHTOOLS_BASE_URL || '', env.CHURCHTOOLS_TOKEN || '');

        log(`[Sync] Base URL: ${env.CHURCHTOOLS_BASE_URL}`);
        log(`[Sync] Token length: ${env.CHURCHTOOLS_TOKEN?.length || 0}`);

        // 1. Fetch meeting from PocketBase to get the date
        const meeting = await locals.pb.collection('meetings').getOne(meetingId);
        // Format date to YYYY-MM-DD for ChurchTools API
        // PocketBase dates are stored as UTC midnight, e.g. "2026-02-21 00:00:00.000Z"
        // We MUST use UTC methods to avoid local timezone shifts
        const d = new Date(meeting.date);
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

        // Calculate next day to ensure we catch events later in the day if timezones/logic align that way
        const dNext = new Date(d);
        dNext.setUTCDate(d.getUTCDate() + 1);
        const nextDateStr = `${dNext.getUTCFullYear()}-${String(dNext.getUTCMonth() + 1).padStart(2, '0')}-${String(dNext.getUTCDate()).padStart(2, '0')}`;

        log(`[Sync] Meeting date: ${meeting.date}, Formatted range: ${dateStr} to ${nextDateStr}`);

        // 2. Query ChurchTools for events on this date
        // Widen range slightly to ensure we catch the event regardless of timezone nuances
        const events = await client.getEventsWithServices(dateStr, nextDateStr);

        log(`[Sync] API returned ${events.length} events`);
        if (events.length > 0) {
            events.forEach((e: any, i) => {
                log(`[Sync] Event ${i}: name="${e.name}", title="${e.title}", id=${e.id}`);
            });
        }

        if (events.length === 0) {
            return json({
                success: false,
                error: `Keine ChurchTools-Veranstaltungen am ${dateStr} gefunden.`,
                logs
            });
        }

        // Pick the best matching event
        // Priority: Title contains "Bruderrat", otherwise just the first event
        let selectedEvent = events.find(e => (e.name || e.title || '').toLowerCase().includes('bruderrat'));
        if (!selectedEvent) {
            selectedEvent = events[0];
        }

        const ctEventId = selectedEvent.id;

        // 3. Fetch bookings from ChurchTools for this event
        const bookings = await client.getEventBookings(ctEventId);

        // 2. Fetch all members from PocketBase to match names
        const allMembers = await locals.pb.collection('members').getFullList({
            sort: 'name'
        });

        // 3. Mapping logical assignments
        // Common service names in ChurchTools
        const mappings = {
            moderator: { ids: [114], names: ['Moderator', 'Moderation', 'Leitung'] },
            intro: { ids: [88], names: ['Einleitung', 'Einleitungswort', 'Einstieg'] },
            closing: { ids: [117], names: ['Abschluss', 'Schlussgebet', 'Abschlussgebet', 'Schlusswort'] }
        };

        const updates: any = {};
        const foundServices: string[] = [];

        for (const booking of bookings) {
            const serviceName = booking.name || booking.serviceName || '';
            const serviceId = booking.serviceId;
            const personName = booking.person ? `${booking.person.domainAttributes.firstName} ${booking.person.domainAttributes.lastName}`.trim() : `${booking.firstName} ${booking.lastName}`.trim();

            if (!personName) continue;

            // Try to find matching member in PocketBase
            const member = allMembers.find(m => m.name.toLowerCase() === personName.toLowerCase());

            if (member) {
                if (mappings.moderator.ids.includes(serviceId) || mappings.moderator.names.some(m => serviceName.includes(m))) {
                    updates.moderator = member.id;
                    foundServices.push(`Moderator: ${personName}`);
                } else if (mappings.intro.ids.includes(serviceId) || mappings.intro.names.some(m => serviceName.includes(m))) {
                    updates.intro_bible_word = member.id;
                    foundServices.push(`Einleitung: ${personName}`);
                } else if (mappings.closing.ids.includes(serviceId) || mappings.closing.names.some(m => serviceName.includes(m))) {
                    updates.closing_bible_word = member.id;
                    foundServices.push(`Abschluss: ${personName}`);
                }
            } else {
                log(`[Sync] Warning: Person "${personName}" found in CT but not in PB (Service: ${serviceName})`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await locals.pb.collection('meetings').update(meetingId, updates);
            return json({
                success: true,
                updates,
                message: `Synchronisiert: ${foundServices.join(', ')}`,
                logs
            });
        } else {
            return json({
                success: true,
                message: 'Keine passenden Zuweisungen in ChurchTools gefunden.',
                logs
            });
        }

    } catch (err: any) {
        console.error('Sync error:', err);
        return json({ error: err.message, logs }, { status: 500 });
    }
};
