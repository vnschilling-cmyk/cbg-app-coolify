
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    try {
        const plans = await locals.pb.collection('plans').getFullList({
            sort: '-period_start'
        });

        return {
            plans: plans.map(p => ({
                id: p.id,
                name: `${new Date(p.period_start).toLocaleDateString('de-DE', { month: 'long' })} - ${new Date(p.period_end).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
                status: p.status || 'draft',
                lastModified: new Date(p.updated),
                progress: p.data ? Object.keys(p.data).length > 0 ? 50 : 0 : 0, // Placeholder calculation
                period_start: p.period_start,
                period_end: p.period_end
            }))
        };
    } catch (e) {
        console.error('Failed to load plans:', e);
        return {
            plans: []
        };
    }
};

export const actions: Actions = {
    delete: async ({ request, locals }) => {
        const formData = await request.formData();
        const id = formData.get('id') as string;

        if (!id) {
            return { success: false, error: 'Keine ID angegeben' };
        }

        try {
            await locals.pb.collection('plans').delete(id);
            return { success: true };
        } catch (e: any) {
            console.error('Failed to delete plan:', e);
            return { success: false, error: e.message };
        }
    }
};
