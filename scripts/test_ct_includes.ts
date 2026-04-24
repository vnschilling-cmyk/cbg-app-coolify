import 'dotenv/config';
import { ChurchToolsClient } from '../src/lib/server/churchtools';

async function testEvents() {
    const client = new ChurchToolsClient(process.env.CHURCHTOOLS_BASE_URL || '', process.env.CHURCHTOOLS_TOKEN || '');
    const data = await client.request('events?limit=2&include=services,eventServices');
    console.log(JSON.stringify(data.data[0], null, 2));
}

testEvents();
