import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config();

async function resetPassword() {
    const url = process.env.PUBLIC_POCKETBASE_URL || 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io';
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(
            process.env.PB_ADMIN_EMAIL!,
            process.env.PB_ADMIN_PASSWORD!
        );
        
        const user = await pb.collection('users').getFirstListItem('email="vrsg@posteo.de"');
        const newPassword = process.env.PB_ADMIN_PASSWORD!; // 'Muenze1980!#'
        
        await pb.collection('users').update(user.id, {
            password: newPassword,
            passwordConfirm: newPassword
        });
        
        console.log(`Successfully reset password for ${user.email} to the value from PB_ADMIN_PASSWORD.`);
    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}

resetPassword();
