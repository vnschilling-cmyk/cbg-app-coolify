<script lang="ts">
    import {
        CheckCircle2,
        AlertCircle,
        Info,
        AlertTriangle,
        X,
    } from "lucide-svelte";
    import { fade, fly } from "svelte/transition";
    import type { Toast as ToastType } from "$lib/notifications.svelte";

    let {
        toast,
        onRemove,
    }: { toast: ToastType; onRemove: (id: string) => void } = $props();

    const configs = {
        success: {
            icon: CheckCircle2,
            bg: "bg-emerald-50/90 dark:bg-emerald-900/40",
            border: "border-emerald-200 dark:border-emerald-800",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            title: "Erfolg",
        },
        error: {
            icon: AlertCircle,
            bg: "bg-red-50/90 dark:bg-red-900/40",
            border: "border-red-200 dark:border-red-800",
            iconColor: "text-red-600 dark:text-red-400",
            title: "Fehler",
        },
        warning: {
            icon: AlertTriangle,
            bg: "bg-amber-50/90 dark:bg-amber-900/40",
            border: "border-amber-200 dark:border-amber-800",
            iconColor: "text-amber-600 dark:text-amber-400",
            title: "Warnung",
        },
        info: {
            icon: Info,
            bg: "bg-blue-50/90 dark:bg-blue-900/40",
            border: "border-blue-200 dark:border-blue-800",
            iconColor: "text-blue-600 dark:text-blue-400",
            title: "Info",
        },
    };

    const config = $derived(configs[toast.type]);
</script>

{#if toast}
    {@const Icon = config.icon}
    <div
        in:fly={{ y: 20, duration: 400 }}
        out:fade={{ duration: 200 }}
        class="group relative flex items-center gap-4 p-4 pr-12 {config.bg} {config.border} border backdrop-blur-md rounded-2xl shadow-xl shadow-zinc-200/20 dark:shadow-black/20 w-80 pointer-events-auto transition-all hover:scale-[1.02]"
    >
        <div
            class="flex-shrink-0 w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm {config.iconColor}"
        >
            <Icon size={20} />
        </div>

        <div class="flex-1 min-w-0">
            <p
                class="text-[10px] uppercase font-black tracking-widest {config.iconColor} mb-0.5"
            >
                {config.title}
            </p>
            <p
                class="text-[13px] font-bold text-zinc-800 dark:text-zinc-100 leading-snug"
            >
                {toast.message}
            </p>
        </div>

        <button
            onclick={() => onRemove(toast.id)}
            class="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-zinc-800/50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
        >
            <X size={14} />
        </button>
    </div>
{/if}
