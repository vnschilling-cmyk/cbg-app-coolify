<script lang="ts">
  import { user } from "$lib/pocketbase";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Calendar, ClipboardList } from "lucide-svelte";

  onMount(() => {
    if (!$user) {
      goto("/login");
    }
  });
</script>

<div
  class="h-full flex items-center justify-center p-8 transition-colors duration-300"
>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
    <!-- Prediger (Plans) -->
    <a
      href="/plans"
      class="group relative overflow-hidden bg-white dark:bg-zinc-700 rounded-3xl p-8 shadow-xl border border-zinc-200 dark:border-zinc-600 hover:shadow-2xl hover:shadow-primary-600/10 hover:-translate-y-2 transition-all duration-300 flex flex-col items-center justify-center text-center gap-6 h-80"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-primary-50 to-transparent dark:from-primary-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      ></div>

      <div
        class="w-24 h-24 rounded-full bg-primary-50 dark:bg-zinc-700 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300 relative z-10 shadow-sm"
      >
        <Calendar size={48} />
      </div>

      <div class="relative z-10">
        <h2
          class="text-3xl font-black text-zinc-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
        >
          Prediger
        </h2>
        <p class="text-zinc-500 dark:text-zinc-400 font-medium">
          Dienstpläne verwalten & erstellen
        </p>
      </div>
    </a>

    <!-- Besprechungen (Meetings) -->
    <a
      href="/meetings"
      class="group relative overflow-hidden bg-white dark:bg-zinc-700 rounded-3xl p-8 shadow-xl border border-zinc-200 dark:border-zinc-600 hover:shadow-2xl hover:shadow-emerald-600/10 hover:-translate-y-2 transition-all duration-300 flex flex-col items-center justify-center text-center gap-6 h-80"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      ></div>

      <div
        class="w-24 h-24 rounded-full bg-emerald-50 dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300 relative z-10 shadow-sm"
      >
        <ClipboardList size={48} />
      </div>

      <div class="relative z-10">
        <h2
          class="text-3xl font-black text-zinc-900 dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors"
        >
          Besprechungen
        </h2>
        <p class="text-zinc-500 dark:text-zinc-400 font-medium">
          Abläufe & Protokolle
        </p>
      </div>
    </a>
  </div>
</div>
