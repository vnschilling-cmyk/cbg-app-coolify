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
    import {
        Mic,
        MicOff,
        ArrowLeft,
        PlusCircle,
        Mic as MicIcon,
        ListChecks,
    } from "lucide-svelte";

    let { data } = $props();

    interface ProtocolItem {
        id: string;
        meeting_id: string;
        type: string;
        content: string;
        assignee?: string;
        deadline?: string;
        status?: string;
        sort_order: number;
        parent_id?: string;
    }

    // All items state
    let allItems = $state<ProtocolItem[]>([]);

    // Sync allItems with data.items when data changes
    $effect(() => {
        if (data.items) {
            allItems = data.items.map((item: any) => ({ ...item }));
        }
    });

    // Derived: agenda topics (no parent_id) sorted by sort_order
    let agendaTopics = $derived(
        allItems
            .filter((i) => i.type === "agenda" && !i.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order),
    );

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

    onMount(() => {
        setupRealtime();
    });

    onDestroy(() => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    });
</script>

<div
    class="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300"
>
    <!-- Meeting Header -->
    <div
        class="flex-none bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4"
    >
        <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0">
                <a
                    href="/meetings"
                    class="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    title="Zurück"
                >
                    <ArrowLeft size={18} />
                </a>
                <div class="min-w-0">
                    <h1
                        class="text-lg font-bold text-slate-900 dark:text-white truncate"
                    >
                        {data.meeting?.title || "Meeting"}
                    </h1>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
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
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'}"
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
        <div class="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
            <!-- Attendance Panel -->
            <AttendancePanel
                members={data.members || []}
                attendance={data.attendance || []}
                meetingId={data.meeting?.id || ""}
            />

            <!-- Agenda Topics List with DnD -->
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
                        <div animate:flip={{ duration: flipDurationMs }}>
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
                <div class="text-center py-16">
                    <ListChecks
                        size={48}
                        class="mx-auto text-slate-300 dark:text-slate-600 mb-4"
                    />
                    <p class="text-sm text-slate-400 dark:text-slate-500">
                        Noch keine Agenda-Themen. Füge oben das erste Thema
                        hinzu.
                    </p>
                </div>
            {/if}
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
