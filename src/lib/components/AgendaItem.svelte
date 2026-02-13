<script lang="ts">
    import { pb } from "$lib/pocketbase";
    import {
        ChevronDown,
        Vote,
        Lightbulb,
        ClipboardCheck,
        CalendarClock,
        Plus,
        GripVertical,
        User,
        CalendarDays,
        Trash2,
        Pencil,
        Check,
        X,
        MessageSquare,
        ChevronRight,
    } from "lucide-svelte";
    import { categories, tags } from "$lib/constants";
    import { fade, slide, scale } from "svelte/transition";
    import { clickOutside } from "$lib/actions";
    import DatePicker from "./DatePicker.svelte";
    import ConfirmationModal from "./ConfirmationModal.svelte";

    interface ProtocolItem {
        id: string;
        meeting_id: string;
        type: string;
        content: string;
        assignee?: string;
        deadline?: string;
        status?: string;
        category?: string;
        tag?: string;
        sort_order: number;
        parent_id?: string;
    }

    interface Member {
        id: string;
        name: string;
        role?: string;
    }

    interface Props {
        item: ProtocolItem;
        children: ProtocolItem[];
        meetingId: string;
        topicNumber: number;
        members: Member[];
        ondelete?: (id: string) => void;
    }

    let { item, children, meetingId, topicNumber, members, ondelete }: Props =
        $props();

    // Auto-collapse if status is 'besprochen' or 'verschoben', otherwise expand
    let expanded = $state(!item.status || item.status === "offen");
    let showAddForm = $state(false);
    let addType = $state<string>("beitrag");
    let newContent = $state("");
    let newAssignee = $state("");
    let newAssignees = $state<string[]>([]);
    let newDeadline = $state("");
    let adding = $state(false);

    // Child editing state
    let editingChildId = $state<string | null>(null);
    let editChildContent = $state("");
    let editChildAssignee = $state("");
    let editChildAssignees = $state<string[]>([]);
    let editChildDeadline = $state("");
    let savingChild = $state(false);

    const statuses = [
        {
            id: "offen",
            label: "Offen",
            color: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-700/50 dark:text-zinc-400 dark:border-zinc-600",
            numColor: "bg-primary-600 shadow-primary-500/30",
        },
        {
            id: "besprochen",
            label: "Besprochen",
            color: "bg-emerald-500 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500",
            numColor: "bg-emerald-600 shadow-emerald-500/30",
        },
        {
            id: "verschoben",
            label: "Vertagt",
            color: "bg-amber-500 text-white border-amber-600 dark:bg-amber-600 dark:border-amber-500",
            numColor: "bg-amber-600 shadow-amber-500/30",
        },
    ];

    function getStatus(id: string) {
        return statuses.find((s) => s.id === id) || statuses[0];
    }

    let displayedStatus = $state(item.status || "offen");
    let displayedDeadline = $state(item.deadline || "");
    let displayedSpeaker = $state(item.assignee || "");
    let displayedCategory = $state(item.category || "");
    let displayedTag = $state(item.tag || "");

    // Keep state in sync with props from server
    $effect(() => {
        displayedStatus = item.status || "offen";
        displayedDeadline = item.deadline || "";
        displayedSpeaker = item.assignee || "";
        displayedCategory = item.category || "";
        displayedTag = item.tag || "";
    });

    let statusInfo = $derived(getStatus(displayedStatus));

    // Menu states
    let showSpeakerMenu = $state(false);
    let showAddSpeakerMenu = $state(false);
    let showEditChildSpeakerMenu = $state(false);
    let showStatusMenu = $state(false);
    let showCategoryMenu = $state(false);
    let showTagMenu = $state(false);

    // Confirm Delete state
    let showDeleteConfirm = $state(false);
    let itemIdToDelete = $state<string | null>(null);

    function requestDeleteItem(id: string) {
        itemIdToDelete = id;
        showDeleteConfirm = true;
    }

    async function confirmDeleteItem() {
        if (!itemIdToDelete) return;
        const id = itemIdToDelete;
        showDeleteConfirm = false;
        try {
            await pb.collection("protocol_items").delete(id);
        } catch (err: any) {
            console.error("Failed to delete item:", err, err?.response);
        } finally {
            itemIdToDelete = null;
        }
    }

    // Inline editing state
    let editing = $state(false);
    let editContent = $state("");

    const subTypes = [
        {
            type: "beitrag",
            label: "Beitrag",
            icon: MessageSquare,
            color: "bg-zinc-100 dark:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300",
            badgeColor: "bg-zinc-500",
            hoverColor: "hover:bg-zinc-50 dark:hover:bg-zinc-700/30",
            borderColor: "border-zinc-200 dark:border-zinc-600",
        },
        {
            type: "beschluss",
            label: "Beschluss",
            icon: Vote,
            color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
            badgeColor: "bg-emerald-500",
            hoverColor: "hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
            borderColor: "border-emerald-200 dark:border-emerald-800",
        },
        {
            type: "aufgabe",
            label: "Aufgabe",
            icon: ClipboardCheck,
            color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
            badgeColor: "bg-blue-500",
            hoverColor: "hover:bg-blue-50 dark:hover:bg-blue-900/20",
            borderColor: "border-blue-200 dark:border-blue-800",
        },
    ];

    function getSubType(type: string) {
        return subTypes.find((t) => t.type === type);
    }

    function getCategory(id: string) {
        return categories.find((c) => c.id === id);
    }

    function getTag(id: string) {
        return tags.find((t) => t.id === id);
    }

    // Start inline editing
    function startEditing() {
        editContent = item.content;
        editing = true;
    }

    // Save edited title
    async function saveEdit() {
        if (!editContent.trim()) return;
        try {
            await pb
                .collection("protocol_items")
                .update(item.id, { content: editContent.trim() });
            editing = false;
        } catch (err) {
            console.error("Failed to update topic:", err);
        }
    }

    function cancelEdit() {
        editing = false;
        editContent = "";
    }

    function handleEditKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            saveEdit();
        } else if (e.key === "Escape") {
            cancelEdit();
        }
    }

    async function addSubItem() {
        if (!newContent.trim()) return;
        adding = true;
        try {
            const data: any = {
                meeting_id: meetingId,
                type: addType,
                content: newContent.trim(),
                parent_id: item.id,
                sort_order: children.length,
            };

            // Discussion points and tasks can have a speaker/assignee
            if (addType === "beitrag") {
                if (newAssignee.trim()) data.assignee = newAssignee.trim();
            } else if (addType === "aufgabe") {
                if (newAssignees.length > 0)
                    data.assignee = newAssignees.join(", ");
                if (newDeadline) data.deadline = newDeadline;
            }

            await pb.collection("protocol_items").create(data);
            newContent = "";
            newAssignee = "";
            newAssignees = [];
            newDeadline = "";
            showAddForm = false;
        } catch (err) {
            console.error("Failed to create sub-item:", err);
        } finally {
            adding = false;
        }
    }

    async function updateTopicStatus(status: string) {
        try {
            displayedStatus = status; // Optimistic update
            const data: any = { status };
            // Clear deadline if it's no longer postponed. Use null for DateTime fields in PB.
            if (status !== "verschoben") {
                data.deadline = null;
                displayedDeadline = ""; // Optimistic
            }
            await pb.collection("protocol_items").update(item.id, data);
            showStatusMenu = false;

            // Auto-collapse if status is no longer "offen"
            if (status !== "offen") {
                expanded = false;
            }
        } catch (err: any) {
            displayedStatus = item.status || "offen"; // Revert on failure
            displayedDeadline = item.deadline || "";
            const msg = err?.response?.message || err?.message || String(err);
            const detail = JSON.stringify(err?.response?.data || {});
            alert(
                `Status-Update fehlgeschlagen: ${msg}\nDetails: ${detail}\n\nHinweis: Hast du die Änderungen in PocketBase mit dem "Save changes" Button (unten rechts) bestätigt?`,
            );
            console.error("Failed to update topic status:", err, err?.response);
        }
    }

    async function updateTopicCategory(categoryId: string) {
        try {
            displayedCategory = categoryId;
            await pb
                .collection("protocol_items")
                .update(item.id, { category: categoryId });
            showCategoryMenu = false;
        } catch (err) {
            displayedCategory = item.category || "";
            console.error("Failed to update topic category:", err);
        }
    }

    async function updateTopicTag(tagId: string) {
        try {
            displayedTag = tagId;
            await pb
                .collection("protocol_items")
                .update(item.id, { tag: tagId });
            showTagMenu = false;
        } catch (err) {
            displayedTag = item.tag || "";
            console.error("Failed to update topic tag:", err);
        }
    }

    async function updateTopicDeadline(deadline: string) {
        try {
            displayedDeadline = deadline; // Optimistic update
            // If deadline is empty, send null to clear the field in PB
            const value = deadline || null;
            await pb
                .collection("protocol_items")
                .update(item.id, { deadline: value });
        } catch (err: any) {
            displayedDeadline = item.deadline || ""; // Revert
            const msg = err?.response?.message || err?.message || String(err);
            alert(`Datum-Update fehlgeschlagen: ${msg}`);
            console.error("Failed to update topic deadline:", err);
        }
    }

    async function updateTopicSpeaker(speaker: string) {
        try {
            displayedSpeaker = speaker; // Optimistic
            await pb
                .collection("protocol_items")
                .update(item.id, { assignee: speaker || "" });
            showSpeakerMenu = false;
        } catch (err: any) {
            displayedSpeaker = item.assignee || ""; // Revert
            const msg = err?.response?.message || err?.message || String(err);
            alert(`Sprecher-Update fehlgeschlagen: ${msg}`);
            console.error("Failed to update topic speaker:", err);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addSubItem();
        } else if (e.key === "Escape") {
            showAddForm = false;
            newContent = "";
        }
    }

    function formatDeadline(dateStr: string): string {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "short",
        });
    }

    function getInitials(name: string): string {
        if (!name) return "";
        return name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .toUpperCase()
            .substring(0, 3);
    }

    function startEditingChild(child: any) {
        editingChildId = child.id;
        editChildContent = child.content;
        editChildDeadline = child.deadline || "";
        if (child.type === "aufgabe") {
            editChildAssignees = child.assignee
                ? child.assignee.split(", ")
                : [];
            editChildAssignee = "";
        } else {
            editChildAssignee = child.assignee || "";
            editChildAssignees = [];
        }
    }

    function cancelChildEdit() {
        editingChildId = null;
        editChildContent = "";
        editChildAssignee = "";
        editChildAssignees = [];
        editChildDeadline = "";
    }

    async function saveChildEdit(child: any) {
        if (!editChildContent.trim()) return;
        savingChild = true;
        try {
            const data: any = {
                content: editChildContent.trim(),
            };

            if (child.type === "beitrag") {
                data.assignee = editChildAssignee;
            } else if (child.type === "aufgabe") {
                data.assignee = editChildAssignees.join(", ");
                data.deadline = editChildDeadline || null;
            }

            await pb.collection("protocol_items").update(child.id, data);
            editingChildId = null;
        } catch (err) {
            console.error("Failed to update child item:", err);
            alert("Fehler beim Speichern der Änderung.");
        } finally {
            savingChild = false;
        }
    }

    function startAdd(type: string) {
        addType = type;
        showAddForm = true;
        newContent = "";
        newAssignee = "";
        newDeadline = "";
    }
</script>

<div
    class="bg-white/90 dark:bg-zinc-700/60 backdrop-blur-md rounded-2xl border border-zinc-200/60 dark:border-zinc-600/50 shadow-sm hover:shadow-xl hover:shadow-primary-500/10 dark:hover:shadow-primary-900/20 overflow-visible relative group/card {showSpeakerMenu ||
    showAddSpeakerMenu ||
    showStatusMenu
        ? 'z-50'
        : 'z-10'}"
>
    <div
        class="flex items-center gap-3 px-5 py-5 group transition-colors rounded-t-2xl {expanded
            ? ''
            : 'rounded-b-2xl'} {displayedStatus === 'besprochen'
            ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
            : displayedStatus === 'verschoben'
              ? 'bg-amber-50/50 dark:bg-amber-900/10'
              : displayedStatus === 'offen'
                ? 'bg-zinc-100/50 dark:bg-zinc-700/10'
                : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-700/20'} relative {showSpeakerMenu ||
        showStatusMenu
            ? 'z-20'
            : 'z-auto'}"
    >
        <div
            class="drag-handle opacity-20 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing hover:text-primary-500 p-1 -ml-1"
        >
            <GripVertical size={18} />
        </div>

        <!-- Topic Number -->
        <span
            class="flex items-center justify-center w-8 h-8 rounded-xl {statusInfo.numColor} text-white text-xs font-bold flex-shrink-0 shadow-lg transition-colors duration-500"
        >
            {topicNumber}
        </span>

        <div class="flex-1 min-w-0 ml-1 flex flex-col gap-2">
            <!-- First Row: Title -->
            {#if editing}
                <!-- Inline Edit Input -->
                <div
                    class="flex items-center gap-2"
                    in:fade={{ duration: 150 }}
                >
                    <input
                        bind:value={editContent}
                        onkeydown={handleEditKeydown}
                        class="flex-1 px-3 py-1.5 text-[15px] font-bold bg-white dark:bg-zinc-700 border border-primary-300 dark:border-primary-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-900 dark:text-white shadow-sm"
                        autofocus
                    />
                    <button
                        onclick={saveEdit}
                        class="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                        title="Speichern"
                    >
                        <Check size={18} />
                    </button>
                    <button
                        onclick={cancelEdit}
                        class="p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        title="Abbrechen"
                    >
                        <X size={18} />
                    </button>
                </div>
            {:else}
                <!-- Display Title -->
                <button
                    onclick={startEditing}
                    class="text-left w-full group/title"
                    title="Klicken zum Bearbeiten"
                >
                    <h3
                        class="text-[17px] font-bold text-zinc-900 dark:text-white group-hover/title:text-primary-600 dark:group-hover/title:text-primary-400 transition-colors tracking-tight leading-snug"
                    >
                        {item.content}
                    </h3>
                </button>
            {/if}

            <!-- Second Row: Meta Chips -->
            {#if !editing}
                {@const cat = getCategory(displayedCategory)}
                {@const t = getTag(displayedTag)}
                <div class="flex flex-wrap items-center gap-2 mt-1">
                    <!-- Category Chip -->
                    <div class="relative">
                        <button
                            onclick={() =>
                                (showCategoryMenu = !showCategoryMenu)}
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm {cat
                                ? cat.color
                                : 'bg-zinc-50 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-500 group/cat'}"
                        >
                            {#if cat?.icon}
                                <svelte:component this={cat.icon} size={11} />
                            {/if}
                            {cat?.label || "Kategorie"}
                        </button>

                        {#if showCategoryMenu}
                            <div
                                class="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl z-[101] py-2 overflow-hidden"
                                in:fade={{ duration: 150 }}
                                use:clickOutside={() =>
                                    (showCategoryMenu = false)}
                            >
                                <button
                                    onclick={() => updateTopicCategory("")}
                                    class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors {displayedCategory ===
                                    ''
                                        ? 'text-primary-600 font-bold opacity-100'
                                        : 'text-zinc-600 opacity-60'}"
                                >
                                    Keine Kategorie
                                </button>
                                {#each categories as c}
                                    <button
                                        onclick={() =>
                                            updateTopicCategory(c.id)}
                                        class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2 {displayedCategory ===
                                        c.id
                                            ? 'text-primary-600 font-bold bg-primary-50/30'
                                            : 'text-zinc-600'}"
                                    >
                                        <svelte:component
                                            this={c.icon}
                                            size={14}
                                        />
                                        <span>{c.label}</span>
                                        {#if displayedCategory === c.id}
                                            <Check size={14} class="ml-auto" />
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Tag Chip -->
                    <div class="relative">
                        <button
                            onclick={() => (showTagMenu = !showTagMenu)}
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm {t
                                ? t.color
                                : 'bg-zinc-50 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-500'}"
                        >
                            {#if t?.icon}
                                <svelte:component this={t.icon} size={11} />
                            {/if}
                            {t?.label || "Tag"}
                        </button>

                        {#if showTagMenu}
                            <div
                                class="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl z-[101] py-2 overflow-hidden"
                                in:fade={{ duration: 150 }}
                                use:clickOutside={() => (showTagMenu = false)}
                            >
                                <button
                                    onclick={() => updateTopicTag("")}
                                    class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors {displayedTag ===
                                    ''
                                        ? 'text-primary-600 font-bold'
                                        : 'text-zinc-600'}"
                                >
                                    Kein Tag
                                </button>
                                {#each tags as tag}
                                    <button
                                        onclick={() => updateTopicTag(tag.id)}
                                        class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2 {displayedTag ===
                                        tag.id
                                            ? 'text-primary-600 font-bold bg-primary-50/30'
                                            : 'text-zinc-600'}"
                                    >
                                        <svelte:component
                                            this={tag.icon}
                                            size={14}
                                        />
                                        <span>{tag.label}</span>
                                        {#if displayedTag === tag.id}
                                            <Check size={14} class="ml-auto" />
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        {#if children.length > 0 && !editing}
            <span
                class="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-700/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-600 flex-shrink-0"
            >
                <ChevronRight size={10} class="opacity-50" />
                {children.length}
                {children.length === 1 ? "Eintrag" : "Einträge"}
            </span>
        {/if}

        <!-- Status Selection -->
        {#if !editing}
            <div class="relative ml-2 flex-shrink-0">
                <button
                    onclick={() => (showStatusMenu = !showStatusMenu)}
                    class="flex items-center gap-2 px-3 py-1.5 {statusInfo.color} border rounded-xl transition-all shadow-sm active:scale-95 text-[11px] font-bold uppercase tracking-wider"
                >
                    {statusInfo.label}
                    <ChevronDown
                        size={12}
                        class="transition-transform {showStatusMenu
                            ? 'rotate-180'
                            : ''}"
                    />
                </button>

                {#if showStatusMenu}
                    <div
                        class="absolute left-0 mt-2 w-48 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl z-[101] py-2 overflow-hidden"
                        in:fade={{ duration: 150 }}
                        use:clickOutside={() => (showStatusMenu = false)}
                    >
                        {#each statuses as st}
                            <button
                                onclick={() => updateTopicStatus(st.id)}
                                class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {item.status ===
                                    st.id ||
                                (!item.status && st.id === 'offen')
                                    ? 'text-primary-600 dark:text-primary-400'
                                    : 'text-zinc-600 dark:text-zinc-400'}"
                            >
                                <span>{st.label}</span>
                                {#if item.status === st.id || (!item.status && st.id === "offen")}
                                    <Check size={14} />
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Datepicker if Postponed -->
            {#if displayedStatus === "verschoben"}
                <div
                    class="relative flex-shrink-0 ml-1"
                    in:slide={{ axis: "x" }}
                >
                    <DatePicker
                        value={displayedDeadline
                            ? displayedDeadline.split(" ")[0]
                            : ""}
                        onchange={(val: string) => updateTopicDeadline(val)}
                        label="Datum wählen..."
                    />
                </div>
            {/if}
        {/if}

        <!-- Speaker Selection (Premium Custom Dropdown) -->
        {#if !editing}
            <div class="relative ml-2 flex-shrink-0" id="speaker-dropdown">
                <button
                    onclick={() => (showSpeakerMenu = !showSpeakerMenu)}
                    class="flex items-center gap-2 px-2 py-1 bg-zinc-50 dark:bg-zinc-700/50 hover:bg-white dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg transition-all shadow-sm active:scale-95 group/btn"
                >
                    <div
                        class="w-6 h-6 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 flex items-center justify-center text-[10px] font-black text-primary-600 dark:text-primary-400 shadow-sm transition-all group-hover/btn:border-primary-500/50"
                    >
                        {getInitials(
                            members.find((m) => m.id === displayedSpeaker)
                                ?.name || "?",
                        )}
                    </div>
                    <ChevronDown
                        size={12}
                        class="text-zinc-400 group-hover/btn:text-primary-500 transition-transform {showSpeakerMenu
                            ? 'rotate-180'
                            : ''}"
                    />
                </button>

                {#if showStatusMenu || showSpeakerMenu}
                    <!-- Handled by their own local fixed backlayers -->
                {/if}

                {#if showSpeakerMenu}
                    <div
                        class="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl shadow-zinc-900/20 z-[101] py-2 overflow-hidden"
                        in:fade={{ duration: 150 }}
                        use:clickOutside={() => (showSpeakerMenu = false)}
                    >
                        <div
                            class="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-50 dark:border-zinc-600/50 mb-1"
                        >
                            Vortragenden wählen
                        </div>
                        <button
                            onclick={() => updateTopicSpeaker("")}
                            class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {displayedSpeaker ===
                            ''
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-zinc-600 dark:text-zinc-400'}"
                        >
                            <span>Kein Vortragender</span>
                            {#if !displayedSpeaker}
                                <Check size={14} />
                            {/if}
                        </button>
                        {#each members as member}
                            <button
                                onclick={() => updateTopicSpeaker(member.id)}
                                class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {displayedSpeaker ===
                                member.id
                                    ? 'text-primary-600 dark:text-primary-400'
                                    : 'text-zinc-600 dark:text-zinc-400'}"
                            >
                                <div class="flex flex-col">
                                    <span class="font-bold">{member.name}</span>
                                    {#if member.role}
                                        <span
                                            class="text-[10px] opacity-60 font-normal"
                                            >{member.role}</span
                                        >
                                    {/if}
                                </div>
                                {#if displayedSpeaker === member.id}
                                    <Check size={14} />
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Expand/Collapse Button (Far Right) -->
        <button
            onclick={() => (expanded = !expanded)}
            class="ml-auto bg-zinc-100 dark:bg-zinc-700/50 p-1.5 rounded-xl text-zinc-400 dark:text-zinc-500 transition-all flex-shrink-0 {expanded
                ? 'rotate-0'
                : '-rotate-90'} hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 shadow-sm active:scale-90"
        >
            <ChevronDown size={16} />
        </button>
    </div>

    <!-- Expanded Content -->
    {#if expanded}
        <div
            class="border-t border-zinc-100 dark:border-zinc-600/50 bg-zinc-50/20 dark:bg-zinc-700/5 rounded-b-2xl"
            transition:slide
        >
            <!-- Sub-Items List -->
            {#if children.length > 0}
                <div class="px-5 py-4 space-y-2.5">
                    {#each children as child}
                        {@const typeInfo = getSubType(child.type)}
                        <div
                            class="group/item flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-zinc-700/40 border border-zinc-100 dark:border-zinc-600/30 transition-all hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800/30 relative"
                        >
                            {#if editingChildId === child.id}
                                <div class="flex-1 space-y-4">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span
                                            class="text-[10px] font-black uppercase tracking-widest {typeInfo?.color?.includes(
                                                'text-',
                                            )
                                                ? typeInfo.color
                                                      .split(' ')
                                                      .find((c) =>
                                                          c.startsWith('text-'),
                                                      )
                                                : 'text-zinc-400'}"
                                        >
                                            {typeInfo?.label || child.type} bearbeiten
                                        </span>
                                    </div>
                                    <textarea
                                        bind:value={editChildContent}
                                        class="w-full px-4 py-3 text-sm bg-white dark:bg-zinc-700 border border-primary-300 dark:border-primary-700 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200"
                                        rows="2"
                                        autofocus
                                    ></textarea>

                                    <div class="flex flex-wrap gap-3">
                                        {#if child.type === "beitrag" || child.type === "aufgabe"}
                                            <div
                                                class="flex-1 min-w-[200px] relative text-xs"
                                            >
                                                <User
                                                    size={14}
                                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                                                />
                                                <button
                                                    onclick={() =>
                                                        (showEditChildSpeakerMenu =
                                                            !showEditChildSpeakerMenu)}
                                                    class="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl text-left font-bold text-zinc-700 dark:text-zinc-200 flex items-center justify-between"
                                                >
                                                    <span class="truncate">
                                                        {#if child.type === "beitrag"}
                                                            {editChildAssignee ||
                                                                "Sprecher wählen..."}
                                                        {:else if editChildAssignees.length > 0}
                                                            {editChildAssignees.join(
                                                                ", ",
                                                            )}
                                                        {:else}
                                                            Zuständig...
                                                        {/if}
                                                    </span>
                                                    <ChevronDown
                                                        size={14}
                                                        class="text-zinc-400 {showEditChildSpeakerMenu
                                                            ? 'rotate-180'
                                                            : ''} transition-transform"
                                                    />
                                                </button>

                                                {#if showEditChildSpeakerMenu}
                                                    <div
                                                        class="absolute left-0 bottom-full mb-2 w-full bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl z-[111] py-2 max-h-[250px] overflow-y-auto"
                                                        use:clickOutside={() =>
                                                            (showEditChildSpeakerMenu = false)}
                                                    >
                                                        {#if child.type === "beitrag"}
                                                            <button
                                                                onclick={() => {
                                                                    editChildAssignee =
                                                                        "";
                                                                    showEditChildSpeakerMenu = false;
                                                                }}
                                                                class="w-full text-left px-4 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 {editChildAssignee ===
                                                                ''
                                                                    ? 'text-primary-600 font-bold'
                                                                    : 'text-zinc-600'}"
                                                            >
                                                                Keine Auswahl
                                                            </button>
                                                        {/if}
                                                        {#each members as member}
                                                            <button
                                                                onclick={() => {
                                                                    if (
                                                                        child.type ===
                                                                        "beitrag"
                                                                    ) {
                                                                        editChildAssignee =
                                                                            member.name;
                                                                        showEditChildSpeakerMenu = false;
                                                                    } else {
                                                                        if (
                                                                            editChildAssignees.includes(
                                                                                member.name,
                                                                            )
                                                                        ) {
                                                                            editChildAssignees =
                                                                                editChildAssignees.filter(
                                                                                    (
                                                                                        n,
                                                                                    ) =>
                                                                                        n !==
                                                                                        member.name,
                                                                                );
                                                                        } else {
                                                                            editChildAssignees =
                                                                                [
                                                                                    ...editChildAssignees,
                                                                                    member.name,
                                                                                ];
                                                                        }
                                                                    }
                                                                }}
                                                                class="w-full text-left px-4 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-between {(
                                                                    child.type ===
                                                                    'beitrag'
                                                                        ? editChildAssignee ===
                                                                          member.name
                                                                        : editChildAssignees.includes(
                                                                              member.name,
                                                                          )
                                                                )
                                                                    ? 'text-primary-600 font-bold bg-primary-50/30'
                                                                    : 'text-zinc-600'}"
                                                            >
                                                                <span
                                                                    >{member.name}</span
                                                                >
                                                                {#if child.type === "beitrag" ? editChildAssignee === member.name : editChildAssignees.includes(member.name)}
                                                                    <Check
                                                                        size={14}
                                                                    />
                                                                {/if}
                                                            </button>
                                                        {/each}
                                                        {#if child.type === "aufgabe"}
                                                            <div
                                                                class="mt-2 px-2 border-t border-zinc-100 dark:border-zinc-600 pt-2"
                                                            >
                                                                <button
                                                                    onclick={() =>
                                                                        (showEditChildSpeakerMenu = false)}
                                                                    class="w-full py-1.5 bg-zinc-900 dark:bg-zinc-700 text-white text-[10px] font-black uppercase rounded-lg"
                                                                    >Fertig</button
                                                                >
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}

                                        {#if child.type === "aufgabe"}
                                            <div class="relative">
                                                <DatePicker
                                                    value={editChildDeadline}
                                                    onchange={(val) =>
                                                        (editChildDeadline =
                                                            val)}
                                                />
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="flex gap-2 justify-end">
                                        <button
                                            onclick={cancelChildEdit}
                                            class="px-4 py-2 text-xs font-bold text-zinc-500 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all font-bold"
                                        >
                                            Abbrechen
                                        </button>
                                        <button
                                            onclick={() => saveChildEdit(child)}
                                            disabled={savingChild ||
                                                !editChildContent.trim() ||
                                                (child.type === "aufgabe" &&
                                                    !editChildDeadline)}
                                            class="px-6 py-2 text-xs font-black uppercase bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-500/20 disabled:opacity-50 transition-all active:scale-95"
                                        >
                                            {savingChild
                                                ? "Speichert..."
                                                : "Speichern"}
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <!-- Type Badge -->
                                <div
                                    class="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm {typeInfo?.color ||
                                        'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'}"
                                >
                                    {#if typeInfo?.icon}
                                        <svelte:component
                                            this={typeInfo.icon}
                                            size={15}
                                        />
                                    {/if}
                                </div>

                                <!-- Content -->
                                <div class="flex-1 min-w-0">
                                    <div
                                        class="flex items-start justify-between gap-3"
                                    >
                                        <div class="flex-1 min-w-0">
                                            <div
                                                class="flex items-center gap-2 mb-1"
                                            >
                                                <span
                                                    class="text-[10px] font-black uppercase tracking-widest {typeInfo?.color?.includes(
                                                        'text-',
                                                    )
                                                        ? typeInfo.color
                                                              .split(' ')
                                                              .find((c) =>
                                                                  c.startsWith(
                                                                      'text-',
                                                                  ),
                                                              )
                                                        : 'text-zinc-400'}"
                                                >
                                                    {typeInfo?.label ||
                                                        child.type}
                                                </span>
                                                {#if child.type === "aufgabe" && child.deadline}
                                                    <div
                                                        class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[9px] font-bold"
                                                    >
                                                        <CalendarClock
                                                            size={10}
                                                        />
                                                        {formatDeadline(
                                                            child.deadline,
                                                        )}
                                                    </div>
                                                {/if}
                                            </div>
                                            <p
                                                class="text-[14px] text-zinc-700 dark:text-zinc-200 leading-relaxed font-medium"
                                            >
                                                {#if child.type === "beitrag" && child.assignee}
                                                    <span
                                                        class="font-black text-zinc-900 dark:text-white mr-1.5"
                                                        >{child.assignee}:</span
                                                    >
                                                {/if}
                                                {child.content}
                                            </p>
                                        </div>
                                        <div
                                            class="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                        >
                                            <button
                                                onclick={() =>
                                                    startEditingChild(child)}
                                                class="p-2 text-zinc-300 dark:text-zinc-600 hover:text-primary-500 dark:hover:text-primary-400 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all flex-shrink-0"
                                                title="Bearbeiten"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onclick={() =>
                                                    requestDeleteItem(child.id)}
                                                class="p-2 text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
                                                title="Löschen"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {#if child.type === "aufgabe" && child.assignee}
                                        <div class="flex flex-wrap gap-2 mt-2">
                                            {#each child.assignee.split(", ") as assignee}
                                                <div
                                                    class="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700/50 px-2.5 py-1 rounded-lg"
                                                >
                                                    <User size={10} />
                                                    <span>{assignee}</span>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- Add Sub-Item Buttons -->
            {#if !showAddForm}
                <div
                    class="px-5 py-4 flex items-center gap-2 flex-wrap border-t border-zinc-100/50 dark:border-zinc-600/30 bg-zinc-50/50 dark:bg-zinc-700/10 rounded-b-2xl"
                >
                    {#each subTypes as st}
                        <button
                            onclick={() => startAdd(st.type)}
                            class="flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold rounded-xl border-2 transition-all {st.borderColor} {st.color} hover:shadow-lg hover:shadow-zinc-500/10 active:scale-95 group/add"
                        >
                            <Plus
                                size={14}
                                class="group-hover/add:rotate-90 transition-transform"
                            />
                            {st.label}
                        </button>
                    {/each}

                    <!-- Topic Actions (Edit/Delete) -->
                    {#if !editing}
                        <div
                            class="ml-auto flex items-center gap-1.5 pl-3 border-l border-zinc-200 dark:border-zinc-600/50"
                        >
                            <button
                                onclick={startEditing}
                                class="p-2 text-zinc-400 dark:text-zinc-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all shadow-sm active:scale-95"
                                title="Thema bearbeiten"
                            >
                                <Pencil size={14} />
                            </button>
                            <button
                                onclick={() => ondelete?.(item.id)}
                                class="p-2 text-zinc-400 dark:text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all shadow-sm active:scale-95"
                                title="Thema löschen"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- Inline Add Form -->
                {@const activeType = subTypes.find((t) => t.type === addType)}
                <div
                    class="px-5 py-5 border-t border-zinc-100 dark:border-zinc-600/30 space-y-4 bg-zinc-50/30 dark:bg-zinc-700/20 rounded-b-2xl"
                    in:fade={{ duration: 200 }}
                >
                    <!-- Type Selector Pills -->
                    <div class="flex items-center gap-2 flex-wrap">
                        {#each subTypes as st}
                            <button
                                onclick={() => (addType = st.type)}
                                class="flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold rounded-xl transition-all {addType ===
                                st.type
                                    ? st.color +
                                      ' ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-zinc-900 shadow-md'
                                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600'}"
                            >
                                <svelte:component this={st.icon} size={13} />
                                {st.label}
                            </button>
                        {/each}
                    </div>

                    <div class="flex gap-3 items-start">
                        <textarea
                            bind:value={newContent}
                            onkeydown={handleKeydown}
                            placeholder="{activeType?.label ||
                                'Eintrag'} eingeben..."
                            class="flex-1 px-4 py-3 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 min-h-[100px]"
                            rows="3"
                            autofocus
                        ></textarea>
                    </div>

                    <div class="flex flex-wrap gap-3">
                        {#if addType === "beitrag" || addType === "aufgabe"}
                            <div class="flex-1 min-w-[200px] relative">
                                <User
                                    size={14}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                                />
                                <button
                                    onclick={() =>
                                        (showAddSpeakerMenu =
                                            !showAddSpeakerMenu)}
                                    class="w-full pl-9 pr-4 py-2.5 text-xs font-bold bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200 flex items-center justify-between group/addspeaker"
                                >
                                    <span class="truncate">
                                        {#if addType === "beitrag"}
                                            {newAssignee ||
                                                "Sprecher wählen..."}
                                        {:else if newAssignees.length > 0}
                                            {newAssignees.join(", ")}
                                        {:else}
                                            Zuständig...
                                        {/if}
                                    </span>
                                    <ChevronDown
                                        size={14}
                                        class="text-zinc-400 group-hover/addspeaker:text-primary-500 transition-transform {showAddSpeakerMenu
                                            ? 'rotate-180'
                                            : ''}"
                                    />
                                </button>

                                {#if showAddSpeakerMenu}
                                    <div
                                        class="fixed inset-0 z-[100]"
                                        onclick={() =>
                                            (showAddSpeakerMenu = false)}
                                    ></div>
                                    <div
                                        class="absolute left-0 bottom-full mb-2 w-full bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl z-[101] py-2 overflow-hidden max-h-[250px] overflow-y-auto"
                                        in:fade={{ duration: 150 }}
                                    >
                                        {#if addType === "beitrag"}
                                            <button
                                                onclick={() => {
                                                    newAssignee = "";
                                                    showAddSpeakerMenu = false;
                                                }}
                                                class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {newAssignee ===
                                                ''
                                                    ? 'text-primary-600 dark:text-primary-400'
                                                    : 'text-zinc-600 dark:text-zinc-400'}"
                                            >
                                                <span>Keine Auswahl</span>
                                                {#if !newAssignee}
                                                    <Check size={14} />
                                                {/if}
                                            </button>
                                        {/if}

                                        {#each members as member}
                                            <button
                                                onclick={() => {
                                                    if (addType === "beitrag") {
                                                        newAssignee =
                                                            member.name;
                                                        showAddSpeakerMenu = false;
                                                    } else {
                                                        if (
                                                            newAssignees.includes(
                                                                member.name,
                                                            )
                                                        ) {
                                                            newAssignees =
                                                                newAssignees.filter(
                                                                    (n) =>
                                                                        n !==
                                                                        member.name,
                                                                );
                                                        } else {
                                                            newAssignees = [
                                                                ...newAssignees,
                                                                member.name,
                                                            ];
                                                        }
                                                    }
                                                }}
                                                class="w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {(
                                                    addType === 'beitrag'
                                                        ? newAssignee ===
                                                          member.name
                                                        : newAssignees.includes(
                                                              member.name,
                                                          )
                                                )
                                                    ? 'text-primary-600 dark:text-primary-400'
                                                    : 'text-zinc-600 dark:text-zinc-400'}"
                                            >
                                                <div class="flex flex-col">
                                                    <span class="font-bold"
                                                        >{member.name}</span
                                                    >
                                                    {#if member.role}
                                                        <span
                                                            class="text-[10px] opacity-60 font-normal"
                                                            >{member.role}</span
                                                        >
                                                    {/if}
                                                </div>
                                                {#if addType === "beitrag" ? newAssignee === member.name : newAssignees.includes(member.name)}
                                                    <Check size={14} />
                                                {/if}
                                            </button>
                                        {/each}

                                        {#if addType === "aufgabe"}
                                            <div
                                                class="mt-2 px-2 pb-1 border-t border-zinc-100 dark:border-zinc-600 pt-2"
                                            >
                                                <button
                                                    onclick={() =>
                                                        (showAddSpeakerMenu = false)}
                                                    class="w-full py-2 bg-zinc-900 dark:bg-zinc-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary-600 transition-colors"
                                                >
                                                    Fertig
                                                </button>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if addType === "aufgabe"}
                            <div class="relative">
                                <CalendarDays
                                    size={14}
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                                />
                                <DatePicker
                                    value={newDeadline}
                                    onchange={(val) => (newDeadline = val)}
                                />
                            </div>
                        {/if}
                    </div>

                    <div class="flex gap-2 pt-2">
                        <button
                            onclick={addSubItem}
                            disabled={adding ||
                                !newContent.trim() ||
                                (addType === "aufgabe" && !newDeadline)}
                            class="flex-1 sm:flex-none px-6 py-2.5 text-xs font-black uppercase tracking-wider bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-500/20 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {adding
                                ? "Wird hinzugefügt..."
                                : "Eintrag Hinzufügen"}
                        </button>
                        <button
                            onclick={() => {
                                showAddForm = false;
                                newContent = "";
                                newAssignee = "";
                                newAssignees = [];
                                newDeadline = "";
                            }}
                            class="px-6 py-2.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all font-bold"
                        >
                            Abbrechen
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>

<ConfirmationModal
    open={showDeleteConfirm}
    title="Eintrag löschen?"
    message="Bist du sicher? Dieser Eintrag wird unwiderruflich gelöscht."
    confirmLabel="Löschen"
    onConfirm={confirmDeleteItem}
    onClose={() => (showDeleteConfirm = false)}
/>

<style>
    /* Prevent text selection when double clicking buttons */
    button {
        user-select: none;
    }
</style>
