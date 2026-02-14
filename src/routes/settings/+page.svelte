<script lang="ts">
    import { pb, user } from "$lib/pocketbase";
    import {
        Key,
        Save,
        ShieldCheck,
        AlertCircle,
        Loader2,
        ArrowLeft,
        Palette,
        Users,
        Trash2,
        Plus,
        CheckSquare,
        Square,
        ChevronDown,
        Clock,
    } from "lucide-svelte";
    import ThemeSwitcher from "$lib/components/ThemeSwitcher.svelte";
    import { invalidateAll, goto } from "$app/navigation";
    import { confirm } from "$lib/notifications.svelte";

    let { data } = $props();

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

    let syncing = $state(false);
    let syncSuccess = $state(false);
    let syncMessage = $state("");
    let syncLogs = $state<string[]>([]);

    async function triggerSync() {
        syncing = true;
        syncMessage = "";
        syncSuccess = false;

        try {
            const res = await fetch("/api/sync-members", { method: "POST" });
            const result = await res.json();
            syncLogs = result.logs || [];

            if (res.ok && result.success) {
                syncSuccess = true;
                syncMessage = result.message || "Synchronisation erfolgreich!";
                await invalidateAll();
            } else {
                syncSuccess = false;
                syncMessage =
                    result.message || "Fehler bei der Synchronisation.";
            }
        } catch (e) {
            console.error(e);
            syncSuccess = false;
            syncMessage = "Netzwerkfehler beim Aufruf des Syncs.";
        } finally {
            syncing = false;
        }
    }
    // Group Management
    let groups = $state<any[]>([]);
    let newGroupName = $state("");
    let newGroupCtId = $state("");
    let addingGroup = $state(false);

    $effect(() => {
        groups = data.groups || [];
    });

    async function addGroup() {
        if (!newGroupName.trim() || !newGroupCtId.trim()) return;
        addingGroup = true;
        try {
            const group = await pb.collection("groups").create({
                name: newGroupName.trim(),
                ct_id: newGroupCtId.trim(),
                color: "#6366f1", // Default Indigo
            });
            groups = [...groups, group];
            newGroupName = "";
            newGroupCtId = "";
        } catch (err) {
            console.error("Failed to create group:", err);
            error = "Fehler beim Erstellen der Gruppe.";
        } finally {
            addingGroup = false;
        }
    }

    async function deleteGroup(id: string) {
        const confirmed = await confirm("Gruppe wirklich löschen?");
        if (!confirmed) return;
        try {
            await pb.collection("groups").delete(id);
            groups = groups.filter((g: any) => g.id !== id);
        } catch (err) {
            console.error("Failed to delete group:", err);
            error = "Fehler beim Löschen der Gruppe.";
        }
    }

    // Preacher Permissions
    let preachers = $state<any[]>([]);

    $effect(() => {
        preachers = data.preachers || [];
    });
    const SERVICE_TYPES = [
        {
            code: "🍷",
            label: "Abendmahl",
            color: "bg-rose-900 text-white",
        },
        { code: "V", label: "Verteilen", color: "bg-rose-400 text-white" },
        { code: "L", label: "Leitung", color: "bg-blue-600 text-white" },
        {
            code: "1",
            label: "Predigt (10-15m)",
            color: "bg-emerald-600 text-white",
        },
        {
            code: "2",
            label: "Predigt (30-40m)",
            color: "bg-violet-600 text-white",
        },
        {
            code: "BN",
            label: "Bad Neustadt",
            color: "bg-lime-600 text-white",
        },
        { code: "Als", label: "Alsfeld", color: "bg-indigo-500 text-white" },
        {
            code: "BS",
            label: "Bibelstunde",
            color: "bg-fuchsia-600 text-white",
        },
        {
            code: "GS",
            label: "Gebetstunde",
            color: "bg-amber-600 text-white",
        },
    ];

    async function togglePermission(preacherId: string, serviceCode: string) {
        const preacher = preachers.find((p: any) => p.id === preacherId);
        if (!preacher) return;

        // Default to ALL services if allowed_services is empty/not set
        let allowed =
            Array.isArray(preacher.allowed_services) &&
            preacher.allowed_services.length > 0
                ? [...preacher.allowed_services]
                : SERVICE_TYPES.map((s) => s.code);

        if (allowed.includes(serviceCode)) {
            allowed = allowed.filter((c) => c !== serviceCode);
        } else {
            allowed.push(serviceCode);
        }

        try {
            const updated = await pb.collection("members").update(preacherId, {
                allowed_services: allowed,
            });
            // Update local state
            preachers = preachers.map((p: any) =>
                p.id === preacherId ? updated : p,
            );
        } catch (err) {
            console.error("Failed to update permissions:", err);
            error = "Fehler beim Aktualisieren der Berechtigungen.";
        }
    }
    // Service Rules Management
    let serviceRules = $state<any[]>([]);
    let newRuleName = $state("");
    let newRuleWeekday = $state("0"); // Default Sunday
    let newRuleTime = $state("09:30");
    let newRuleNthSunday = $state(0);
    let newRuleAllowed = $state<string[]>([]);
    let newRuleMax = $state<Record<string, number>>({});
    let addingRule = $state(false);

    $effect(() => {
        serviceRules = data.serviceRules || [];
    });

    async function addRule() {
        if (newRuleAllowed.length === 0) return;
        addingRule = true;
        try {
            const rule = await pb.collection("service_rules").create({
                name: newRuleName.trim(),
                weekday: newRuleWeekday,
                time: newRuleTime,
                nth_sunday: Number(newRuleNthSunday),
                allowed_services: newRuleAllowed,
                max_assignments: newRuleMax,
            });
            serviceRules = [...serviceRules, rule].sort((a, b) => {
                const dayOrder = a.weekday.localeCompare(b.weekday);
                if (dayOrder !== 0) return dayOrder;
                return a.time.localeCompare(b.time);
            });
            newRuleName = "";
            newRuleAllowed = [];
            newRuleMax = {};
            // Close all popovers
            dayDropdownOpen = false;
            nthSundayDropdownOpen = false;
            timePickerOpen = false;
        } catch (err) {
            console.error("Failed to create rule:", err);
            error = "Fehler beim Erstellen der Regel.";
        } finally {
            addingRule = false;
        }
    }

    async function deleteRule(id: string) {
        const confirmed = await confirm("Regel wirklich löschen?");
        if (!confirmed) return;
        try {
            await pb.collection("service_rules").delete(id);
            serviceRules = serviceRules.filter((r: any) => r.id !== id);
        } catch (err) {
            console.error("Failed to delete rule:", err);
            error = "Fehler beim Löschen der Regel.";
        }
    }

    function toggleRuleService(code: string) {
        if (newRuleAllowed.includes(code)) {
            newRuleAllowed = newRuleAllowed.filter((c) => c !== code);
            delete newRuleMax[code];
        } else {
            newRuleAllowed.push(code);
            newRuleMax[code] = 1; // Default
        }
    }

    const WEEKDAYS = [
        { value: "0", label: "Sonntag" },
        { value: "1", label: "Montag" },
        { value: "2", label: "Dienstag" },
        { value: "3", label: "Mittwoch" },
        { value: "4", label: "Donnerstag" },
        { value: "5", label: "Freitag" },
        { value: "6", label: "Samstag" },
        { value: "Holiday", label: "Feiertag" },
    ];

    let dayDropdownOpen = $state(false);
    let nthSundayDropdownOpen = $state(false);
    let timePickerOpen = $state(false);

    const NTH_OPTIONS = [
        { value: 0, label: "Jeder Sonntag" },
        { value: 1, label: "1. Sonntag" },
        { value: 2, label: "2. Sonntag" },
        { value: 3, label: "3. Sonntag" },
        { value: 4, label: "4. Sonntag" },
        { value: 5, label: "5. Sonntag" },
    ];

    function selectDay(value: string) {
        newRuleWeekday = value;
        dayDropdownOpen = false;
    }

    function selectNth(value: number) {
        newRuleNthSunday = value;
        nthSundayDropdownOpen = false;
    }

    const HOURS = Array.from({ length: 24 }, (_, i) =>
        i.toString().padStart(2, "0"),
    );
    const MINUTES = ["00", "15", "30", "45"];

    let selectedHour = $state("09");
    let selectedMinute = $state("30");

    $effect(() => {
        newRuleTime = `${selectedHour}:${selectedMinute}`;
    });
</script>

<svelte:head>
    <title>Einstellungen | διάκονος</title>
</svelte:head>

<div class="h-full overflow-y-auto transition-colors duration-300">
    <div class="p-8 max-w-4xl mx-auto w-full">
        <div class="mb-10 flex items-center gap-4">
            <a
                href="/"
                class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={24} />
            </a>
            <div>
                <h2
                    class="text-3xl font-black text-zinc-900 dark:text-white tracking-tight"
                >
                    Einstellungen
                </h2>
                <p class="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
                    Verwalte dein Benutzerprofil und API-Anbindungen
                </p>
            </div>
        </div>

        <div class="space-y-6">
            <!-- Appearance Section -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm flex items-center justify-between"
            >
                <div class="flex items-center gap-4">
                    <div
                        class="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400"
                    >
                        <Palette size={24} />
                    </div>
                    <div>
                        <h3
                            class="text-lg font-bold text-zinc-900 dark:text-white"
                        >
                            Erscheinungsbild
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">
                            Wähle dein bevorzugtes Design
                        </p>
                    </div>
                </div>
                <div>
                    <ThemeSwitcher />
                </div>
            </div>

            <!-- ChurchTools Section -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm"
            >
                <div class="flex items-center gap-4 mb-8">
                    <div
                        class="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400"
                    >
                        <Key size={24} />
                    </div>
                    <div>
                        <h3
                            class="text-lg font-bold text-zinc-900 dark:text-white"
                        >
                            ChurchTools API
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">
                            Verknüpfe deinen Account mit ChurchTools
                        </p>
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="space-y-2">
                        <label
                            for="api-key"
                            class="text-xs font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ml-1"
                            >Persönlicher API-Token</label
                        >
                        <div class="relative">
                            <input
                                id="api-key"
                                type="password"
                                bind:value={ctApiKey}
                                placeholder="Dein ChurchTools API Token"
                                class="w-full px-4 py-3.5 bg-zinc-50 dark:bg-zinc-700 border-none rounded-xl focus:ring-2 focus:ring-primary-600 dark:text-white transition-all outline-none"
                            />
                        </div>
                        <p
                            class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 px-1 leading-relaxed"
                        >
                            Deinen API-Token findest du in ChurchTools unter
                            "Mein Profil" -> "Sicherheit". Dieser Key wird
                            benötigt, um deine Abwesenheiten und Termine zu
                            synchronisieren.
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
                <!-- Group Management -->
                <div
                    class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm"
                >
                    <div class="flex items-center gap-4 mb-8">
                        <div
                            class="w-12 h-12 bg-violet-50 dark:bg-violet-900/20 rounded-2xl flex items-center justify-center text-violet-600 dark:text-violet-400"
                        >
                            <Users size={24} />
                        </div>
                        <div>
                            <h3
                                class="text-lg font-bold text-zinc-900 dark:text-white"
                            >
                                Gruppenverwaltung
                            </h3>
                            <p class="text-xs text-zinc-500 dark:text-zinc-400">
                                Definiere, welche ChurchTools-Gruppen
                                synchronisiert werden
                            </p>
                        </div>
                    </div>

                    <div class="space-y-6">
                        <!-- List -->
                        {#if groups.length > 0}
                            <div class="space-y-2">
                                {#each groups as group}
                                    <div
                                        class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-700 rounded-xl border border-zinc-100 dark:border-zinc-600"
                                    >
                                        <div>
                                            <p
                                                class="text-sm font-bold text-zinc-900 dark:text-white"
                                            >
                                                {group.name}
                                            </p>
                                            <p class="text-xs text-zinc-500">
                                                ID: {group.ct_id}
                                            </p>
                                        </div>
                                        <button
                                            onclick={() =>
                                                deleteGroup(group.id)}
                                            class="text-zinc-400 hover:text-red-500 p-2"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="text-sm text-zinc-400 italic">
                                Keine Gruppen angelegt.
                            </p>
                        {/if}

                        <!-- Add Form -->
                        <div class="flex gap-2">
                            <input
                                bind:value={newGroupName}
                                placeholder="Name (z.B. Bruderrat)"
                                class="flex-1 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl"
                            />
                            <input
                                bind:value={newGroupCtId}
                                placeholder="CT ID (z.B. 31)"
                                class="w-24 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl"
                            />
                            <button
                                onclick={addGroup}
                                disabled={addingGroup}
                                class="btn btn-primary px-4"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Member Sync Section -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm"
            >
                <div class="flex items-center gap-4 mb-8">
                    <div
                        class="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400"
                    >
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h3
                            class="text-lg font-bold text-zinc-900 dark:text-white"
                        >
                            Mitglieder Synchronisation
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">
                            Synchronisiere Mitglieder der Gruppe "Prediger" (ID
                            164)
                        </p>
                    </div>
                </div>

                <div class="space-y-6">
                    <p class="text-sm text-zinc-600 dark:text-zinc-400">
                        Hiermit werden alle Mitglieder der Gruppe aus
                        ChurchTools abgerufen und in der lokalen Datenbank
                        aktualisiert oder angelegt.
                    </p>

                    {#if syncMessage}
                        <div
                            class="mt-4 p-4 rounded-xl flex items-start gap-3 border {syncSuccess
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'}"
                        >
                            {#if syncSuccess}
                                <ShieldCheck
                                    size={20}
                                    class="shrink-0 mt-0.5"
                                />
                            {:else}
                                <AlertCircle
                                    size={20}
                                    class="shrink-0 mt-0.5"
                                />
                            {/if}
                            <div class="flex-1">
                                <p class="text-sm font-medium">{syncMessage}</p>
                                {#if syncLogs.length > 0}
                                    <div
                                        class="mt-4 p-3 bg-black/5 dark:bg-white/5 rounded-lg text-xs font-mono max-h-48 overflow-y-auto custom-scrollbar"
                                    >
                                        {#each syncLogs as logLine}
                                            <div
                                                class="py-0.5 border-b border-black/5 dark:border-white/5 last:border-0"
                                            >
                                                {logLine}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    <button
                        onclick={triggerSync}
                        disabled={syncing}
                        class="btn btn-secondary w-full py-4 flex items-center justify-center gap-2"
                    >
                        {#if syncing}
                            <Loader2 size={20} class="animate-spin" />
                            Synchronisiere...
                        {:else}
                            <ShieldCheck size={20} />
                            Jetzt Synchronisieren
                        {/if}
                    </button>
                </div>
            </div>

            <!-- Service Permissions Section -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm overflow-hidden"
            >
                <div class="flex items-center gap-4 mb-8">
                    <div
                        class="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                    >
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h3
                            class="text-lg font-bold text-zinc-900 dark:text-white"
                        >
                            Dienst-Berechtigungen
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">
                            Lege fest, welche Dienste welcher Prediger ausführen
                            darf
                        </p>
                    </div>
                </div>

                <div
                    class="overflow-auto -mx-8 px-8 custom-scrollbar max-h-[640px]"
                >
                    <table class="w-full text-left border-collapse table-fixed">
                        <thead>
                            <tr
                                class="border-b border-zinc-100 dark:border-zinc-600"
                            >
                                <th
                                    class="w-[70px] py-4 pr-1 text-[9px] font-black uppercase tracking-widest text-zinc-400 whitespace-nowrap sticky left-0 top-0 bg-white dark:bg-zinc-700 z-20 transition-colors"
                                    >Prediger</th
                                >
                                {#each SERVICE_TYPES as type}
                                    <th
                                        class="w-7 py-4 px-0 pb-4 text-center sticky top-0 bg-white dark:bg-zinc-700 z-10 transition-colors"
                                        title={type.label}
                                    >
                                        <div
                                            class="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold mx-auto {type.color}"
                                        >
                                            {type.code}
                                        </div>
                                    </th>
                                {/each}
                                <th class="w-4"></th>
                            </tr>
                        </thead>
                        <tbody
                            class="divide-y divide-zinc-50 dark:divide-zinc-800/50"
                        >
                            {#each preachers as preacher}
                                <tr
                                    class="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                                >
                                    <td
                                        class="w-[70px] py-1.5 pr-1 font-bold text-zinc-900 dark:text-zinc-200 text-[11px] truncate sticky left-0 bg-white dark:bg-zinc-700 group-hover:bg-zinc-50/50 dark:group-hover:bg-zinc-800/20 z-10 transition-colors"
                                        title={preacher.name}
                                    >
                                        {preacher.name}
                                    </td>
                                    {#each SERVICE_TYPES as type}
                                        {@const isAllowed =
                                            !preacher.allowed_services ||
                                            preacher.allowed_services.length ===
                                                0 ||
                                            preacher.allowed_services.includes(
                                                type.code,
                                            )}
                                        <td class="w-7 py-1.5 px-0 text-center">
                                            <button
                                                onclick={() =>
                                                    togglePermission(
                                                        preacher.id,
                                                        type.code,
                                                    )}
                                                class="w-10 h-10 rounded flex items-center justify-center mx-auto transition-all {isAllowed
                                                    ? 'text-primary-600 dark:text-primary-400'
                                                    : 'text-zinc-200 dark:text-zinc-800 hover:text-zinc-400'}"
                                            >
                                                {#if isAllowed}
                                                    <CheckSquare size={14} />
                                                {:else}
                                                    <Square size={14} />
                                                {/if}
                                            </button>
                                        </td>
                                    {/each}
                                    <td></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Service Configuration Section -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-3xl border border-zinc-200 dark:border-zinc-600 p-8 shadow-sm"
            >
                <div class="flex items-center gap-4 mb-8">
                    <div
                        class="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400"
                    >
                        <Save size={24} />
                    </div>
                    <div>
                        <h3
                            class="text-lg font-bold text-zinc-900 dark:text-white"
                        >
                            Dienst-Konfiguration
                        </h3>
                        <p class="text-xs text-zinc-500 dark:text-zinc-400">
                            Lege fest, welche Dienste an welchen Tagen angeboten
                            werden
                        </p>
                    </div>
                </div>

                <div class="space-y-6">
                    <!-- Rules List -->
                    {#if serviceRules.length > 0}
                        <div class="space-y-3">
                            {#each serviceRules as rule}
                                <div
                                    class="flex items-center justify-between p-4 bg-white dark:bg-zinc-700/50 rounded-2xl border border-zinc-100 dark:border-zinc-600 shadow-sm hover:shadow-md hover:border-zinc-200 dark:hover:border-zinc-700 transition-all group"
                                >
                                    <div class="flex-1">
                                        <div
                                            class="flex items-center gap-2 mb-1"
                                        >
                                            {#if rule.name}
                                                <span
                                                    class="text-sm font-bold text-zinc-900 dark:text-white mr-2"
                                                >
                                                    {rule.name}
                                                </span>
                                            {/if}
                                            <span
                                                class="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-600"
                                            >
                                                {WEEKDAYS.find(
                                                    (d) =>
                                                        String(d.value) ===
                                                        String(rule.weekday),
                                                )?.label || rule.weekday}
                                            </span>
                                            {#if rule.weekday === "0"}
                                                <span
                                                    class="text-[10px] px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md font-bold ring-1 ring-primary-200 dark:ring-primary-800/50"
                                                >
                                                    {rule.nth_sunday === 0
                                                        ? "Jeder"
                                                        : `${rule.nth_sunday}.`}
                                                    Sonntag
                                                </span>
                                            {/if}
                                            <span
                                                class="text-xs font-bold text-primary-600 dark:text-primary-400 ml-2"
                                            >
                                                {rule.time} Uhr
                                            </span>
                                        </div>
                                        <div class="flex flex-wrap gap-1.5">
                                            {#each rule.allowed_services as code}
                                                {@const type =
                                                    SERVICE_TYPES.find(
                                                        (t) => t.code === code,
                                                    )}
                                                {@const max =
                                                    rule.max_assignments?.[
                                                        code
                                                    ] || 1}
                                                <div
                                                    class="px-2 py-0.5 rounded text-[10px] font-bold {type?.color ||
                                                        'bg-zinc-200 text-zinc-600'}"
                                                    title={type?.label}
                                                >
                                                    {code}{max > 1
                                                        ? ` x${max}`
                                                        : ""}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                    <button
                                        onclick={() => deleteRule(rule.id)}
                                        class="text-zinc-400 hover:text-red-500 p-2 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-sm text-zinc-400 italic">
                            Keine Regeln konfiguriert. Standardregeln sind im
                            Quelltext hinterlegt.
                        </p>
                    {/if}

                    <!-- Add Rule Form -->
                    <div
                        class="p-6 bg-zinc-50 dark:bg-zinc-700/50 rounded-3xl border border-zinc-200 dark:border-zinc-600/50 space-y-4"
                    >
                        <div class="space-y-2">
                            <label
                                for="rule-name"
                                class="text-[10px] uppercase font-bold text-zinc-400"
                                >Name der Regel (z.B. Sonntag Morgen)</label
                            >
                            <input
                                id="rule-name"
                                type="text"
                                bind:value={newRuleName}
                                placeholder="Gottesdienst..."
                                class="w-full px-4 py-2.5 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 transition-all text-zinc-900 dark:text-white"
                            />
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                            <div class="space-y-2 relative">
                                <label
                                    for="rule-weekday"
                                    class="text-[10px] uppercase font-bold text-zinc-400"
                                    >Tag</label
                                >
                                <button
                                    id="rule-weekday"
                                    onclick={() =>
                                        (dayDropdownOpen = !dayDropdownOpen)}
                                    class="w-full px-4 py-2.5 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl flex items-center justify-between outline-none focus:ring-2 focus:ring-primary-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                    <span
                                        class="font-medium text-zinc-900 dark:text-white"
                                    >
                                        {WEEKDAYS.find(
                                            (d) => d.value === newRuleWeekday,
                                        )?.label}
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        class="text-zinc-400 transition-transform {dayDropdownOpen
                                            ? 'rotate-180'
                                            : ''}"
                                    />
                                </button>
                                {#if dayDropdownOpen}
                                    <div
                                        class="absolute top-full left-0 right-0 mt-2 p-2 bg-white dark:bg-[#0f172a] border border-zinc-200 dark:border-zinc-600/50 rounded-2xl shadow-2xl z-[101] max-h-64 overflow-y-auto custom-scrollbar ring-1 ring-black/5 dark:ring-white/5"
                                    >
                                        {#each WEEKDAYS as day}
                                            <button
                                                onclick={() =>
                                                    selectDay(day.value)}
                                                class="w-full text-left px-3 py-2 rounded-xl text-sm transition-colors {newRuleWeekday ===
                                                day.value
                                                    ? 'bg-primary-500 text-white font-bold'
                                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                            >
                                                {day.label}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <div class="space-y-2 relative">
                                <label
                                    for="rule-time"
                                    class="text-[10px] uppercase font-bold text-zinc-400"
                                    >Uhrzeit</label
                                >
                                <button
                                    id="rule-time"
                                    onclick={() =>
                                        (timePickerOpen = !timePickerOpen)}
                                    class="w-full px-4 py-2.5 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl flex items-center justify-between outline-none focus:ring-2 focus:ring-primary-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                    <span
                                        class="font-medium text-zinc-900 dark:text-white"
                                        >{newRuleTime} Uhr</span
                                    >
                                    <Clock size={16} class="text-zinc-400" />
                                </button>

                                {#if timePickerOpen}
                                    <div
                                        class="absolute top-full left-0 right-0 mt-2 p-3 bg-white dark:bg-[#0f172a] border border-zinc-200 dark:border-zinc-600/50 rounded-2xl shadow-2xl z-[101] flex gap-1 justify-center min-w-[140px] ring-1 ring-black/5 dark:ring-white/5"
                                    >
                                        <div
                                            class="flex flex-col h-48 overflow-y-auto custom-scrollbar pr-1 w-full"
                                        >
                                            {#each HOURS as h}
                                                <button
                                                    onclick={() =>
                                                        (selectedHour = h)}
                                                    class="px-2 py-1.5 rounded-lg text-sm transition-colors {selectedHour ===
                                                    h
                                                        ? 'bg-primary-500 text-white font-bold'
                                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                                    >{h}</button
                                                >
                                            {/each}
                                        </div>
                                        <div
                                            class="w-px bg-zinc-100 dark:bg-zinc-700 my-2"
                                        ></div>
                                        <div
                                            class="flex flex-col h-48 overflow-y-auto custom-scrollbar pl-1 w-full"
                                        >
                                            {#each MINUTES as m}
                                                <button
                                                    onclick={() =>
                                                        (selectedMinute = m)}
                                                    class="px-2 py-1.5 rounded-lg text-sm transition-colors {selectedMinute ===
                                                    m
                                                        ? 'bg-primary-500 text-white font-bold'
                                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                                    >{m}</button
                                                >
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <div
                                class="space-y-2 relative transition-all duration-300 {newRuleWeekday ===
                                '0'
                                    ? 'opacity-100 scale-100'
                                    : 'opacity-0 scale-95 pointer-events-none'}"
                            >
                                <label
                                    for="rule-nth"
                                    class="text-[10px] uppercase font-bold text-zinc-400"
                                    >Welcher Sonntag?</label
                                >
                                <button
                                    id="rule-nth"
                                    onclick={() =>
                                        (nthSundayDropdownOpen =
                                            !nthSundayDropdownOpen)}
                                    class="w-full px-4 py-2.5 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl flex items-center justify-between outline-none focus:ring-2 focus:ring-primary-500 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                    <span
                                        class="font-medium text-zinc-900 dark:text-white"
                                    >
                                        {NTH_OPTIONS.find(
                                            (o) => o.value === newRuleNthSunday,
                                        )?.label}
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        class="text-zinc-400 transition-transform {nthSundayDropdownOpen
                                            ? 'rotate-180'
                                            : ''}"
                                    />
                                </button>
                                {#if nthSundayDropdownOpen}
                                    <div
                                        class="absolute top-full left-0 right-0 mt-2 p-2 bg-white dark:bg-[#0f172a] border border-zinc-200 dark:border-zinc-600/50 rounded-2xl shadow-2xl z-[101] ring-1 ring-black/5 dark:ring-white/5"
                                    >
                                        {#each NTH_OPTIONS as opt}
                                            <button
                                                onclick={() =>
                                                    selectNth(opt.value)}
                                                class="w-full text-left px-3 py-2 rounded-xl text-sm transition-colors {newRuleNthSunday ===
                                                opt.value
                                                    ? 'bg-primary-500 text-white font-bold'
                                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
                                            >
                                                {opt.label}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label
                                for="rule-services"
                                class="text-[10px] uppercase font-bold text-zinc-400"
                                >Dienste & Menge</label
                            >
                            <div class="flex flex-wrap gap-2">
                                {#each SERVICE_TYPES as type}
                                    {@const isSelected =
                                        newRuleAllowed.includes(type.code)}
                                    <div class="flex items-center">
                                        <button
                                            onclick={() =>
                                                toggleRuleService(type.code)}
                                            class="px-3 py-1.5 rounded-l-lg text-xs font-bold border transition-all {isSelected
                                                ? type.color +
                                                  ' border-transparent shadow-[0_4px_12px_-2px_rgba(0,0,0,0.12)] scale-[1.02]'
                                                : 'bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-400 hover:bg-zinc-50'}"
                                            title={type.label}
                                        >
                                            {type.code}
                                        </button>
                                        {#if isSelected}
                                            <input
                                                type="number"
                                                min="1"
                                                class="w-10 px-1 py-1.5 text-[10px] font-bold bg-white dark:bg-zinc-700 border-y border-r border-zinc-200 dark:border-zinc-600 rounded-r-lg outline-none text-center focus:ring-2 focus:ring-primary-500/20"
                                                bind:value={
                                                    newRuleMax[type.code]
                                                }
                                            />
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <button
                            onclick={addRule}
                            disabled={addingRule || newRuleAllowed.length === 0}
                            class="w-full py-4 flex items-center justify-center gap-2 rounded-2xl font-bold transition-all shadow-lg hover:shadow-amber-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none {newRuleAllowed.length >
                            0
                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}"
                        >
                            {#if addingRule}
                                <Loader2 size={20} class="animate-spin" />
                                Wird erstellt...
                            {:else}
                                <Plus size={20} />
                                Regel hinzufügen
                            {/if}
                        </button>
                    </div>
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
</div>
