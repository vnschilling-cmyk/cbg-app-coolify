<script lang="ts">
    import { page } from "$app/state";
    import { ArrowLeft, Home, AlertTriangle } from "lucide-svelte";
</script>

<div
    class="min-h-full flex items-center justify-center p-8 transition-colors duration-300"
>
    <div class="max-w-md w-full text-center">
        <div class="mb-8 flex justify-center">
            <div
                class="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-3xl flex items-center justify-center text-red-600 dark:text-red-400 shadow-xl shadow-red-500/10"
            >
                <AlertTriangle size={48} />
            </div>
        </div>

        <h1 class="text-6xl font-black text-zinc-900 dark:text-white mb-4">
            {page.status}
        </h1>

        <h2 class="text-2xl font-bold text-zinc-800 dark:text-zinc-200 mb-6">
            {page.status === 404
                ? "Hoppla! Seite nicht gefunden."
                : "Ein Fehler ist aufgetreten."}
        </h2>

        <p>
            {page.status === 404
                ? "Die von dir gesuchte Seite scheint nicht zu existieren oder wurde verschoben."
                : "Es ist ein unerwarteter Fehler aufgetreten."}
        </p>

        {#if page.error}
            <div
                class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-left mb-8 overflow-auto max-h-96"
            >
                <p class="font-bold text-red-700 dark:text-red-300 mb-2">
                    Details:
                </p>
                <pre
                    class="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">{page
                        .error.message}</pre>
                {#if (page.error as any).stack}
                    <pre
                        class="text-[10px] text-red-500 dark:text-red-500/70 font-mono whitespace-pre-wrap mt-4 border-t border-red-200 dark:border-red-800/50 pt-2">{(
                            page.error as any
                        ).stack}</pre>
                {/if}
            </div>
        {/if}

        <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <button
                onclick={() => history.back()}
                class="btn btn-secondary flex items-center justify-center gap-2 py-3 px-6"
            >
                <ArrowLeft size={18} />
                Zurück
            </button>
            <a
                href="/"
                class="btn btn-primary flex items-center justify-center gap-2 py-3 px-6"
            >
                <Home size={18} />
                Dashboard
            </a>
        </div>
    </div>
</div>
