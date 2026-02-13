import PocketBase from 'pocketbase';
import type { Handle } from '@sveltejs/kit';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.pb = new PocketBase(PUBLIC_POCKETBASE_URL || 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io');

    // Load authStore from cookie
    event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

    try {
        // Authenticate and refresh if valid
        if (event.locals.pb.authStore.isValid) {
            await event.locals.pb.collection('users').authRefresh();
            event.locals.user = event.locals.pb.authStore.model;
        }
    } catch (e: any) {
        console.error('Hook: Auth refresh failed. Connection to PB might be broken.', {
            error: e.message,
            url: event.locals.pb.baseUrl,
            cause: e.cause?.message || e.cause
        });
        event.locals.pb.authStore.clear();
        event.locals.user = null;
    }

    const response = await resolve(event);

    // Export authStore to cookie
    // httpOnly: false allows client-side JS to read the cookie (needed for hydration in lib/pocketbase.ts if not using server load)
    // secure: false is required for localhost http dev
    response.headers.append('set-cookie', event.locals.pb.authStore.exportToCookie({ httpOnly: false, secure: false }));

    return response;
};

export const handleError = ({ error, event }: { error: any, event: any }) => {
    // Log the error to console (server side)
    console.error('Server Error:', error);

    // Return original error info to client (usually hidden in prod, but we need it now)
    return {
        message: error?.message || 'Unknown Server Error',
        stack: error?.stack, // This might not be standard in SvelteKit return type but useful if supported
        code: error?.code
    };
};
