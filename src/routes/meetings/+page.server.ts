import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    let meetings: any[] = [];
    let members: any[] = [];

    let groups: any[] = [];

    try {
        if (locals.user) {
            groups = await locals.pb.collection('groups').getFullList({
                sort: 'name'
            });
        }
    } catch (e: any) {
        console.error('Failed to fetch groups:', e.message);
    }

    try {
        meetings = await locals.pb.collection('meetings').getFullList({
            sort: '-created',
            // Ideally filter by group here too, but we can do it client-side or fetch all for now
            expand: 'group'
        });
    } catch (e: any) {
        console.error('Failed to fetch meetings:', e.message);
    }

    try {
        members = await locals.pb.collection('members').getFullList({
            sort: 'name',
            expand: 'group'
        });
    } catch (e: any) {
        console.error('Failed to fetch members:', e.message);
    }

    const user = locals.user;
    const userGroups = user?.groups ? (Array.isArray(user.groups) ? user.groups : [user.groups]) : [];

    return { meetings, members, groups, userGroups };
};
