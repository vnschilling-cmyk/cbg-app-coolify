import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import { dev } from '$app/environment';

export const pb = new PocketBase(PUBLIC_POCKETBASE_URL || 'https://db.dienst.cbgg.de');

if (typeof document !== 'undefined') {
    pb.authStore.loadFromCookie(document.cookie);
}

export const user = writable(pb.authStore.model);

pb.authStore.onChange((auth) => {
    user.set(pb.authStore.model);
    if (typeof document !== 'undefined') {
        document.cookie = pb.authStore.exportToCookie({ httpOnly: false, secure: !dev, sameSite: 'Lax', path: '/' });
    }
});
