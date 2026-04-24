import PocketBase from 'pocketbase';

const PB_URL = 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io';
const PB_ADMIN_EMAIL = 'admin@cbg-app.de';
const PB_ADMIN_PASSWORD = 'Muenze1980!#';

async function addPlanFields() {
    const pb = new PocketBase(PB_URL);

    try {
        // Authenticate as admin
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
        console.log('✅ Admin authenticated');

        // Get the plans collection
        const collections = await pb.collections.getFullList();
        const plansCollection = collections.find((c: any) => c.name === 'plans');

        if (!plansCollection) {
            console.error('❌ plans collection not found!');
            console.log('Available collections:', collections.map((c: any) => c.name).join(', '));
            return;
        }

        console.log(`📋 Found plans collection (ID: ${plansCollection.id})`);
        
        // Debug: show the collection structure
        const collData = JSON.stringify(plansCollection, null, 2);
        // Check if schema is at .schema or .fields
        const schemaArray = (plansCollection as any).schema || (plansCollection as any).fields || [];
        console.log('   Schema property type:', typeof schemaArray, Array.isArray(schemaArray) ? `(array, ${schemaArray.length} items)` : '');
        
        if (Array.isArray(schemaArray)) {
            const existingFields = schemaArray.map((f: any) => f.name);
            console.log('   Current fields:', existingFields.join(', '));
        } else {
            console.log('   Raw collection keys:', Object.keys(plansCollection).join(', '));
            // Print a subset of the collection data for debugging
            const keys = Object.keys(plansCollection);
            for (const k of keys) {
                const val = (plansCollection as any)[k];
                if (Array.isArray(val)) {
                    console.log(`   ${k}: [${val.length} items]`, val.length > 0 ? JSON.stringify(val[0]).substring(0, 100) : '');
                } else if (typeof val === 'object' && val !== null) {
                    console.log(`   ${k}: {object}`, JSON.stringify(val).substring(0, 100));
                } else {
                    console.log(`   ${k}:`, val);
                }
            }
        }

        // Try to directly create the fields using the API
        // PocketBase v0.22+ uses a different approach
        console.log('\n--- Attempting to add fields via direct collection update ---');
        
        const currentSchema = (plansCollection as any).schema || (plansCollection as any).fields || [];
        const existingNames = Array.isArray(currentSchema) ? currentSchema.map((f: any) => f.name) : [];
        
        const newFields: any[] = [];
        
        if (!existingNames.includes('special_services')) {
            newFields.push({ name: 'special_services', type: 'json', required: false });
        }
        if (!existingNames.includes('hidden_preachers')) {
            newFields.push({ name: 'hidden_preachers', type: 'json', required: false });
        }
        
        if (newFields.length > 0) {
            const updatedSchema = [...currentSchema, ...newFields];
            
            try {
                await pb.collections.update(plansCollection.id, { schema: updatedSchema });
                console.log(`✅ Added fields via 'schema' property`);
            } catch (e1: any) {
                console.log('   schema update failed:', e1.message);
                try {
                    await pb.collections.update(plansCollection.id, { fields: updatedSchema });
                    console.log(`✅ Added fields via 'fields' property`);
                } catch (e2: any) {
                    console.log('   fields update failed:', e2.message);
                    console.log('   Response:', JSON.stringify(e2.response || {}, null, 2));
                }
            }
        } else {
            console.log('✅ All plan fields already exist');
        }

        // Also add hidden_by_default to members
        const membersCollection = collections.find((c: any) => c.name === 'members');
        if (membersCollection) {
            const memberSchema = (membersCollection as any).schema || (membersCollection as any).fields || [];
            const memberFieldNames = Array.isArray(memberSchema) ? memberSchema.map((f: any) => f.name) : [];
            
            if (!memberFieldNames.includes('hidden_by_default')) {
                const updatedMemberSchema = [...memberSchema, { name: 'hidden_by_default', type: 'bool', required: false }];
                try {
                    await pb.collections.update(membersCollection.id, { schema: updatedMemberSchema });
                    console.log('✅ Added hidden_by_default to members via schema');
                } catch (e1: any) {
                    try {
                        await pb.collections.update(membersCollection.id, { fields: updatedMemberSchema });
                        console.log('✅ Added hidden_by_default to members via fields');
                    } catch (e2: any) {
                        console.log('❌ Failed to add hidden_by_default to members:', e2.message);
                    }
                }
            } else {
                console.log('✅ hidden_by_default already exists on members');
            }
        }

    } catch (err: any) {
        console.error('❌ Error:', err.message || err);
        if (err.response) {
            console.error('   Response:', JSON.stringify(err.response, null, 2));
        }
    }
}

addPlanFields();
