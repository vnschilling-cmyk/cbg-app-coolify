import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

export const pb = new PocketBase(PUBLIC_POCKETBASE_URL || 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io');

export const user = writable(pb.authStore.model);

pb.authStore.onChange((auth) => {
    user.set(pb.authStore.model);
});
