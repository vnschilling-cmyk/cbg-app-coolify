<script lang="ts">
  import {
    Plus,
    Calendar,
    FileText,
    ArrowRight,
    Clock,
    CheckCircle2,
  } from "lucide-svelte";
  import { format } from "date-fns";
  import { de } from "date-fns/locale";

  import { goto } from "$app/navigation";

  let plans = $state([
    {
      id: "1",
      name: "März - April 2026",
      status: "draft",
      lastModified: new Date(),
      progress: 45,
    },
    {
      id: "2",
      name: "Januar - Februar 2026",
      status: "published",
      lastModified: new Date(2026, 0, 15),
      progress: 100,
    },
    {
      id: "3",
      name: "November - Dezember 2025",
      status: "archived",
      lastModified: new Date(2025, 10, 20),
      progress: 100,
    },
  ]);

  async function createNewPlan() {
    const newId = Math.random().toString(36).substring(7);
    const newPlan = {
      id: newId,
      name: "Neuer Dienstplan " + format(new Date(), "yyyy"),
      status: "draft",
      lastModified: new Date(),
      progress: 0,
    };

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 600));

    plans = [newPlan, ...plans];
    goto(`/editor/${newId}`);
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "draft":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      case "published":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800";
      case "archived":
        return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800";
      default:
        return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
    }
  }
</script>

<div
  class="p-8 max-w-7xl mx-auto w-full min-h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-300"
>
  <div class="flex items-center justify-between mb-10">
    <div>
      <h2
        class="text-3xl font-black text-slate-900 dark:text-white tracking-tight"
      >
        Dienstpläne
      </h2>
      <p class="text-slate-500 dark:text-slate-400 mt-1 font-medium">
        Verwalte die Dienstplanung für deine Gemeinde.
      </p>
    </div>
    <button
      onclick={createNewPlan}
      class="btn btn-primary flex items-center gap-2 px-6 py-3"
    >
      <Plus size={20} />
      Neuer Plan
    </button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each plans as plan (plan.id)}
      <a
        href="/editor/{plan.id}"
        class="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl hover:shadow-primary-600/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
      >
        <div
          class="absolute top-0 left-0 w-1 h-full bg-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>

        <div class="flex items-start justify-between mb-4">
          <div
            class="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
          >
            <Calendar size={24} />
          </div>
          <span
            class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border {getStatusStyle(
              plan.status,
            )}"
          >
            {#if plan.status === "draft"}
              Entwurf
            {:else}
              {plan.status === "published" ? "Veröffentlicht" : "Archiviert"}
            {/if}
          </span>
        </div>

        <h3
          class="text-xl font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors mb-1"
        >
          {plan.name}
        </h3>

        <div
          class="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm mb-6"
        >
          <Clock size={14} />
          <span
            >Bearbeitet am {format(plan.lastModified, "dd. MMM yyyy", {
              locale: de,
            })}</span
          >
        </div>

        <!-- Progress Bar -->
        <div class="mb-6">
          <div
            class="flex items-center justify-between text-xs font-bold mb-1.5 uppercase tracking-wider text-slate-400 dark:text-slate-500"
          >
            <span>Vollständigkeit</span>
            <span class="text-slate-700 dark:text-slate-300"
              >{plan.progress}%</span
            >
          </div>
          <div
            class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
          >
            <div
              class="h-full bg-primary-600 rounded-full transition-all duration-1000"
              style="width: {plan.progress}%"
            ></div>
          </div>
        </div>

        <div
          class="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800/50"
        >
          <span
            class="text-xs font-bold text-primary-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
          >
            Öffnen <ArrowRight size={14} />
          </span>
          <div class="flex -space-x-2">
            {#each [1, 2, 3] as _}
              <div
                class="w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400"
              >
                P
              </div>
            {/each}
          </div>
        </div>
      </a>
    {/each}

    <!-- Empty State / New Card -->
    <button
      onclick={createNewPlan}
      class="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-600 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-900 bg-white dark:bg-slate-950 hover:text-primary-600 dark:hover:text-primary-400 transition-all group w-full text-left shadow-sm"
    >
      <div
        class="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-md transition-all"
      >
        <Plus size={32} />
      </div>
      <div class="text-center">
        <p class="font-bold">Plan hinzufügen</p>
        <p class="text-xs">Erstelle einen neuen 2-Monats-Zeitraum</p>
      </div>
    </button>
  </div>
</div>
