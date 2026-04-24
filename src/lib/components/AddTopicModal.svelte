<script lang="ts">
    import { pb } from "$lib/pocketbase";
    import { invalidateAll } from "$app/navigation";
    import {
        X,
        Check,
        User,
        Tag as TagIcon,
        LayoutGrid,
        PlusCircle,
        AlertCircle,
        ChevronDown,
    } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";
    import { clickOutside } from "$lib/actions";
    import { categories, tags } from "$lib/constants";

    interface Member {
        id: string;
        name: string;
    }

    interface Props {
        open: boolean;
        onClose: () => void;
        meetingId: string;
        members: Member[];
        lastSortOrder: number;
    }

    let { open, onClose, meetingId, members, lastSortOrder }: Props = $props();

    let title = $state("");
    let speaker = $state("");
    let category = $state("");
    let tag = $state("");
    let adding = $state(false);
    let errorMsg = $state("");
    let showSpeakerDropdown = $state(false);

    async function handleSubmit() {
        if (!title.trim()) return;
        adding = true;
        errorMsg = "";
        try {
            await pb.collection("protocol_items").create({
                meeting_id: meetingId,
                type: "agenda",
                content: title.trim(),
                assignee: speaker || null,
                category: category || null,
                tag: tag || null,
                sort_order: lastSortOrder + 1,
            });
            await invalidateAll();
            resetAndClose();
        } catch (err: any) {
            errorMsg = err?.message || "Fehler beim Erstellen des Themas";
            console.error("Failed to create topic:", err);
        } finally {
            adding = false;
        }
    }

    function resetAndClose() {
        title = "";
        speaker = "";
        category = "";
        tag = "";
        errorMsg = "";
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") resetAndClose();
        if (e.key === "Enter" && e.ctrlKey) handleSubmit();
    }
</script>

{#if open}
    <div
        class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm"
        in:fade={{ duration: 200 }}
        onkeydown={handleKeydown}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0" onclick={resetAndClose}></div>

        <div
            class="relative w-full max-w-lg bg-white dark:bg-zinc-700 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-600"
            in:scale={{ duration: 300, start: 0.95 }}
        >
            <!-- Header -->
            <div
                class="px-6 py-5 border-b border-zinc-100 dark:border-zinc-600 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-700/50"
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400"
                    >
                        <PlusCircle size={22} />
                    </div>
                    <div>
                        <h2
                            class="text-lg font-black text-zinc-900 dark:text-white tracking-tight"
                        >
                            Neues Thema
                        </h2>
                        <p
                            class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
                        >
                            Agenda-Punkt hinzufügen
                        </p>
                    </div>
                </div>
                <button
                    onclick={resetAndClose}
                    class="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                >
                    <X size={20} />
                </button>
            </div>

            <!-- Body -->
            <div class="p-6 space-y-6">
                <!-- Title Input -->
                <div class="space-y-2">
                    <label
                        for="topic-title"
                        class="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1"
                    >
                        Titel des Themas
                    </label>
                    <input
                        id="topic-title"
                        bind:value={title}
                        placeholder="Was soll besprochen werden?"
                        class="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-2xl text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all font-bold text-lg"
                        autofocus
                    />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <!-- Speaker Selection -->
                    <div class="space-y-2">
                        <label
                            class="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1"
                        >
                            Vortragender
                        </label>
                        <div class="relative">
                            <button
                                onclick={() =>
                                    (showSpeakerDropdown =
                                        !showSpeakerDropdown)}
                                class="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:border-primary-500/50 transition-all shadow-sm active:scale-[0.98]"
                            >
                                <User size={16} class="text-zinc-400" />
                                <span class="flex-1 text-left">
                                    {members.find((m) => m.id === speaker)
                                        ?.name || "Keiner"}
                                </span>
                                <ChevronDown
                                    size={16}
                                    class="text-zinc-400 transition-transform {showSpeakerDropdown
                                        ? 'rotate-180'
                                        : ''}"
                                />
                            </button>

                            {#if showSpeakerDropdown}
                                <div
                                    class="absolute left-0 top-full mt-2 w-full bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-xl z-20 max-h-60 overflow-y-auto"
                                    in:fade={{ duration: 150 }}
                                    use:clickOutside={() =>
                                        (showSpeakerDropdown = false)}
                                >
                                    <button
                                        onclick={() => {
                                            speaker = "";
                                            showSpeakerDropdown = false;
                                        }}
                                        class="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {!speaker
                                            ? 'text-primary-600 dark:text-primary-400 bg-primary-50/30'
                                            : 'text-zinc-600 dark:text-zinc-400'}"
                                    >
                                        <span>Keiner</span>
                                        {#if !speaker}
                                            <Check size={14} />
                                        {/if}
                                    </button>
                                    {#each members as member}
                                        <button
                                            onclick={() => {
                                                speaker = member.id;
                                                showSpeakerDropdown = false;
                                            }}
                                            class="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between {speaker ===
                                            member.id
                                                ? 'text-primary-600 dark:text-primary-400 bg-primary-50/30'
                                                : 'text-zinc-600 dark:text-zinc-400'}"
                                        >
                                            <span>{member.name}</span>
                                            {#if speaker === member.id}
                                                <Check size={14} />
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Category Chips -->
                    <div class="space-y-2">
                        <span
                            class="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1"
                        >
                            Kategorie
                        </span>
                        <div class="flex flex-wrap gap-2">
                            {#each categories as cat}
                                {@const Icon = cat.icon}
                                <button
                                    onclick={() =>
                                        (category =
                                            category === cat.id ? "" : cat.id)}
                                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 {category ===
                                    cat.id
                                        ? cat.color +
                                          ' border-current shadow-md'
                                        : 'bg-zinc-50 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-500'}"
                                >
                                    <Icon size={12} />
                                    {cat.label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- Tag Chips -->
                    <div class="space-y-2 sm:col-span-2">
                        <span
                            class="text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1"
                        >
                            Tag / Markierung
                        </span>
                        <div class="flex flex-wrap gap-2">
                            {#each tags as t}
                                {@const TagIconFinal = t.icon}
                                <button
                                    onclick={() =>
                                        (tag = tag === t.id ? "" : t.id)}
                                    class="flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 {tag ===
                                    t.id
                                        ? t.color + ' border-current shadow-md'
                                        : 'bg-zinc-50 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-500'}"
                                >
                                    <TagIconFinal size={14} />
                                    {t.label}
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>

                {#if errorMsg}
                    <div
                        class="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-600 dark:text-red-400"
                        in:fade
                    >
                        <AlertCircle size={14} />
                        {errorMsg}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="px-6 py-5 bg-zinc-50 dark:bg-zinc-700/50 border-t border-zinc-100 dark:border-zinc-600 flex items-center justify-end gap-3"
            >
                <button
                    onclick={resetAndClose}
                    class="px-5 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                >
                    Abbrechen
                </button>
                <button
                    onclick={handleSubmit}
                    disabled={adding || !title.trim()}
                    class="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white text-sm font-black uppercase tracking-wider rounded-xl hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/25 active:scale-95"
                >
                    {#if adding}
                        <div
                            class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        ></div>
                    {:else}
                        <Check size={18} />
                    {/if}
                    Thema erstellen
                </button>
            </div>
        </div>
    </div>
{/if}
