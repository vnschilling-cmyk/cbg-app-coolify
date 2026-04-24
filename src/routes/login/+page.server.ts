import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
    login: async ({ request, locals }) => {
        const formData = await request.formData();
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;

        if (!email || !password) {
            return fail(400, {
                email,
                error: 'Bitte gib Email und Passwort ein.'
            });
        }

        try {
            await locals.pb.collection('users').authWithPassword(email, password);
        } catch (e: any) {
            console.error('Login error detail:', {
                status: e.status,
                url: locals.pb.baseUrl,
                message: e.message,
                data: e.data
            });

            let message = 'Login fehlgeschlagen.';
            if (e.status === 0) message = 'Verbindung zum Datenbank-Server fehlgeschlagen (PocketBase nicht erreichbar).';
            else if (e.status === 400 || e.status === 401) message = 'Ungültige Email oder Passwort.';

            return fail(e.status || 500, {
                email,
                error: message
            });
        }

        throw redirect(303, '/');
    }
};
