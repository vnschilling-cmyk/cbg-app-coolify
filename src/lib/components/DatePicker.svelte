<script lang="ts">
    import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-svelte";
    import { fade, scale } from "svelte/transition";

    interface Props {
        value: string; // ISO format (YYYY-MM-DD)
        onchange: (value: string) => void;
        label?: string;
    }

    let { value, onchange, label }: Props = $props();

    let showPicker = $state(false);
    let viewDate = $state(value ? new Date(value) : new Date());

    // Update viewDate if value changes from outside
    $effect(() => {
        if (value) viewDate = new Date(value);
    });

    // Computed: Days of the current view month
    let monthData = $derived.by(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // First day of month
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Days in previous month to show (fill the week)
        const prevDaysCount = (firstDay.getDay() + 6) % 7; // Monday = 0
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        const days = [];

        // Previous month days
        for (let i = prevDaysCount - 1; i >= 0; i--) {
            days.push({
                day: prevMonthLastDay - i,
                month: month - 1,
                year: year,
                currentMonth: false,
            });
        }

        // Current month days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push({
                day: i,
                month: month,
                year: year,
                currentMonth: true,
            });
        }

        // Next month days to fill 42 cells (6 rows)
        const nextDaysCount = 42 - days.length;
        for (let i = 1; i <= nextDaysCount; i++) {
            days.push({
                day: i,
                month: month + 1,
                year: year,
                currentMonth: false,
            });
        }

        return days;
    });

    const monthNames = [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
    ];

    const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

    function nextMonth() {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    }

    function prevMonth() {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    }

    function selectDate(d: { day: number; month: number; year: number }) {
        const date = new Date(d.year, d.month, d.day);
        // Use local date parts to avoid timezone shift (e.g. 2024-02-12 local -> 2024-02-11 UTC)
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const formatted = `${y}-${m}-${day}`;
        onchange(formatted);
        showPicker = false;
    }

    function isSelected(d: { day: number; month: number; year: number }) {
        if (!value) return false;
        const sel = new Date(value);
        return (
            d.day === sel.getDate() &&
            d.month === sel.getMonth() &&
            d.year === sel.getFullYear()
        );
    }

    function isToday(d: { day: number; month: number; year: number }) {
        const today = new Date();
        return (
            d.day === today.getDate() &&
            d.month === today.getMonth() &&
            d.year === today.getFullYear()
        );
    }

    let displayDate = $derived.by(() => {
        if (!value) return label || "Datum wählen";
        return new Date(value).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    });
</script>

<div class="relative inline-block">
    <button
        onclick={() => (showPicker = !showPicker)}
        class="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-primary-500 dark:hover:border-primary-400 transition-all shadow-sm active:scale-95 group"
    >
        <CalendarDays
            size={14}
            class="text-zinc-400 group-hover:text-primary-500"
        />
        <span class="text-xs font-bold text-zinc-700 dark:text-zinc-200">
            {displayDate}
        </span>
    </button>

    {#if showPicker}
        <!-- Backdrop -->
        <div
            class="fixed inset-0 z-[110]"
            onclick={() => (showPicker = false)}
        ></div>

        <!-- Popover -->
        <div
            class="absolute top-full mt-3 left-0 sm:left-auto sm:right-0 w-72 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl z-[120] p-4 select-none overflow-hidden"
            in:scale={{ duration: 200, start: 0.95 }}
            out:fade={{ duration: 150 }}
        >
            <!-- Header -->
            <div class="flex items-center justify-between mb-4">
                <button
                    onclick={prevMonth}
                    class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors"
                >
                    <ChevronLeft size={18} />
                </button>

                <div
                    class="text-sm font-black text-zinc-800 dark:text-white tracking-tight"
                >
                    {monthNames[viewDate.getMonth()]}
                    {viewDate.getFullYear()}
                </div>

                <button
                    onclick={nextMonth}
                    class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            <!-- Weekdays -->
            <div class="grid grid-cols-7 mb-2">
                {#each weekDays as day}
                    <div
                        class="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 text-center uppercase tracking-widest"
                    >
                        {day}
                    </div>
                {/each}
            </div>

            <!-- Days Grid -->
            <div class="grid grid-cols-7 gap-1">
                {#each monthData as d}
                    <button
                        onclick={() => selectDate(d)}
                        class="aspect-square flex items-center justify-center text-xs font-bold rounded-xl transition-all
                            {d.currentMonth
                            ? 'text-zinc-700 dark:text-zinc-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600'
                            : 'text-zinc-300 dark:text-zinc-600'}
                            {isSelected(d)
                            ? '!bg-primary-600 !text-white shadow-lg shadow-primary-500/30'
                            : ''}
                            {isToday(d) && !isSelected(d)
                            ? 'border-2 border-primary-500/30'
                            : ''}"
                    >
                        {d.day}
                    </button>
                {/each}
            </div>

            <!-- Footer Tools -->
            <div
                class="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-700 flex justify-between items-center px-1"
            >
                <button
                    onclick={() =>
                        selectDate({
                            day: new Date().getDate(),
                            month: new Date().getMonth(),
                            year: new Date().getFullYear(),
                        })}
                    class="text-[10px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
                >
                    Heute
                </button>
                <button
                    onclick={() => {
                        onchange("");
                        showPicker = false;
                    }}
                    class="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 hover:text-red-500 transition-colors"
                >
                    Löschen
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    /* Pulse effect for selected day could be added here if needed */
</style>
