<script lang="ts">
    import { pb, user } from "$lib/pocketbase";
    import {
        Key,
        Save,
        ShieldCheck,
        AlertCircle,
        Loader2,
        ArrowLeft,
    } from "lucide-svelte";

    let ctApiKey = $state($user?.ct_api_key || "");
    let saving = $state(false);
    let success = $state(false);
    let error = $state("");

    async function saveSettings() {
        if (!$user) return;
        saving = true;
        error = "";
        success = false;

        try {
            await pb.collection("users").update($user.id, {
                ct_api_key: ctApiKey,
            });
            success = true;
            // Auto-hide success message after 3s
            setTimeout(() => (success = false), 3000);
        } catch (e: any) {
            error = "Fehler beim Speichern. Bitte versuche es später erneut.";
            console.error(e);
        } finally {
            saving = false;
        }
    }
</script>

<svelte:head>
    <title>Einstellungen | Predigerplan Pro</title>
</svelte:head>

<div class="p-8 max-w-2xl mx-auto w-full">
    <div class="mb-10 flex items-center gap-4">
        <a
            href="/"
            class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
            <ArrowLeft size={24} />
        </a>
        <div>
            <h2
                class="text-3xl font-black text-slate-900 dark:text-white tracking-tight"
            >
                Einstellungen
            </h2>
            <p class="text-slate-500 dark:text-slate-400 mt-1 font-medium">
                Verwalte dein Benutzerprofil und API-Anbindungen
            </p>
        </div>
    </div>

    <div class="space-y-6">
        <!-- ChurchTools Section -->
        <div
            class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm"
        >
            <div class="flex items-center gap-4 mb-8">
                <div
                    class="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400"
                >
                    <Key size={24} />
                </div>
                <div>
                    <h3
                        class="text-lg font-bold text-slate-900 dark:text-white"
                    >
                        ChurchTools API
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                        Verknüpfe deinen Account mit ChurchTools
                    </p>
                </div>
            </div>

            <div class="space-y-6">
                <div class="space-y-2">
                    <label
                        for="api-key"
                        class="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1"
                        >Persönlicher API-Token</label
                    >
                    <div class="relative">
                        <input
                            id="api-key"
                            type="password"
                            bind:value={ctApiKey}
                            placeholder="Dein ChurchTools API Token"
                            class="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-primary-600 dark:text-white transition-all outline-none"
                        />
                    </div>
                    <p
                        class="text-[10px] text-slate-400 dark:text-slate-500 mt-2 px-1 leading-relaxed"
                    >
                        Deinen API-Token findest du in ChurchTools unter "Mein
                        Profil" -> "Sicherheit". Dieser Key wird benötigt, um
                        deine Abwesenheiten und Termine zu synchronisieren.
                    </p>
                </div>

                {#if error}
                    <div
                        class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm"
                    >
                        <AlertCircle size={18} />
                        <p>{error}</p>
                    </div>
                {/if}

                {#if success}
                    <div
                        class="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400 text-sm"
                    >
                        <ShieldCheck size={18} />
                        <p>Einstellungen erfolgreich gespeichert!</p>
                    </div>
                {/if}

                <button
                    onclick={saveSettings}
                    disabled={saving}
                    class="btn btn-primary w-full py-4 flex items-center justify-center gap-2"
                >
                    {#if saving}
                        <Loader2 size={20} class="animate-spin" />
                        Wird gespeichert...
                    {:else}
                        <Save size={20} />
                        Änderungen speichern
                    {/if}
                </button>
            </div>
        </div>

        <!-- Info Section -->
        <div
            class="p-6 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30"
        >
            <h4
                class="text-amber-800 dark:text-amber-400 font-bold text-sm mb-1"
            >
                Hinweis zur Sicherheit
            </h4>
            <p
                class="text-amber-700 dark:text-amber-500/80 text-xs leading-relaxed"
            >
                Dein API-Token wird verschlüsselt in unserer Datenbank
                gespeichert und ausschließlich für die Synchronisierung mit
                ChurchTools verwendet. Gib deinen Token niemals an Dritte
                weiter.
            </p>
        </div>
    </div>
</div>
