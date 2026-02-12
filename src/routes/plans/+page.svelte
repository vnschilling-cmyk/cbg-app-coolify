<script lang="ts">
    import {
        Plus,
        Calendar,
        FileText,
        ArrowRight,
        Clock,
        CheckCircle2,
        Trash2,
    } from "lucide-svelte";
    import { enhance } from "$app/forms";
    import { format, startOfMonth, addMonths, endOfMonth } from "date-fns";
    import { de } from "date-fns/locale";

    import { pb } from "$lib/pocketbase";
    import { goto } from "$app/navigation";

    let { data } = $props();

    let plans = $state<any[]>([]);

    $effect(() => {
        plans = data.plans || [];
    });

    async function createNewPlan() {
        // Calculate next 2 months
        const now = new Date();
        const start = startOfMonth(addMonths(now, 1));
        const end = endOfMonth(addMonths(start, 1));

        try {
            // Assuming 'pb' is globally available or imported elsewhere
            // If not, this line will cause an error.
            const newRecord = await pb.collection("plans").create({
                period_start: start.toISOString(),
                period_end: end.toISOString(),
                status: "draft",
                data: {},
            });

            goto(`/editor/${newRecord.id}`);
        } catch (e) {
            console.error("Failed to create plan:", e);
            alert("Fehler beim Erstellen des Plans.");
        }
    }

    function getStatusStyle(status: string) {
        switch (status) {
            case "draft":
                return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
            case "published":
                return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800";
            case "archived":
                return "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-600";
            default:
                return "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400";
        }
    }
</script>

<div
    class="p-8 max-w-7xl mx-auto w-full min-h-full transition-colors duration-300"
>
    <div class="flex items-center justify-between mb-10">
        <div>
            <h2
                class="text-3xl font-black text-zinc-900 dark:text-white tracking-tight"
            >
                Dienstpläne
            </h2>
            <p class="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
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
                class="group bg-white dark:bg-zinc-700 rounded-2xl border border-zinc-200 dark:border-zinc-600 p-6 shadow-sm hover:shadow-xl hover:shadow-primary-600/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
            >
                <div
                    class="absolute top-0 left-0 w-1 h-full bg-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
                ></div>

                <div class="flex items-start justify-between mb-4">
                    <div
                        class="w-12 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-700 flex items-center justify-center text-zinc-400 dark:text-zinc-500 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
                    >
                        <Calendar size={24} />
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border {getStatusStyle(
                                plan.status,
                            )}"
                        >
                            {#if plan.status === "draft"}
                                Entwurf
                            {:else}
                                {plan.status === "published"
                                    ? "Veröffentlicht"
                                    : "Archiviert"}
                            {/if}
                        </span>

                        <form
                            method="POST"
                            action="?/delete"
                            use:enhance={() => {
                                if (!confirm("Plan wirklich löschen?")) return;
                                return async ({ result }) => {
                                    if (result.type === "success") {
                                        plans = plans.filter(
                                            (p) => p.id !== plan.id,
                                        );
                                    }
                                };
                            }}
                        >
                            <input type="hidden" name="id" value={plan.id} />
                            <button
                                type="submit"
                                class="p-1.5 text-zinc-400 hover:text-red-600 transition-colors"
                                onclick={(e) => e.stopPropagation()}
                                title="Plan löschen"
                            >
                                <Trash2 size={16} />
                            </button>
                        </form>
                    </div>
                </div>

                <h3
                    class="text-xl font-bold text-zinc-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors mb-1"
                >
                    {plan.name}
                </h3>

                <div
                    class="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 text-sm mb-6"
                >
                    <Clock size={14} />
                    <span
                        >Bearbeitet am {format(
                            plan.lastModified,
                            "dd. MMM yyyy",
                            {
                                locale: de,
                            },
                        )}</span
                    >
                </div>

                <!-- Progress Bar -->
                <div class="mb-6">
                    <div
                        class="flex items-center justify-between text-xs font-bold mb-1.5 uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
                    >
                        <span>Vollständigkeit</span>
                        <span class="text-zinc-700 dark:text-zinc-300"
                            >{plan.progress}%</span
                        >
                    </div>
                    <div
                        class="h-2 w-full bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden"
                    >
                        <div
                            class="h-full bg-primary-600 rounded-full transition-all duration-1000"
                            style="width: {plan.progress}%"
                        ></div>
                    </div>
                </div>

                <div
                    class="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-600/50"
                >
                    <span
                        class="text-xs font-bold text-primary-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
                    >
                        Öffnen <ArrowRight size={14} />
                    </span>
                    <div class="flex -space-x-2">
                        {#each [1, 2, 3] as _}
                            <div
                                class="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400"
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
            class="border-2 border-dashed border-zinc-200 dark:border-zinc-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 text-zinc-400 dark:text-zinc-600 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-zinc-800 bg-white dark:bg-zinc-700 hover:text-primary-600 dark:hover:text-primary-400 transition-all group w-full text-left shadow-sm"
        >
            <div
                class="w-16 h-16 rounded-full bg-zinc-50 dark:bg-zinc-700 flex items-center justify-center group-hover:bg-white dark:group-hover:bg-zinc-700 group-hover:shadow-md transition-all"
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
