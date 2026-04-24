<script lang="ts">
    import {
        X,
        AlertTriangle,
        Trash2,
        Check,
        CircleAlert,
    } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";

    interface Props {
        open: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        type?: "danger" | "warning" | "info";
        onConfirm: () => void;
        onClose: () => void;
    }

    let {
        open,
        title,
        message,
        confirmLabel = "Bestätigen",
        cancelLabel = "Abbrechen",
        type = "danger",
        onConfirm,
        onClose,
    }: Props = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
        if (e.key === "Enter") onConfirm();
    }

    const typeConfig = {
        danger: {
            icon: Trash2,
            iconBg: "bg-red-100 dark:bg-red-900/30",
            iconColor: "text-red-600 dark:text-red-400",
            btnBg: "bg-red-600 hover:bg-red-700",
            shadow: "shadow-red-500/25",
        },
        warning: {
            icon: AlertTriangle,
            iconBg: "bg-amber-100 dark:bg-amber-900/30",
            iconColor: "text-amber-600 dark:text-amber-400",
            btnBg: "bg-amber-600 hover:bg-amber-700",
            shadow: "shadow-amber-500/25",
        },
        info: {
            icon: CircleAlert,
            iconBg: "bg-primary-100 dark:bg-primary-900/30",
            iconColor: "text-primary-600 dark:text-primary-400",
            btnBg: "bg-primary-600 hover:bg-primary-700",
            shadow: "shadow-primary-500/25",
        },
    };

    let config = $derived(typeConfig[type]);
</script>

{#if open}
    {@const Icon = config.icon}
    <div
        class="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm"
        in:fade={{ duration: 200 }}
        onkeydown={handleKeydown}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0" onclick={onClose}></div>

        <div
            class="relative w-full max-w-sm bg-white dark:bg-zinc-800 rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700"
            in:scale={{ duration: 300, start: 0.95 }}
        >
            <div class="p-6">
                <div class="flex flex-col items-center text-center space-y-4">
                    <!-- Icon -->
                    <div
                        class="w-16 h-16 rounded-2xl {config.iconBg} flex items-center justify-center {config.iconColor}"
                    >
                        <Icon size={32} />
                    </div>

                    <!-- Content -->
                    <div class="space-y-2">
                        <h2
                            class="text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-tight"
                        >
                            {title}
                        </h2>
                        <p
                            class="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed px-2"
                        >
                            {message}
                        </p>
                    </div>
                </div>

                <!-- Footer / Actions -->
                <div class="mt-8 grid grid-cols-2 gap-3">
                    <button
                        onclick={onClose}
                        class="px-5 py-3 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onclick={onConfirm}
                        class="px-5 py-3 {config.btnBg} text-white text-sm font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg {config.shadow} active:scale-95"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>

            <!-- Absolute Close Button (Top Right) -->
            <button
                onclick={onClose}
                class="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
            >
                <X size={18} />
            </button>
        </div>
    </div>
{/if}
