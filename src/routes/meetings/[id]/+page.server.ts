import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    try {
        const meeting = await locals.pb.collection('meetings').getOne(params.id);

        let items: any[] = [];
        try {
            items = await locals.pb.collection('protocol_items').getFullList({
                filter: `meeting_id = "${params.id}"`,
                sort: 'sort_order',
            });
        } catch (e: any) {
            console.error('Failed to load protocol items:', e.message);
        }

        let members: any[] = [];
        try {
            // Filter members by the meeting's group to stay within group boundaries
            const groupFilter = meeting.group ? `group = "${meeting.group}"` : "";
            members = await locals.pb.collection('members').getFullList({
                filter: groupFilter,
                sort: 'name',
            });
        } catch (e: any) {
            console.error('Failed to load members:', e.message);
        }

        let attendance: any[] = [];
        try {
            attendance = await locals.pb.collection('meeting_attendance').getFullList({
                filter: `meeting_id = "${params.id}"`,
            });
        } catch (e: any) {
            console.error('Failed to load attendance:', e.message);
        }

        return { meeting, items, members, attendance };
    } catch (e: any) {
        console.error('Failed to load meeting:', e.message);
        if (e.status === 404) {
            throw error(404, 'Meeting nicht gefunden.');
        }
        return {
            meeting: { id: params.id, title: 'Unbekanntes Meeting' },
            items: [],
            members: [],
            attendance: [],
        };
    }
};
