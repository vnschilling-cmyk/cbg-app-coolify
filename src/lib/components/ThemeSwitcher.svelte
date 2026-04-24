<script lang="ts">
    import { theme, type Theme } from "../theme";
    import { Sun, Moon, Monitor } from "lucide-svelte";
    import { onMount } from "svelte";

    let showDropdown = $state(false);

    const themes: { id: Theme; label: string; icon: any }[] = [
        { id: "light", label: "Hell", icon: Sun },
        { id: "dark", label: "Dunkel", icon: Moon },
        { id: "system", label: "System", icon: Monitor },
    ];

    function selectTheme(t: Theme) {
        theme.set(t);
        showDropdown = false;
    }

    // Close dropdown on click outside
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (showDropdown && !target.closest(".theme-switcher-container")) {
            showDropdown = false;
        }
    }

    onMount(() => {
        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    });
</script>

<div class="relative theme-switcher-container">
    <button
        onclick={() => (showDropdown = !showDropdown)}
        class="w-10 h-10 flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
        title="Design anpassen"
    >
        {#if $theme === "light"}
            <Sun size={20} />
        {:else if $theme === "dark"}
            <Moon size={20} />
        {:else}
            <Monitor size={20} />
        {/if}
    </button>

    {#if showDropdown}
        <div
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg py-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
        >
            {#each themes as t}
                <button
                    onclick={() => selectTheme(t.id)}
                    class="w-full px-4 py-2 flex items-center gap-3 text-sm transition-colors {$theme ===
                    t.id
                        ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50 dark:bg-primary-900/20'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
                >
                    <t.icon size={16} />
                    <span>{t.label}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>
