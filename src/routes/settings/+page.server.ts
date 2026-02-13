import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    let groups: any[] = [];
    let preachers: any[] = [];
    let serviceRules: any[] = [];

    if (locals.user && locals.pb) {
        try {
            groups = await locals.pb.collection('groups').getFullList({
                sort: 'name',
            });

            // Fetch members of group "Prediger" (ct_id 164)
            const predigerGroup = groups.find((g: any) => g.ct_id === '164');
            if (predigerGroup) {
                preachers = await locals.pb.collection('members').getFullList({
                    filter: `group = "${predigerGroup.id}"`,
                    sort: 'name',
                });
            }

            serviceRules = await locals.pb.collection('service_rules').getFullList({
                sort: 'weekday,time',
            });
        } catch (e: any) {
            console.error('Failed to fetch data:', e.message);
        }
    }

    return { groups, preachers, serviceRules };
};
