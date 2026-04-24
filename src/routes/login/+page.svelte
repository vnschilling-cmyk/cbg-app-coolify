<script lang="ts">
    import { enhance } from "$app/forms";
    import { LogIn, Mail, Lock, AlertCircle, Loader2 } from "lucide-svelte";

    let { form } = $props();
    let loading = $state(false);
</script>

<svelte:head>
    <title>Login | διάκονος</title>
</svelte:head>

<div
    class="min-h-full flex items-center justify-center p-4 transition-colors duration-300"
>
    <div class="w-full max-w-md">
        <div
            class="bg-white dark:bg-zinc-700 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-600 p-8"
        >
            <div class="flex flex-col items-center mb-8">
                <img
                    src="/logo-light.png"
                    alt="Logo"
                    class="h-20 w-auto dark:hidden mb-4"
                />
                <img
                    src="/logo-dark.png"
                    alt="Logo"
                    class="h-20 w-auto hidden dark:block mb-4"
                />
                <h2 class="text-2xl font-black text-zinc-900 dark:text-white">
                    Willkommen zurück
                </h2>
                <p class="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                    Melde dich an, um deine Pläne zu verwalten
                </p>
            </div>

            <form
                method="POST"
                action="?/login"
                use:enhance={() => {
                    loading = true;
                    return async ({ update }) => {
                        loading = false;
                        await update();
                    };
                }}
                class="space-y-5"
            >
                {#if form?.error}
                    <div
                        class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm"
                    >
                        <AlertCircle size={18} />
                        <p>{form.error}</p>
                    </div>
                {/if}

                <div class="space-y-1.5">
                    <label
                        for="email"
                        class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ml-1"
                        >Email</label
                    >
                    <div class="relative">
                        <Mail
                            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                            size={18}
                        />
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={form?.email ?? ""}
                            placeholder="name@beispiel.de"
                            required
                            class="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-700 border-none rounded-xl focus:ring-2 focus:ring-primary-600 dark:text-white transition-all outline-none"
                        />
                    </div>
                </div>

                <div class="space-y-1.5">
                    <label
                        for="password"
                        class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ml-1"
                        >Passwort</label
                    >
                    <div class="relative">
                        <Lock
                            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                            size={18}
                        />
                        <input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            class="w-full pl-11 pr-4 py-3 bg-zinc-50 dark:bg-zinc-700 border-none rounded-xl focus:ring-2 focus:ring-primary-600 dark:text-white transition-all outline-none"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    class="w-full btn btn-primary py-4 mt-2 flex items-center justify-center gap-2"
                >
                    {#if loading}
                        <Loader2 size={20} class="animate-spin" />
                        Wird angemeldet...
                    {:else}
                        <LogIn size={20} />
                        Anmelden
                    {/if}
                </button>
            </form>
        </div>

        <p class="text-center text-zinc-500 dark:text-zinc-600 text-xs mt-8">
            Probleme beim Login? Kontaktiere deinen Administrator.
        </p>
    </div>
</div>
