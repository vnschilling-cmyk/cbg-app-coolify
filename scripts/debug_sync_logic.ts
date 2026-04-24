
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

const CHURCHTOOLS_BASE_URL = process.env.CHURCHTOOLS_BASE_URL || '';
const CHURCHTOOLS_TOKEN = process.env.CHURCHTOOLS_TOKEN || '';
const PB_URL = 'http://pocketbase-cbg-app-coolify.195.201.231.49.nip.io';

// Using the meeting ID found: r7lwcwjazyz0qis
const meetingId = 'r7lwcwjazyz0qis';

async function debug() {
    console.log('--- DEBUG SYNC LOGIC ---');

    // Init PB
    const pb = new PocketBase(PB_URL);
    // We might need auth if the collection is private, but let's try without first or use an admin login if needed.
    // For now assuming public read or we'll get an error.
    try {
        await pb.admins.authWithPassword('admin@cbg.app', 'viktorschilling_admin_1234');
    } catch (e) {
        console.log('Admin auth failed, trying without...');
    }

    try {
        const meeting = await pb.collection('meetings').getOne(meetingId);
        console.log('Meeting Date:', meeting.date);

        const d = new Date(meeting.date);
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

        const dNext = new Date(d);
        dNext.setUTCDate(d.getUTCDate() + 1);
        const nextDateStr = `${dNext.getUTCFullYear()}-${String(dNext.getUTCMonth() + 1).padStart(2, '0')}-${String(dNext.getUTCDate()).padStart(2, '0')}`;

        console.log(`Date Range: ${dateStr} to ${nextDateStr}`);

        const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);
        const events = await client.getEventsWithServices(dateStr, nextDateStr);
        console.log(`Found ${events.length} events.`);

        let selectedEvent = events.find((e: any) => (e.name || e.title || '').toLowerCase().includes('bruderrat'));
        if (!selectedEvent && events.length > 0) selectedEvent = events[0];

        if (!selectedEvent) {
            console.log('No event selected.');
            return;
        }

        console.log('Selected Event:', selectedEvent.name);
        const bookings = await client.getEventBookings(selectedEvent.id);
        console.log(`Found ${bookings.length} bookings.`);

        const allMembers = await pb.collection('members').getFullList({ sort: 'name' });
        console.log(`Found ${allMembers.length} members in PB.`);

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

            console.log(`Processing booking: Service="${serviceName}" (ID: ${serviceId}), Person="${personName}"`);

            if (!personName) continue;

            const member = allMembers.find(m => m.name.toLowerCase() === personName.toLowerCase());

            if (member) {
                console.log(`  -> Matched PB Member: ${member.name} (${member.id})`);
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
                console.log(`  -> No PB Member found for "${personName}"`);
            }
        }

        console.log('--- UPDATES OBJECT ---');
        console.log(JSON.stringify(updates, null, 2));

    } catch (err: any) {
        console.error(err);
    }
}

debug();
