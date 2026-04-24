<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { invalidateAll } from "$app/navigation";
    import { flip } from "svelte/animate";
    import { pb } from "$lib/pocketbase";
    import { dndzone } from "svelte-dnd-action";
    import AgendaItem from "$lib/components/AgendaItem.svelte";
    import AttendancePanel from "$lib/components/AttendancePanel.svelte";
    import AddTopicModal from "$lib/components/AddTopicModal.svelte";
    import ConfirmationModal from "$lib/components/ConfirmationModal.svelte";
    import { fade } from "svelte/transition";
    import {
        Mic,
        MicOff,
        ArrowLeft,
        PlusCircle,
        Mic as MicIcon,
        ListChecks,
        User,
        BookOpen,
        LogOut,
        RefreshCw,
        ChevronDown,
        Check,
    } from "lucide-svelte";
    import { clickOutside } from "$lib/actions";

    let { data } = $props();

    interface ProtocolItem {
        id: string;
        meeting_id: string;
        type: string;
        content: string;
        note?: string;
        assignee?: string;
        deadline?: string;
        status?: string;
        sort_order: number;
        parent_id?: string;
    }

    // All items state
    let allItems = $state<ProtocolItem[]>([]);
    let currentMeeting = $state(data.meeting || {});

    // Sync state with data
    $effect(() => {
        if (data.items) {
            allItems = data.items.map((item: any) => ({ ...item }));
        }
        if (data.meeting) {
            currentMeeting = { ...data.meeting };
        }
    });

    // Derived: agenda topics (no parent_id) sorted by sort_order
    let agendaTopics = $derived(
        allItems
            .filter((i) => i.type === "agenda" && !i.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order),
    );

    // Derived: prayer items
    let prayerItems = $derived(
        allItems
            .filter((i) => i.type === "prayer")
            .sort((a, b) => a.sort_order - b.sort_order),
    );

    // Derived: items
    let virtualIntroItem = $derived({
        id: "intro-virtual",
        meeting_id: currentMeeting.id,
        type: "beitrag",
        content: "Einleitung & Gebet",
        assignee: (currentMeeting as any).intro_bible_word,
        sort_order: -1,
        isVirtual: true,
        bibleText: (currentMeeting as any).intro_text,
        allowedSubTypes: ["prayer", "beitrag"],
        showPrayerInput: true,
    } as any);

    let virtualClosingItem = $derived({
        id: "closing-virtual",
        meeting_id: currentMeeting.id,
        type: "prayer",
        content: "Schlussgebet",
        assignee: (currentMeeting as any).closing_bible_word,
        sort_order: 9999,
        isVirtual: true,
        bibleText: (currentMeeting as any).closing_text,
        allowedSubTypes: [],
        showPrayerInput: false,
    } as any);

    // Reorderable topics state for dndzone
    let dndTopics = $state<ProtocolItem[]>([]);
    let isReordering = $state(false);

    // Sync dndTopics with agendaTopics, but only when not dragging/reordering
    $effect(() => {
        if (!isReordering) {
            dndTopics = [...agendaTopics];
        }
    });

    // Helper: get children for a given agenda item
    function getChildren(parentId: string): ProtocolItem[] {
        return allItems
            .filter((i) => i.parent_id === parentId)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    // New topic modal state
    let showAddModal = $state(false);

    // Confirm Delete state
    let showDeleteConfirm = $state(false);
    let topicIdToDelete = $state<string | null>(null);

    function requestDeleteTopic(topicId: string) {
        topicIdToDelete = topicId;
        showDeleteConfirm = true;
    }

    async function confirmDeleteTopic() {
        if (!topicIdToDelete) return;
        const topicId = topicIdToDelete;
        const topicChildren = getChildren(topicId);
        showDeleteConfirm = false;

        try {
            for (const child of topicChildren) {
                await pb.collection("protocol_items").delete(child.id);
            }
            await pb.collection("protocol_items").delete(topicId);
        } catch (err: any) {
            const msg = err?.response?.message || err?.message || String(err);
            // We can reuse the ConfirmationModal as an "Alert" by disabling the cancel button
            // or just log it for now. The user mostly complained about the confirmation.
            console.error("Failed to delete topic:", err, err?.response);
        } finally {
            topicIdToDelete = null;
        }
    }

    // DnD for agenda reordering
    const flipDurationMs = 200;

    function handleDndConsider(e: CustomEvent) {
        isReordering = true;
        dndTopics = e.detail.items as ProtocolItem[];
    }

    async function handleDndFinalize(e: CustomEvent) {
        const items = e.detail.items as ProtocolItem[];
        dndTopics = items;

        // 1. Update sort_order locally first to keep agendaTopics stable
        const updatedItems = items.map((it, idx) => ({
            ...it,
            sort_order: idx,
        }));

        // 2. Update global allItems
        const nonAgenda = allItems.filter(
            (i) => i.type !== "agenda" || i.parent_id,
        );
        allItems = [...nonAgenda, ...updatedItems];

        // 3. Persist to PocketBase
        for (let i = 0; i < updatedItems.length; i++) {
            const item = updatedItems[i];
            // Only update if sort_order actually changed relative to what PB might have
            // (Comparing against items[i] from dndzone which has old sort_order)
            if (items[i].sort_order !== i) {
                try {
                    await pb
                        .collection("protocol_items")
                        .update(item.id, { sort_order: i });
                } catch (err) {
                    console.error("Failed to update sort order:", err);
                }
            }
        }

        // 4. End reordering after a small delay to let realtime catch up
        setTimeout(() => {
            isReordering = false;
        }, 800);
    }

    // Audio recording (mocked)
    let isRecording = $state(false);

    function toggleRecording() {
        isRecording = !isRecording;
        console.log(
            isRecording
                ? "🎤 Audioaufzeichnung gestartet"
                : "🎤 Audioaufzeichnung gestoppt",
            "Meeting:",
            data.meeting?.title,
        );
    }

    // PocketBase Realtime
    let unsubscribe: (() => void) | null = null;

    async function setupRealtime() {
        try {
            const unsub = await pb
                .collection("protocol_items")
                .subscribe("*", (e) => {
                    const record = e.record as unknown as ProtocolItem;
                    if (record.meeting_id !== data.meeting?.id) return;

                    if (e.action === "create") {
                        if (!allItems.find((i) => i.id === record.id)) {
                            allItems = [...allItems, record];
                        }
                    } else if (e.action === "update") {
                        // Skip agenda updates while reordering to avoid jumping
                        if (isReordering && record.type === "agenda") return;

                        allItems = allItems.map((i) =>
                            i.id === record.id ? record : i,
                        );
                    } else if (e.action === "delete") {
                        allItems = allItems.filter((i) => i.id !== record.id);
                    }
                });
            unsubscribe = unsub;
        } catch (err) {
            console.error("Failed to setup realtime:", err);
        }
    }

    // Role state
    let activeRoleDropdown = $state<string | null>(null);

    async function updateMeetingRole(roleField: string, memberId: string) {
        try {
            // Optimistic update
            (currentMeeting as any)[roleField] = memberId || null;

            const updateData = { [roleField]: memberId || null };
            await pb
                .collection("meetings")
                .update(currentMeeting.id, updateData);
            activeRoleDropdown = null;
        } catch (err) {
            console.error(`Failed to update role ${roleField}:`, err);
        }
    }

    async function updateMeetingField(field: string, value: string) {
        try {
            (currentMeeting as any)[field] = value; // Optimistic update
            await pb
                .collection("meetings")
                .update(currentMeeting.id, { [field]: value });
        } catch (err) {
            console.error(`Failed to update field ${field}:`, err);
        }
    }

    // CT Sync State
    // CT Sync State
    let syncing = $state(false);
    let syncMessage = $state("");

    async function syncWithChurchTools() {
        syncing = true;
        syncMessage = "Suche Veranstaltung...";
        try {
            const response = await fetch("/api/meetings/sync-ct", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meetingId: currentMeeting.id,
                }),
            });

            const result = await response.json();
            if (result.success) {
                syncMessage = result.message;
                // Immediately update local state with returned updates
                if (result.updates) {
                    console.log("[UI] Sync updates received:", result.updates);
                    // Update properties individually to ensure reactivity
                    for (const [key, value] of Object.entries(result.updates)) {
                        (currentMeeting as any)[key] = value;
                    }
                    console.log(
                        "[UI] currentMeeting after update:",
                        JSON.parse(JSON.stringify(currentMeeting)),
                    );

                    // Force a re-assignment to verify reactivity trigger
                    currentMeeting = { ...currentMeeting };
                }

                // Force data reload from server to ensure full consistency
                await invalidateAll();

                // Wait a bit then clear message
                setTimeout(() => (syncMessage = ""), 5000);
            } else {
                syncMessage = `Fehler: ${result.error || result.message || "Unbekannter Fehler"}`;
            }
        } catch (err) {
            console.error("Failed to sync with ChurchTools:", err);
            syncMessage = "Verbindung zum Server fehlgeschlagen.";
        } finally {
            syncing = false;
        }
    }

    async function handleUpdateIntroBibleText(text: string) {
        await updateMeetingField("intro_text", text);
    }

    async function handleUpdateClosingBibleText(text: string) {
        await updateMeetingField("closing_text", text);
    }

    async function handleUpdateIntroSpeaker(speakerId: string) {
        await updateMeetingRole("intro_bible_word", speakerId);
    }

    async function handleUpdateClosingSpeaker(speakerId: string) {
        await updateMeetingRole("closing_bible_word", speakerId);
    }

    onMount(() => {
        setupRealtime();
        // Also subscribe to meeting updates
        pb.collection("meetings").subscribe(currentMeeting.id, (e) => {
            if (e.action === "update") {
                currentMeeting = { ...e.record };
            }
        });
    });

    onDestroy(() => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        pb.collection("meetings").unsubscribe(currentMeeting.id);
    });
</script>

<div
    class="h-full flex flex-col overflow-hidden transition-colors duration-300"
>
    <!-- Meeting Header -->
    <div
        class="flex-none bg-zinc-50/80 dark:bg-zinc-800/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-700 px-4 sm:px-6 py-4"
    >
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0">
                <a
                    href="/meetings"
                    class="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    title="Zurück"
                >
                    <ArrowLeft size={18} />
                </a>
                <div class="min-w-0">
                    <h1
                        class="text-lg font-bold text-zinc-900 dark:text-white truncate"
                    >
                        {data.meeting?.title || "Meeting"}
                    </h1>
                    <p class="text-xs text-zinc-500 dark:text-zinc-400">
                        {agendaTopics.length} Themen • {allItems.length -
                            agendaTopics.length} Ergebnisse
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <button
                    onclick={() => (showAddModal = true)}
                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-primary-600 text-white hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                >
                    <PlusCircle size={18} />
                    <span class="hidden sm:inline">Thema erstellen</span>
                </button>

                <button
                    onclick={toggleRecording}
                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all {isRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25 animate-pulse'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700'}"
                >
                    {#if isRecording}
                        <MicOff size={18} />
                        <span class="hidden sm:inline">Aufnahme stoppen</span>
                    {:else}
                        <MicIcon size={18} />
                        <span class="hidden sm:inline"
                            >Aufzeichnung starten</span
                        >
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- Agenda Content -->
    <div class="flex-1 overflow-y-auto">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <!-- ChurchTools Sync & Roles -->
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div
                    class="lg:col-span-1 bg-white dark:bg-zinc-800/80 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm space-y-3"
                >
                    <div class="flex items-center justify-between">
                        <div
                            class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                        >
                            <RefreshCw
                                size={12}
                                class={syncing ? "animate-spin" : ""}
                            />
                            ChurchTools Sync
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button
                            onclick={syncWithChurchTools}
                            disabled={syncing}
                            class="w-full py-2.5 px-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
                        >
                            <RefreshCw
                                size={14}
                                class={syncing ? "animate-spin" : ""}
                            />
                            {syncing ? "Sync..." : "CT Synchronisieren"}
                        </button>
                    </div>
                    {#if syncMessage}
                        <p
                            class="text-[9px] font-bold {syncMessage.includes(
                                'Fehler',
                            )
                                ? 'text-red-500'
                                : 'text-emerald-600 dark:text-emerald-400'} leading-tight"
                            in:fade
                        >
                            {syncMessage}
                        </p>
                    {/if}
                </div>

                <div class="lg:col-span-1">
                    <div
                        class="bg-white dark:bg-zinc-800/80 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm space-y-2"
                    >
                        <div
                            class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400"
                        >
                            <User size={12} />
                            Moderator
                        </div>
                        <div class="relative">
                            <button
                                onclick={() =>
                                    (activeRoleDropdown =
                                        activeRoleDropdown === "moderator"
                                            ? null
                                            : "moderator")}
                                class="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-700 border border-zinc-100 dark:border-zinc-600 rounded-xl text-sm font-bold transition-all hover:border-primary-500/50"
                            >
                                <span class="truncate">
                                    {data.members?.find(
                                        (m) =>
                                            m.id ===
                                            (currentMeeting as any)[
                                                "moderator"
                                            ],
                                    )?.name || "Nicht zugewiesen"}
                                </span>
                                <ChevronDown size={14} class="text-zinc-400" />
                            </button>

                            {#if activeRoleDropdown === "moderator"}
                                <div
                                    class="absolute left-0 top-full mt-2 w-full bg-white dark:bg-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-600 shadow-xl z-50 py-1 overflow-hidden"
                                    in:fade={{ duration: 150 }}
                                    use:clickOutside={() =>
                                        (activeRoleDropdown = null)}
                                >
                                    <button
                                        onclick={() =>
                                            updateMeetingRole("moderator", "")}
                                        class="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {!(
                                            currentMeeting as any
                                        )['moderator']
                                            ? 'text-primary-600'
                                            : 'text-zinc-600'}"
                                    >
                                        <span>Keiner</span>
                                        {#if !(currentMeeting as any)["moderator"]}<Check
                                                size={12}
                                            />{/if}
                                    </button>
                                    {#each data.members as member}
                                        <button
                                            onclick={() =>
                                                updateMeetingRole(
                                                    "moderator",
                                                    member.id,
                                                )}
                                            class="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {(
                                                currentMeeting as any
                                            )['moderator'] === member.id
                                                ? 'text-primary-600 font-bold'
                                                : 'text-zinc-600'}"
                                        >
                                            <span>{member.name}</span>
                                            {#if (currentMeeting as any)["moderator"] === member.id}<Check
                                                    size={12}
                                                />{/if}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-4">
                    <!-- Attendance Panel -->
                    <AttendancePanel
                        members={data.members || []}
                        attendance={data.attendance || []}
                        meetingId={data.meeting?.id || ""}
                    />

                    <!-- Agenda Topics List with DnD -->
                    <div class="space-y-3 pb-20">
                        <!-- Intro Virtual Item -->
                        <div class="relative z-20">
                            <AgendaItem
                                item={virtualIntroItem}
                                children={prayerItems}
                                meetingId={data.meeting?.id || ""}
                                topicNumber={undefined}
                                members={data.members || []}
                                isVirtual={true}
                                onChangeSpeaker={handleUpdateIntroSpeaker}
                                allowedSubTypes={virtualIntroItem.allowedSubTypes}
                                bibleText={virtualIntroItem.bibleText}
                                onUpdateBibleText={handleUpdateIntroBibleText}
                                showPrayerInput={virtualIntroItem.showPrayerInput}
                            />
                        </div>

                        {#if dndTopics.length > 0}
                            <div
                                class="space-y-3"
                                use:dndzone={{
                                    items: dndTopics,
                                    flipDurationMs,
                                    type: "agenda-topics",
                                    dragHandleSelector: ".drag-handle",
                                    dropTargetStyle: {},
                                    dropTargetClasses: [
                                        "!border-primary-300",
                                        "dark:!border-primary-700",
                                        "!border-dashed",
                                        "rounded-2xl",
                                    ],
                                } as any}
                                onconsider={handleDndConsider}
                                onfinalize={handleDndFinalize}
                            >
                                {#each dndTopics as topic, i (topic.id)}
                                    <div
                                        animate:flip={{
                                            duration: flipDurationMs,
                                        }}
                                    >
                                        <AgendaItem
                                            item={topic}
                                            children={getChildren(topic.id)}
                                            meetingId={data.meeting?.id || ""}
                                            topicNumber={i + 1}
                                            ondelete={requestDeleteTopic}
                                            members={data.members}
                                        />
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div
                                class="text-center py-16 bg-white dark:bg-zinc-800/50 rounded-3xl border border-zinc-200 dark:border-zinc-700/50"
                            >
                                <ListChecks
                                    size={48}
                                    class="mx-auto text-zinc-300 dark:text-zinc-600 mb-4"
                                />
                                <p
                                    class="text-sm text-zinc-400 dark:text-zinc-500"
                                >
                                    Noch keine Agenda-Themen. Füge oben das
                                    erste Thema hinzu.
                                </p>
                            </div>
                        {/if}

                        <!-- Closing Virtual Item -->
                        <div class="relative z-20">
                            <AgendaItem
                                item={virtualClosingItem}
                                children={[]}
                                meetingId={data.meeting?.id || ""}
                                topicNumber={undefined}
                                members={data.members || []}
                                isVirtual={true}
                                onChangeSpeaker={handleUpdateClosingSpeaker}
                                allowedSubTypes={virtualClosingItem.allowedSubTypes}
                                bibleText={virtualClosingItem.bibleText}
                                onUpdateBibleText={handleUpdateClosingBibleText}
                                showPrayerInput={virtualClosingItem.showPrayerInput}
                            />
                        </div>
                    </div>
                </div>

                <!-- Sidebar (Removed PrayerPanel) -->
                <!-- <div class="space-y-6"></div> -->
            </div>
        </div>
    </div>
</div>

<AddTopicModal
    open={showAddModal}
    onClose={() => (showAddModal = false)}
    meetingId={data.meeting?.id || ""}
    members={data.members || []}
    lastSortOrder={agendaTopics.length > 0
        ? agendaTopics[agendaTopics.length - 1].sort_order
        : -1}
/>

<ConfirmationModal
    open={showDeleteConfirm}
    title="Thema löschen?"
    message="Bist du sicher? Das Thema und alle zugehörigen Unterpunkte werden unwiderruflich gelöscht."
    confirmLabel="Löschen"
    onConfirm={confirmDeleteTopic}
    onClose={() => (showDeleteConfirm = false)}
/>
