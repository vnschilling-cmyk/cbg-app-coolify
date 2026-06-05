/**
 * POST /api/preachers-fix?confirm=viktor-sen   (einmalige Datenkorrektur)
 * Viktor Enns: CT-Verknüpfung 613 an „(Sen.)" hängen, den reinen
 * „Viktor Enns" (ct 613) im Prediger-Bereich löschen. „(Jun.)" bleibt.
 * Wird nach Ausführung wieder entfernt.
 */
import { json, preflight } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ url }) {
    if (url.searchParams.get('confirm') !== 'viktor-sen') {
        return json({ error: 'confirm fehlt' }, 400);
    }
    try {
        const pb = await adminPb();
        const prediger = await pb
            .collection('groups')
            .getFirstListItem('ct_id="164"');
        const all = await pb
            .collection('members')
            .getFullList({ filter: `group="${prediger.id}"` });
        const sen = all.find((m: any) => m.name === 'Viktor Enns (Sen.)');
        const plain = all.find(
            (m: any) => m.name === 'Viktor Enns' && String(m.ct_id) === '613',
        );
        const actions: string[] = [];
        if (sen && !sen.ct_id) {
            await pb.collection('members').update(sen.id, { ct_id: '613' });
            actions.push('Sen. -> ct_id 613');
        }
        if (plain) {
            await pb.collection('members').delete(plain.id);
            actions.push('reiner „Viktor Enns" (ct 613) gelöscht');
        }
        return json({ ok: true, actions });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
