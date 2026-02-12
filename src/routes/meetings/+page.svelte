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
    } from "lucide-svelte";
    import DatePicker from "$lib/components/DatePicker.svelte";

    let { data } = $props();

    let meetings = $state(data.meetings || []);
    let members = $state(data.members || []);
    let showCreate = $state(false);
    let newTitle = $state("");
    let newDate = $state(new Date().toISOString().split("T")[0]);
    let creating = $state(false);

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

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("de-DE", {
            weekday: "short",
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    }
</script>

<div
    class="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300"
>
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <!-- Page Header -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div
                    class="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center text-white"
                >
                    <ClipboardList size={24} />
                </div>
                <div>
                    <h1
                        class="text-2xl font-bold text-slate-900 dark:text-white"
                    >
                        Meetings
                    </h1>
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                        Protokolle und Beschlüsse verwalten
                    </p>
                </div>
            </div>
            <button
                onclick={() => (showCreate = true)}
                class="btn btn-primary flex items-center gap-2"
            >
                <Plus size={18} />
                <span class="hidden sm:inline">Neues Meeting</span>
            </button>
        </div>

        <!-- Create Meeting Form -->
        {#if showCreate}
            <div
                class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm"
            >
                <h3
                    class="text-sm font-bold text-slate-900 dark:text-white mb-3"
                >
                    Neues Meeting anlegen
                </h3>
                <div class="flex flex-col sm:flex-row gap-3">
                    <input
                        bind:value={newTitle}
                        placeholder="Meeting-Titel..."
                        class="flex-1 px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                        onkeydown={(e) => e.key === "Enter" && createMeeting()}
                    />
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
        {#if meetings.length === 0}
            <div
                class="text-center py-16 bg-white dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700"
            >
                <ClipboardList
                    size={48}
                    class="mx-auto text-slate-300 dark:text-slate-600 mb-4"
                />
                <p class="text-slate-500 dark:text-slate-400 text-sm">
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
                {#each meetings as meeting}
                    <a
                        href="/meetings/{meeting.id}"
                        class="group flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all"
                    >
                        <div
                            class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors"
                        >
                            <ClipboardList size={20} />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3
                                class="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                            >
                                {meeting.title || "Ohne Titel"}
                            </h3>
                            <div
                                class="flex items-center gap-1.5 mt-1 text-xs text-slate-400"
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
                            class="text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors"
                        />
                    </a>
                {/each}
            </div>
        {/if}

        <!-- Member Management -->
        <div
            class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
        >
            <button
                onclick={() => (showMembers = !showMembers)}
                class="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
                <div
                    class="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400"
                >
                    <Users size={16} />
                </div>
                <div class="flex-1 text-left">
                    <h3
                        class="text-sm font-bold text-slate-900 dark:text-white"
                    >
                        Mitglieder verwalten
                    </h3>
                    <p class="text-xs text-slate-400">
                        {members.length} Mitglieder angelegt
                    </p>
                </div>
                <div
                    class="text-slate-400 transition-transform {showMembers
                        ? 'rotate-180'
                        : ''}"
                >
                    <ChevronDown size={18} />
                </div>
            </button>

            {#if showMembers}
                <div
                    class="border-t border-slate-100 dark:border-slate-700/50 px-5 py-4 space-y-3"
                >
                    <!-- Add Member Form -->
                    <div class="flex gap-2">
                        <input
                            bind:value={newMemberName}
                            placeholder="Name..."
                            onkeydown={(e) => e.key === "Enter" && addMember()}
                            class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                        />
                        <input
                            bind:value={newMemberRole}
                            placeholder="Rolle (optional)..."
                            onkeydown={(e) => e.key === "Enter" && addMember()}
                            class="w-40 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
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
                    {#if members.length > 0}
                        <div class="space-y-1.5">
                            {#each members as member}
                                <div
                                    class="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
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
                                            class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate"
                                        >
                                            {member.name}
                                        </p>
                                        {#if member.role}
                                            <p
                                                class="text-[11px] text-slate-400"
                                            >
                                                {member.role}
                                            </p>
                                        {/if}
                                    </div>
                                    <button
                                        onclick={() => deleteMember(member.id)}
                                        class="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                        title="Mitglied entfernen"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-xs text-slate-400 text-center py-2">
                            Füge die Mitglieder des Bruderrats hinzu
                        </p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>
