import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    let meetings: any[] = [];
    let members: any[] = [];

    try {
        meetings = await locals.pb.collection('meetings').getFullList({
            sort: '-created',
        });
    } catch (e: any) {
        console.error('Failed to fetch meetings:', e.message);
    }

    try {
        members = await locals.pb.collection('members').getFullList({
            sort: 'name',
        });
    } catch (e: any) {
        console.error('Failed to fetch members:', e.message);
    }

    return { meetings, members };
};
