import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function init() {
    const pb = new PocketBase(PB_URL);

    try {
        console.log(`Logging in as ${ADMIN_EMAIL}...`);
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('Login successful.');

        // Create service_rules collection
        const collectionData = {
            name: 'service_rules',
            type: 'base',
            schema: [
                {
                    name: 'weekday',
                    type: 'text',
                    required: true,
                },
                {
                    name: 'time',
                    type: 'text',
                    required: true,
                },
                {
                    name: 'nth_sunday',
                    type: 'number',
                    required: false,
                },
                {
                    name: 'allowed_services',
                    type: 'json',
                    required: true,
                },
                {
                    name: 'max_assignments',
                    type: 'json',
                    required: false,
                }
            ],
            listRule: '',
            viewRule: '',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
        };

        try {
            await pb.collections.create(collectionData);
            console.log('Collection "service_rules" created successfully.');
        } catch (e) {
            if (e.status === 400) {
                console.log('Collection "service_rules" already exists.');
            } else {
                throw e;
            }
        }

        // Add default rules matching the current hardcoded logic
        const defaultRules = [
            { weekday: '3', time: '19:00', nth_sunday: 0, allowed_services: ['Als'] }, // Wednesday
            { weekday: '5', time: '19:00', nth_sunday: 0, allowed_services: ['BS', 'GS'] }, // Friday
            { weekday: '0', time: '09:30', nth_sunday: 1, allowed_services: ['🍷', 'L', '1', '2', 'V'] }, // 1. Sun Morning
            { weekday: '0', time: '17:00', nth_sunday: 1, allowed_services: ['L', '1', '2', 'Als'] }, // 1. Sun Evening
            { weekday: '0', time: '09:30', nth_sunday: 2, allowed_services: ['L', '1', '2', 'BN'] }, // 2. Sun Morning
            { weekday: '0', time: '17:00', nth_sunday: 2, allowed_services: ['L', '1', '2'] }, // 2. Sun Evening
            { weekday: '0', time: '09:30', nth_sunday: 3, allowed_services: ['L', '1', '2'] }, // 3. Sun Morning
            { weekday: '0', time: '16:00', nth_sunday: 3, allowed_services: ['Anf', 'Schl'] }, // 3. Sun 16:00
            { weekday: '0', time: '17:00', nth_sunday: 3, allowed_services: ['L', '1', '2'] }, // 3. Sun Evening
            { weekday: '0', time: '09:30', nth_sunday: 4, allowed_services: ['L', '1', '2'] }, // 4. Sun Morning
            { weekday: '0', time: '17:00', nth_sunday: 4, allowed_services: ['L', '1', '2'] }, // 4. Sun Evening
            { weekday: 'Holiday', time: '09:30', nth_sunday: 0, allowed_services: ['🍷', 'L', '1', '2', 'V'] }, // Holiday Morning
        ];

        console.log('Fetching existing rules...');
        const existingRules = await pb.collection('service_rules').getFullList();

        console.log('Adding default rules...');
        for (const rule of defaultRules) {
            // Check if rule already exists (crude check by weekday, time, nth_sunday)
            const isDuplicate = existingRules.some(r =>
                r.weekday === rule.weekday &&
                r.time === rule.time &&
                r.nth_sunday === rule.nth_sunday
            );

            if (!isDuplicate) {
                await pb.collection('service_rules').create(rule);
                console.log(`Added rule for weekday ${rule.weekday} at ${rule.time}`);
            } else {
                console.log(`Rule for weekday ${rule.weekday} at ${rule.time} already exists.`);
            }
        }

        console.log('Setup complete.');
    } catch (e) {
        console.error('Setup failed:', e);
    }
}

init();
