<script lang="ts">
    import { pb } from "$lib/pocketbase";
    import {
        Flame,
        Plus,
        Trash2,
        User,
        ChevronDown,
        Check,
    } from "lucide-svelte";
    import { fade, slide } from "svelte/transition";
    import { clickOutside } from "$lib/actions";

    interface Member {
        id: string;
        name: string;
    }

    interface PrayerItem {
        id: string;
        content: string;
        note?: string;
        assignee?: string;
    }

    interface Props {
        items: PrayerItem[];
        members: Member[];
        meetingId: string;
    }

    let { items = [], members = [], meetingId }: Props = $props();

    let newItemContent = $state("");
    let newItemNote = $state("");
    let adding = $state(false);
    let activeDropdown = $state<string | null>(null);

    async function addItem() {
        if (!newItemContent.trim()) return;
        adding = true;
        try {
            await pb.collection("protocol_items").create({
                meeting_id: meetingId,
                type: "prayer",
                content: newItemContent.trim(),
                note: newItemNote.trim(),
                sort_order: items.length,
            });
            newItemContent = "";
            newItemNote = "";
        } catch (err) {
            console.error("Failed to add prayer item:", err);
        } finally {
            adding = false;
        }
    }

    async function updateAssignee(itemId: string, memberId: string) {
        try {
            await pb.collection("protocol_items").update(itemId, {
                assignee: memberId || null,
            });
            activeDropdown = null;
        } catch (err) {
            console.error("Failed to update prayer assignee:", err);
        }
    }

    async function removeItem(itemId: string) {
        try {
            await pb.collection("protocol_items").delete(itemId);
        } catch (err) {
            console.error("Failed to delete prayer item:", err);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            addItem();
        }
    }

    function getInitials(name: string): string {
        if (!name) return "?";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);
    }
</script>

<div
    class="bg-white dark:bg-zinc-800/80 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm overflow-hidden"
>
    <!-- Header -->
    <div
        class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-700/50"
    >
        <div class="flex items-center gap-2.5">
            <div
                class="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400"
            >
                <Flame size={15} />
            </div>
            <h3
                class="text-sm font-bold text-zinc-900 dark:text-white tracking-wide uppercase"
            >
                Gebetsgemeinschaft
            </h3>
        </div>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-3">
        {#each items as item (item.id)}
            <div
                class="flex items-center gap-3 p-2 bg-zinc-50 dark:bg-zinc-700/30 rounded-xl border border-zinc-100 dark:border-zinc-600/50 group"
                transition:slide
            >
                <div class="flex-1 min-w-0">
                    <p
                        class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate"
                    >
                        {item.content}
                    </p>
                    {#if item.note}
                        <p
                            class="text-xs text-zinc-500 dark:text-zinc-400 truncate"
                        >
                            {item.note}
                        </p>
                    {/if}
                </div>

                <!-- Assignee Selection -->
                <div class="relative">
                    <button
                        onclick={() =>
                            (activeDropdown =
                                activeDropdown === item.id ? null : item.id)}
                        class="flex items-center gap-2 px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-lg text-[10px] font-bold transition-all hover:border-primary-500/50 active:scale-95"
                    >
                        {#if item.assignee}
                            {@const member = members.find(
                                (m) => m.id === item.assignee,
                            )}
                            <div
                                class="w-5 h-5 rounded-md bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400"
                            >
                                {getInitials(member?.name || "?")}
                            </div>
                            <span class="max-w-[80px] truncate"
                                >{member?.name || "Unbekannt"}</span
                            >
                        {:else}
                            <User size={12} class="text-zinc-400" />
                            <span class="text-zinc-400">Zuweisen</span>
                        {/if}
                        <ChevronDown
                            size={10}
                            class="text-zinc-400 transition-transform {activeDropdown ===
                            item.id
                                ? 'rotate-180'
                                : ''}"
                        />
                    </button>

                    {#if activeDropdown === item.id}
                        <div
                            class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-600 shadow-xl z-50 py-1 overflow-hidden"
                            in:fade={{ duration: 150 }}
                            use:clickOutside={() => (activeDropdown = null)}
                        >
                            <button
                                onclick={() => updateAssignee(item.id, "")}
                                class="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors flex items-center justify-between {!item.assignee
                                    ? 'text-primary-600'
                                    : 'text-zinc-600'}"
                            >
                                <span>Nicht zugewiesen</span>
                                {#if !item.assignee}<Check size={12} />{/if}
                            </button>
                            {#each members as member}
                                <button
                                    onclick={() =>
                                        updateAssignee(item.id, member.id)}
                                    class="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors flex items-center justify-between {item.assignee ===
                                    member.id
                                        ? 'text-primary-600 font-bold'
                                        : 'text-zinc-600'}"
                                >
                                    <span>{member.name}</span>
                                    {#if item.assignee === member.id}<Check
                                            size={12}
                                        />{/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <button
                    onclick={() => removeItem(item.id)}
                    class="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        {/each}

        <!-- Add Input -->
        <div class="flex items-center gap-2 pt-2">
            <div class="flex-1 flex gap-2">
                <input
                    type="text"
                    bind:value={newItemContent}
                    onkeydown={handleKeydown}
                    placeholder="Name oder Familie..."
                    class="flex-1 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                />
                <input
                    type="text"
                    bind:value={newItemNote}
                    onkeydown={handleKeydown}
                    placeholder="Bibeltext (optional)..."
                    class="w-1/3 px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                />
            </div>
            <button
                onclick={addItem}
                disabled={adding || !newItemContent.trim()}
                class="p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 active:scale-95 shadow-md shadow-primary-500/20"
            >
                <Plus size={18} />
            </button>
        </div>
    </div>
</div>
