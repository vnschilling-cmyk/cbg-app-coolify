<script lang="ts">
    import { pb } from "$lib/pocketbase";
    import {
        ClipboardList,
        Plus,
        Calendar,
        ChevronRight,
        Users,
        UserPlus,
        Trash2,
        ChevronDown,
        ArrowLeft,
    } from "lucide-svelte";
    import DatePicker from "$lib/components/DatePicker.svelte";
    import { user } from "$lib/pocketbase";

    let { data } = $props();

    let meetings = $state<any[]>([]);
    let members = $state<any[]>([]);
    let showCreate = $state(false);
    let newTitle = $state("");
    let newDate = $state(new Date().toISOString().split("T")[0]);
    let creating = $state(false);
    let newMeetingGroupId = $state("");

    $effect(() => {
        meetings = data.meetings || [];
        members = data.members || [];
    });

    $effect(() => {
        if (showCreate && !newMeetingGroupId) {
            newMeetingGroupId = selectedGroupId;
        }
    });

    // Member management
    let showMembers = $state(false);
    let newMemberName = $state("");
    let newMemberRole = $state("");
    let addingMember = $state(false);

    async function createMeeting() {
        if (!newTitle.trim()) return;
        creating = true;
        try {
            // 1. Create the meeting
            const meeting = await pb.collection("meetings").create({
                title: newTitle.trim(),
                date: newDate,
                group: newMeetingGroupId,
            });

            // 2. Automigration for "Bruderrat" meetings
            if (newTitle.toLowerCase().includes("bruderrat")) {
                try {
                    // Find topics postponed exactly to this date
                    const searchDate = newDate.split("T")[0];
                    // We search for status = "verschoben" and deadline starting with the date
                    const postponedTopics = await pb
                        .collection("protocol_items")
                        .getFullList({
                            filter: `status = "verschoben" && deadline ~ "${searchDate}%"`,
                        });

                    if (postponedTopics.length > 0) {
                        // Move them to the new meeting
                        for (let i = 0; i < postponedTopics.length; i++) {
                            const topic = postponedTopics[i];
                            await pb.collection("protocol_items").create({
                                meeting_id: meeting.id,
                                type: "agenda",
                                content: topic.content,
                                assignee: topic.assignee || "",
                                status: "offen",
                                sort_order: i,
                            });
                        }
                    }
                } catch (migrationErr) {
                    console.error(
                        "Migration during meeting creation failed:",
                        migrationErr,
                    );
                }
            }

            meetings = [meeting, ...meetings];
            newTitle = "";
            showCreate = false;
        } catch (err) {
            console.error("Failed to create meeting:", err);
        } finally {
            creating = false;
        }
    }

    async function addMember() {
        if (!newMemberName.trim()) return;
        addingMember = true;
        try {
            const member = await pb.collection("members").create({
                name: newMemberName.trim(),
                role: newMemberRole.trim() || undefined,
                group: selectedGroupId,
            });
            members = [...members, member];
            newMemberName = "";
            newMemberRole = "";
        } catch (err) {
            console.error("Failed to create member:", err);
        } finally {
            addingMember = false;
        }
    }

    async function deleteMember(id: string) {
        try {
            await pb.collection("members").delete(id);
            members = members.filter((m: any) => m.id !== id);
        } catch (err) {
            console.error("Failed to delete member:", err);
        }
    }

    // Group Context
    let allGroups = $state<any[]>([]);

    $effect(() => {
        allGroups = data.groups || [];
    });

    // Combine server-side userGroups with client-side store for maximum reliability
    let userGroups = $derived.by(() => {
        const storeGroups = $user?.groups
            ? Array.isArray($user.groups)
                ? $user.groups
                : [$user.groups]
            : [];
        const serverGroups = data.userGroups || [];
        // Unique IDs from both sources
        return [...new Set([...storeGroups, ...serverGroups])];
    });

    let selectedGroupId = $state(""); // Empty means overview

    // Filtered Data
    let filteredMeetings = $state<any[]>([]);
    let filteredMembers = $state<any[]>([]);

    $effect(() => {
        if (selectedGroupId) {
            filteredMeetings = meetings.filter(
                (m) => m.group === selectedGroupId || !m.group,
            );
            filteredMembers = members.filter(
                (m) => m.group === selectedGroupId,
            );
        } else {
            filteredMeetings = [];
            filteredMembers = [];
        }
    });

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    }
</script>

<div class="h-full overflow-y-auto transition-colors duration-300">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <!-- Page Header -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                {#if selectedGroupId}
                    <button
                        onclick={() => (selectedGroupId = "")}
                        class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                {/if}
                <div
                    class="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white"
                >
                    <ClipboardList size={24} />
                </div>
                <div>
                    <h1
                        class="text-2xl font-bold text-zinc-900 dark:text-white"
                    >
                        {#if selectedGroupId}
                            {allGroups.find((g) => g.id === selectedGroupId)
                                ?.name || "Lädt..."}
                        {:else}
                            Meetings
                        {/if}
                    </h1>
                    <p class="text-sm text-zinc-500 dark:text-zinc-400">
                        {selectedGroupId
                            ? "Protokolle und Beschlüsse dieser Gruppe"
                            : "Protokolle und Beschlüsse verwalten"}
                    </p>
                </div>
            </div>

            {#if selectedGroupId}
                <button
                    onclick={() => (showCreate = true)}
                    class="btn btn-primary flex items-center gap-2"
                >
                    <Plus size={18} />
                    <span class="hidden sm:inline">Neues Meeting</span>
                </button>
            {/if}
        </div>

        {#if !selectedGroupId}
            <!-- Group Tiles Overview -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto py-4"
            >
                {#each allGroups as group}
                    {@const isMember = userGroups.includes(group.id)}
                    <button
                        onclick={() => isMember && (selectedGroupId = group.id)}
                        disabled={!isMember}
                        class="group relative overflow-hidden bg-white dark:bg-zinc-700 rounded-3xl p-8 shadow-xl border border-zinc-200 dark:border-zinc-600 transition-all duration-300 flex flex-col items-center justify-center text-center gap-6 h-80 {isMember
                            ? 'hover:shadow-2xl hover:shadow-primary-600/10 hover:-translate-y-2 cursor-pointer'
                            : 'opacity-60 grayscale cursor-not-allowed'}"
                    >
                        {#if isMember}
                            <div
                                class="absolute inset-0 bg-gradient-to-br from-primary-50 to-transparent dark:from-primary-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            ></div>
                        {/if}

                        <div
                            style="color: {group.color || '#4f46e5'}"
                            class="w-24 h-24 rounded-full bg-zinc-50 dark:bg-zinc-700 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300 relative z-10 shadow-sm"
                        >
                            <Users size={48} />
                        </div>

                        <div class="relative z-10">
                            <h2
                                class="text-3xl font-black text-zinc-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                            >
                                {group.name}
                            </h2>
                            <p
                                class="text-zinc-500 dark:text-zinc-400 font-medium"
                            >
                                {isMember
                                    ? "Protokolle & Mitglieder"
                                    : "Kein Zugriff für dich"}
                            </p>
                        </div>
                    </button>
                {/each}
            </div>
        {:else}
            <!-- Create Meeting Form -->
            {#if showCreate}
                <div
                    class="p-5 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-sm"
                >
                    <h3
                        class="text-sm font-bold text-zinc-900 dark:text-white mb-3"
                    >
                        Neues Meeting anlegen
                    </h3>
                    <div class="flex flex-col sm:flex-row gap-3">
                        <input
                            bind:value={newTitle}
                            placeholder="Meeting-Titel..."
                            class="flex-1 px-4 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
                            onkeydown={(e) =>
                                e.key === "Enter" && createMeeting()}
                        />
                        <div class="relative min-w-[140px]">
                            <select
                                bind:value={newMeetingGroupId}
                                class="w-full px-4 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200 appearance-none"
                            >
                                {#each userGroups as group}
                                    <option value={group.id}
                                        >{group.name}</option
                                    >
                                {/each}
                            </select>
                            <div
                                class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400"
                            >
                                <ChevronDown size={14} />
                            </div>
                        </div>
                        <DatePicker
                            value={newDate}
                            onchange={(val) => (newDate = val)}
                        />
                        <div class="flex gap-2">
                            <button
                                onclick={createMeeting}
                                disabled={creating || !newTitle.trim()}
                                class="btn btn-primary text-sm"
                            >
                                {creating ? "Erstellt..." : "Erstellen"}
                            </button>
                            <button
                                onclick={() => (showCreate = false)}
                                class="btn btn-secondary text-sm"
                            >
                                Abbrechen
                            </button>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Meetings List -->
            {#if filteredMeetings.length === 0}
                <div
                    class="text-center py-16 bg-white dark:bg-zinc-700/50 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-600"
                >
                    <ClipboardList
                        size={48}
                        class="mx-auto text-zinc-300 dark:text-zinc-600 mb-4"
                    />
                    <p class="text-zinc-500 dark:text-zinc-400 text-sm">
                        Noch keine Meetings vorhanden
                    </p>
                    <button
                        onclick={() => (showCreate = true)}
                        class="mt-4 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                    >
                        Erstes Meeting anlegen →
                    </button>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each filteredMeetings as meeting}
                        <a
                            href="/meetings/{meeting.id}"
                            class="group flex items-center gap-4 p-4 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all"
                        >
                            <div
                                class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors"
                            >
                                <ClipboardList size={20} />
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3
                                    class="text-sm font-bold text-zinc-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                                >
                                    {meeting.title || "Ohne Titel"}
                                </h3>
                                <div
                                    class="flex items-center gap-1.5 mt-1 text-xs text-zinc-400"
                                >
                                    <Calendar size={12} />
                                    <span>
                                        {formatDate(
                                            meeting.date || meeting.created,
                                        )}
                                    </span>
                                </div>
                            </div>
                            <ChevronRight
                                size={18}
                                class="text-zinc-300 dark:text-zinc-600 group-hover:text-primary-500 transition-colors"
                            />
                        </a>
                    {/each}
                </div>
            {/if}

            <!-- Member Management -->
            <div
                class="bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-sm overflow-hidden"
            >
                <button
                    onclick={() => (showMembers = !showMembers)}
                    class="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
                >
                    <div
                        class="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400"
                    >
                        <Users size={16} />
                    </div>
                    <div class="flex-1 text-left">
                        <h3
                            class="text-sm font-bold text-zinc-900 dark:text-white"
                        >
                            Mitglieder verwalten
                        </h3>
                        <p class="text-xs text-zinc-400">
                            {filteredMembers.length} Mitglieder angelegt
                        </p>
                    </div>
                    <div
                        class="text-zinc-400 transition-transform {showMembers
                            ? 'rotate-180'
                            : ''}"
                    >
                        <ChevronDown size={18} />
                    </div>
                </button>

                {#if showMembers}
                    <div
                        class="border-t border-zinc-100 dark:border-zinc-700/50 px-5 py-4 space-y-3"
                    >
                        <!-- Add Member Form -->
                        <div class="flex gap-2">
                            <input
                                bind:value={newMemberName}
                                placeholder="Name..."
                                onkeydown={(e) =>
                                    e.key === "Enter" && addMember()}
                                class="flex-1 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
                            />
                            <input
                                bind:value={newMemberRole}
                                placeholder="Rolle (optional)..."
                                onkeydown={(e) =>
                                    e.key === "Enter" && addMember()}
                                class="w-40 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
                            />
                            <button
                                onclick={addMember}
                                disabled={addingMember || !newMemberName.trim()}
                                class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-all"
                            >
                                <UserPlus size={14} />
                            </button>
                        </div>

                        <!-- Members List -->
                        {#if filteredMembers.length > 0}
                            <div class="space-y-1.5">
                                {#each filteredMembers as member}
                                    <div
                                        class="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
                                    >
                                        <div
                                            class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 text-xs font-bold"
                                        >
                                            {member.name
                                                ?.split(" ")
                                                .map((n: string) => n[0])
                                                .join("")
                                                .toUpperCase()
                                                .slice(0, 2)}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p
                                                class="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate"
                                            >
                                                {member.name}
                                            </p>
                                            {#if member.role}
                                                <p
                                                    class="text-[11px] text-zinc-400"
                                                >
                                                    {member.role}
                                                </p>
                                            {/if}
                                        </div>
                                        <button
                                            onclick={() =>
                                                deleteMember(member.id)}
                                            class="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                            title="Mitglied entfernen"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="text-xs text-zinc-400 text-center py-2">
                                Füge die Mitglieder des Bruderrats hinzu
                            </p>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
