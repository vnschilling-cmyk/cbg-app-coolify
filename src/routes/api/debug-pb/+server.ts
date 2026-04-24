import { json } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

export const GET = async () => {
    const results: any[] = [];
    const urls = [
        PUBLIC_POCKETBASE_URL,
        'http://127.0.0.1:8090',
        'http://localhost:8090',
        'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io'
    ];

    for (const url of urls) {
        try {
            const pb = new PocketBase(url);
            const health = await pb.health.check();
            results.push({ url, status: 'SUCCESS', health });
        } catch (e: any) {
            const errorDetail = {
                url,
                message: e.message,
                status: e.status,
                stack: e.stack,
                cause: e.cause?.message || e.cause
            };
            results.push({ url, status: 'FAILED', error: e.message });
            import('fs').then(fs => {
                fs.appendFileSync('pb_debug_results.log', JSON.stringify(errorDetail, null, 2) + '\n---\n');
            });
        }
    }

    return json({ results });
};
