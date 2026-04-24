import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET = () => {
    return json({
        CHURCHTOOLS_BASE_URL: env.CHURCHTOOLS_BASE_URL || 'UNDEFINED',
        CHURCHTOOLS_TOKEN_LENGTH: env.CHURCHTOOLS_TOKEN?.length || 0,
        NODE_ENV: process.env.NODE_ENV
    });
};
