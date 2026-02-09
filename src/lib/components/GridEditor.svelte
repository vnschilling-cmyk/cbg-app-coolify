<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Calendar,
    Save,
    Download,
    Printer,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    User,
    Wine,
    X,
  } from "lucide-svelte";
  import { invalidateAll } from "$app/navigation";
  import {
    format,
    addMonths,
    addDays,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isWednesday,
    isFriday,
    isSaturday,
    isSunday,
    isFirstDayOfMonth,
  } from "date-fns";
  import { de } from "date-fns/locale";

  // Props from server
  interface ServerSlot {
    id: string;
    date: string;
    time: string;
    label: string;
    calendar?: string;
    isSundaySecond?: boolean;
  }

  interface ServerPreacher {
    id: number;
    firstName: string;
    lastName: string;
    role: string;
  }

  interface ServerAbsence {
    id: string;
    personId: number;
    startDate: string;
    endDate: string;
    reason?: string;
  }

  interface Props {
    serverSlots?: ServerSlot[];
    serverPreachers?: ServerPreacher[];
    serverAbsences?: ServerAbsence[];
  }

  let {
    serverSlots = [],
    serverPreachers = [],
    serverAbsences = [],
  }: Props = $props();

  let hoveredSlotIdx = $state<number | null>(null);
  let hoveredPreacherIdx = $state<number | null>(null);
  let deletedSlotIds = $state<string[]>([]);

  // Constants
  const SERVICE_TYPES = [
    {
      code: "L",
      label: "Leitung",
      color: "bg-blue-600 text-white shadow-sm shadow-blue-200",
    },
    {
      code: "1",
      label: "Predigt (10-15m)",
      color: "bg-emerald-600 text-white shadow-sm shadow-emerald-200",
    },
    {
      code: "2",
      label: "Predigt (30-40m)",
      color: "bg-violet-600 text-white shadow-sm shadow-violet-200",
    },
    {
      code: "BS",
      label: "Bibelstunde",
      color: "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-200",
    },
    {
      code: "GS",
      label: "Gebetstunde",
      color: "bg-amber-600 text-white shadow-sm shadow-amber-200",
    },
    {
      code: "V",
      label: "Verteilen",
      color: "bg-cyan-600 text-white shadow-sm shadow-cyan-200",
    },
    {
      code: "BN",
      label: "Bad Neustadt",
      color: "bg-lime-600 text-white shadow-sm shadow-lime-200",
    },
    {
      code: "Als",
      label: "Alsfeld",
      color: "bg-teal-600 text-white shadow-sm shadow-teal-200",
    },
    {
      code: "Anf",
      label: "Anfang",
      color: "bg-sky-600 text-white shadow-sm shadow-sky-200",
    },
    {
      code: "Schl",
      label: "Schluss",
      color: "bg-indigo-600 text-white shadow-sm shadow-indigo-200",
    },
    {
      code: "🍷",
      label: "Abendmahl",
      color: "bg-rose-600 text-white shadow-sm shadow-rose-200",
      isIcon: true,
    },
  ];

  // Transform server preachers or use fallback - using $derived for reactivity
  const fallbackPreachers = [
    { firstName: "Dietrich", lastName: "Auschew", role: "Teilnehmer" },
    { firstName: "Alexander", lastName: "Bockshorn", role: "Teilnehmer" },
    { firstName: "Christian", lastName: "Deder", role: "Teilnehmer 2" },
    { firstName: "Alexander", lastName: "Demler", role: "Leiter" },
    { firstName: "Konstantin", lastName: "Demler", role: "Teilnehmer" },
    { firstName: "Alexander", lastName: "Enns", role: "Teilnehmer" },
    { firstName: "Jakob", lastName: "Enns", role: "Teilnehmer" },
    { firstName: "Viktor", lastName: "Enns", role: "Leiter" },
    { firstName: "Viktor", lastName: "Enns", role: "Teilnehmer 2" },
    { firstName: "Christoph", lastName: "Hinsmann", role: "Teilnehmer 2" },
    { firstName: "Eduard", lastName: "Jeske", role: "Teilnehmer 2" },
    { firstName: "Edgar", lastName: "Kampen", role: "Teilnehmer 2" },
    { firstName: "Valerij", lastName: "Letkemann", role: "Teilnehmer" },
    { firstName: "Heinrich", lastName: "Lorenz", role: "Teilnehmer" },
    { firstName: "Manuel", lastName: "Lorenz", role: "Teilnehmer" },
    { firstName: "Andreas", lastName: "Müller", role: "Teilnehmer" },
    { firstName: "Christian", lastName: "Müller", role: "Teilnehmer 2" },
    { firstName: "David", lastName: "Penner", role: "Teilnehmer" },
    { firstName: "Jakob", lastName: "Penner", role: "Teilnehmer" },
    { firstName: "Nikolaj", lastName: "Sabirko", role: "Teilnehmer" },
    { firstName: "Viktor", lastName: "Schilling", role: "Leiter" },
    { firstName: "Gustav", lastName: "Schmidt", role: "Teilnehmer 2" },
    { firstName: "Michail", lastName: "Suzchniev", role: "Teilnehmer" },
    { firstName: "Florian", lastName: "Wiese", role: "Teilnehmer" },
  ];

  // Reactive preacher groups
  let group1 = $derived.by(() => {
    const preachers =
      serverPreachers.length > 0 ? serverPreachers : fallbackPreachers;
    return preachers
      .filter((p) => p.role === "Leiter" || p.role === "Teilnehmer")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  });

  let group2 = $derived.by(() => {
    const preachers =
      serverPreachers.length > 0 ? serverPreachers : fallbackPreachers;
    return preachers
      .filter((p) => p.role === "Teilnehmer 2")
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  });

  // Combined for cell logic
  let PREACHERS_FLAT = $derived(
    [...group1, ...group2].map((p) => `${p.firstName} ${p.lastName}`),
  );

  // Slots logic
  interface Slot {
    id: string;
    date: Date;
    time: string;
    label: string;
    calendar?: string;
    isSundaySecond?: boolean;
  }

  // Map preacher name to ID for absence lookup
  let preacherIdMap = $derived(
    new Map(
      serverPreachers.map((p) => [
        `${p.firstName} ${p.lastName}`,
        String(p.id),
      ]),
    ),
  );

  // Auto-fill absences
  $effect(() => {
    if (serverAbsences.length === 0 || slots.length === 0) return;

    // Build optimized lookup for absences: personId -> Set<dateString>
    const absenceLookup = new Map<string, Set<string>>();

    serverAbsences.forEach((a) => {
      const pid = String(a.personId);
      if (!pid) return;

      if (!absenceLookup.has(pid)) absenceLookup.set(pid, new Set());

      // Use a robust date parser for yyyy-MM-dd strings
      const [y, m, d] = a.startDate.split("-").map(Number);
      let curr = new Date(y, m - 1, d);

      const [ey, em, ed] = a.endDate.split("-").map(Number);
      const end = new Date(ey, em - 1, ed);

      // Safety break
      let steps = 0;
      while (curr <= end && steps < 365) {
        absenceLookup.get(pid)?.add(format(curr, "yyyy-MM-dd"));
        curr.setDate(curr.getDate() + 1);
        steps++;
      }
    });

    let hasUpdates = false;
    const newGridData = { ...gridData }; // Copy to avoid multiple trigger

    for (const slot of slots) {
      const slotDateStr = format(slot.date, "yyyy-MM-dd");

      for (const preacherName of PREACHERS_FLAT) {
        const pid = preacherIdMap.get(preacherName);

        // If person is absent and cell is empty -> set "-"
        if (pid && absenceLookup.get(pid)?.has(slotDateStr)) {
          if (!newGridData[slot.id]) newGridData[slot.id] = {};

          if (!newGridData[slot.id][preacherName]) {
            newGridData[slot.id][preacherName] = "-";
            hasUpdates = true;
          }
        }
      }
    }

    // Only update state if something changed
    if (hasUpdates) {
      gridData = newGridData;
    }
  });

  // State
  let selectedMonth = $state(new Date(2026, 2, 1)); // Start with March 2026
  let gridData = $state<Record<string, Record<string, string>>>({});

  // Transform server slots to internal format
  let slots = $derived.by(() => {
    if (serverSlots.length > 0) {
      // Use real server data
      const transformed: Slot[] = serverSlots.map((s) => {
        const date = new Date(s.date);
        // Detect if this is a second Sunday service (evening)
        const hour = parseInt(s.time.split(":")[0], 10);
        const isSundaySecond = isSunday(date) && hour >= 14;

        return {
          id: s.id,
          date,
          time: s.time,
          label: s.label,
          calendar: s.calendar,
          isSundaySecond,
        };
      });

      // Deduplicate: Keep only one entry per day, except Sundays (2 allowed: morning + evening)
      const seen = new Map<string, Slot[]>();
      for (const slot of transformed) {
        const dateKey = format(slot.date, "yyyy-MM-dd");
        if (!seen.has(dateKey)) {
          seen.set(dateKey, []);
        }
        seen.get(dateKey)!.push(slot);
      }

      const deduped: Slot[] = [];
      for (const [dateKey, daySlots] of seen.entries()) {
        const date = daySlots[0].date;
        if (isSunday(date)) {
          // Sundays: Keep morning (first) and evening (second) slots
          const morning = daySlots.find((s) => !s.isSundaySecond);
          const evening = daySlots.find((s) => s.isSundaySecond);
          if (morning) deduped.push(morning);
          if (evening) deduped.push(evening);
        } else {
          // Other days: Keep only the first slot (typically the main service)
          const mainSlot = daySlots[0];
          // Use a generic label based on the day
          if (isWednesday(date)) {
            mainSlot.label = "Gebetsstunde";
            mainSlot.time = "19:00";
          } else if (isFriday(date)) {
            mainSlot.label = "Bibelstunde";
            mainSlot.time = "19:00";
          }
          deduped.push(mainSlot);
        }
      }

      // Final filter: remove deleted ones and sort
      return deduped
        .filter((s) => !deletedSlotIds.includes(String(s.id)))
        .sort(
          (a, b) =>
            a.date.getTime() - b.date.getTime() || a.time.localeCompare(b.time),
        );
    }

    // Fallback: Return empty array if no server data
    return [];
  });

  function getCellKey(preacher: string, slotId: string) {
    return `${preacher}-${slotId}`;
  }

  // Determine which Sunday of the month (1st, 2nd, 3rd, 4th, 5th)
  function getNthSundayOfMonth(date: Date): number {
    const dayOfMonth = date.getDate();
    return Math.ceil(dayOfMonth / 7);
  }

  // Get allowed service types for a specific slot based on day/time rules
  function getAllowedTypesForSlot(slot: Slot): string[] {
    const date = slot.date;
    const time = slot.time;
    const hour = parseInt(time.split(":")[0], 10);

    // Wednesday (Mittwoch) - Only Als
    if (isWednesday(date)) {
      return ["Als"];
    }

    // Friday (Freitag) - BS, GS
    if (isFriday(date)) {
      return ["BS", "GS"];
    }

    // Sunday rules
    if (isSunday(date)) {
      const nthSunday = getNthSundayOfMonth(date);
      const isMorning = hour < 12; // 9:30 service
      const isEvening16 = hour >= 15 && hour < 17; // 16:00 service
      const isEvening17 = hour >= 17; // 17:00 service

      if (nthSunday === 1) {
        if (isMorning) {
          // 1. Sonntag 9:30: Kelch, L, 1, 2, V
          return ["🍷", "L", "1", "2", "V"];
        } else {
          // 1. Sonntag 17:00: L, 1, 2, Als
          return ["L", "1", "2", "Als"];
        }
      } else if (nthSunday === 2) {
        if (isMorning) {
          // 2. Sonntag 9:30: L, 1, 2, BN
          return ["L", "1", "2", "BN"];
        } else {
          // 2. Sonntag 17:00: L, 1, 2
          return ["L", "1", "2"];
        }
      } else if (nthSunday === 3) {
        if (isMorning) {
          // 3. Sonntag 9:30: L, 1, 2
          return ["L", "1", "2"];
        } else if (isEvening16) {
          // 3. Sonntag 16:00: Anf, Schl
          return ["Anf", "Schl"];
        } else {
          // 3. Sonntag 17:00: L, 1, 2
          return ["L", "1", "2"];
        }
      } else {
        // 4th, 5th Sunday: 9:30 and 17:00 - L, 1, 2
        return ["L", "1", "2"];
      }
    }

    // Default: all types
    return SERVICE_TYPES.map((s) => s.code);
  }

  // Persons allowed for specific service types
  const ABENDMAHL_PERSONS = [
    "Viktor Schilling",
    "Viktor Enns", // Leiter
    "Heinrich Lorenz",
  ];

  const VERTEILEN_PERSONS = [
    "Dietrich Auschew",
    "Viktor Enns", // Leiter
    "Alexander Enns",
    "Jakob Enns",
    "Valerij Letkemann",
    "Heinrich Lorenz",
    "David Penner",
    "Nikolaj Sabirko",
    "Viktor Schilling",
  ];

  // Filter allowed types based on person restrictions
  function getPersonAllowedTypes(
    slotTypes: string[],
    preacherName: string,
  ): string[] {
    return slotTypes.filter((code) => {
      // Abendmahl (🍷) - only specific persons
      if (code === "🍷" && !ABENDMAHL_PERSONS.includes(preacherName)) {
        return false;
      }
      // Verteilen (V) - only specific persons
      if (code === "V" && !VERTEILEN_PERSONS.includes(preacherName)) {
        return false;
      }
      return true;
    });
  }

  function toggleService(preacher: string, slotId: string) {
    // Find the slot to get allowed types
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    // Get slot-based allowed types, then filter by person
    const slotAllowedTypes = getAllowedTypesForSlot(slot);
    const allowedTypes = getPersonAllowedTypes(slotAllowedTypes, preacher);

    // If no types allowed for this person in this slot, do nothing
    if (allowedTypes.length === 0) return;

    if (!gridData[slotId]) gridData[slotId] = {};

    const current = gridData[slotId][preacher] || "";
    // Lock if preacher is absent (indicated by "-")
    if (current === "-") return;

    const currentIndex = allowedTypes.indexOf(current);

    if (currentIndex === -1) {
      // Not set or invalid - set to first allowed type
      gridData[slotId][preacher] = allowedTypes[0];
    } else if (currentIndex === allowedTypes.length - 1) {
      // Last type - clear
      delete gridData[slotId][preacher];
    } else {
      // Cycle to next allowed type
      gridData[slotId][preacher] = allowedTypes[currentIndex + 1];
    }
  }

  function getServiceStyle(code: string) {
    if (code === "-") return "bg-slate-100 text-slate-400";
    return SERVICE_TYPES.find((s) => s.code === code)?.color || "bg-white";
  }

  // Mock special events
  const specialEvents: Record<string, string> = {
    "2026-03-01": "Abendmahl",
    "2026-03-29": "Palmsonntag",
    "2026-04-05": "Ostern",
    "2026-04-12": "Nachversammlung",
  };

  function nextMonth() {
    selectedMonth = addMonths(selectedMonth, 2);
  }

  function prevMonth() {
    selectedMonth = addMonths(selectedMonth, -2);
  }

  let saving = $state(false);

  async function savePlan() {
    saving = true;
    // Simulate API call to Pocketbase
    await new Promise((r) => setTimeout(r, 1200));
    saving = false;
    alert("Plan erfolgreich gespeichert!");
  }

  let syncing = $state(false);

  async function syncData() {
    syncing = true;
    try {
      await invalidateAll();
    } catch (e) {
      console.error("Synchronisierung fehlgeschlagen:", e);
    } finally {
      syncing = false;
    }
  }

  function removeSlot(id: string) {
    console.log("Removing slot:", id);
    deletedSlotIds = [...deletedSlotIds, String(id)];
    hoveredSlotIdx = null;
  }

  // Portal toolbar to header on mount
  let toolbarRef: HTMLElement | null = null;
  let headerControlsOriginal: string = "";

  onMount(() => {
    if (typeof document === "undefined") return;
    const headerControls = document.getElementById("header-controls");
    if (headerControls && toolbarRef) {
      headerControlsOriginal = headerControls.innerHTML;
      headerControls.innerHTML = "";
      headerControls.appendChild(toolbarRef);
    }
  });

  onDestroy(() => {
    if (typeof document === "undefined") return;
    const headerControls = document.getElementById("header-controls");
    if (headerControls) {
      headerControls.innerHTML = headerControlsOriginal;
    }
  });
</script>

<div class="flex-1 h-full flex flex-col p-0 bg-slate-50 overflow-hidden">
  <!-- Toolbar - will be portaled to header -->
  <div bind:this={toolbarRef} class="flex items-center gap-4 no-print">
    <!-- Month Navigation -->
    <div
      class="bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex items-center gap-1"
    >
      <button
        onclick={prevMonth}
        class="p-1.5 hover:bg-slate-50 rounded-lg transition-all text-slate-400 hover:text-slate-900"
      >
        <ChevronLeft size={16} />
      </button>
      <div
        class="px-3 py-1 text-sm font-semibold text-slate-800 min-w-[140px] text-center"
      >
        {format(selectedMonth, "MMMM", { locale: de })} - {format(
          addMonths(selectedMonth, 1),
          "MMMM yyyy",
          { locale: de },
        )}
      </div>
      <button
        onclick={nextMonth}
        class="p-1.5 hover:bg-slate-50 rounded-lg transition-all text-slate-400 hover:text-slate-900"
      >
        <ChevronRight size={16} />
      </button>
    </div>

    <div class="h-5 w-px bg-slate-300"></div>

    <!-- Actions -->
    <a
      href="/print/1"
      target="_blank"
      class="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
      title="Druckansicht"
      aria-label="Druckansicht"
    >
      <Printer size={18} />
    </a>

    <button
      onclick={syncData}
      disabled={syncing}
      class="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
      title="Von ChurchTools synchronisieren"
      aria-label="Von ChurchTools synchronisieren"
    >
      <RefreshCw
        size={18}
        class={syncing ? "animate-spin text-primary-600" : ""}
      />
    </button>

    <button
      onclick={savePlan}
      disabled={saving}
      class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shadow-sm transition-all"
      title={saving ? "Wird gespeichert..." : "Plan speichern"}
      aria-label={saving ? "Wird gespeichert..." : "Plan speichern"}
    >
      {#if saving}
        <div
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></div>
      {:else}
        <Save size={18} />
      {/if}
    </button>
  </div>

  <!-- Grid Card Container -->
  <div
    class="flex-1 flex overflow-hidden bg-white border-y border-slate-200 relative"
  >
    <div class="flex-1 overflow-auto custom-scrollbar">
      <div class="min-w-full px-4 pb-4 pt-0 flex justify-center">
        <div class="inline-block align-top shadow-2xl shadow-slate-200/50">
          <table class="border-separate border-spacing-0">
            <thead>
              <!-- Row 1: Months -->
              <tr class="h-10">
                <th
                  class="sticky top-0 left-0 z-[120] bg-slate-100 border-r border-b border-slate-200 p-2 text-center min-w-[180px] shadow-[4px_4px_8px_-4px_rgba(0,0,0,0.1)]"
                >
                  <div class="flex flex-col items-start gap-1 px-1">
                    <span
                      class="text-[13px] font-black uppercase tracking-[0.2em] text-slate-900"
                    >
                      Prediger
                    </span>
                    <span class="text-[10px] text-slate-500 font-bold">
                      {selectedMonth?.toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </th>
                {#each [selectedMonth, addMonths(selectedMonth, 1)] as month}
                  {@const monthSlots = slots.filter(
                    (s) => s.date.getMonth() === month.getMonth(),
                  )}
                  {#if monthSlots.length > 0}
                    <th
                      colspan={monthSlots.length}
                      class="sticky top-0 z-[100] bg-slate-100 border-r border-b border-slate-200 p-2 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]"
                    >
                      <span
                        class="text-[16px] font-black uppercase tracking-[0.3em] text-slate-900"
                      >
                        {format(month, "MMMM", { locale: de })}
                      </span>
                    </th>
                  {/if}
                {/each}
              </tr>
              <!-- Row 2: Times -->
              <tr class="h-12">
                <th class="sticky top-[40px] left-0 z-[120] bg-white p-0">
                  <!-- Empty corner -->
                </th>
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[40px] z-[100] transition-colors border-r border-b border-slate-200 p-0 min-w-[32px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] {slot.isSundaySecond
                      ? 'border-l-0'
                      : ''} {hoveredSlotIdx === sIdx
                      ? 'bg-slate-200/50'
                      : 'bg-slate-50/90 backdrop-blur-md'}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                  >
                    <div class="relative w-full h-12">
                      <div
                        class="absolute top-2 left-1/2 -translate-x-1/2 text-[13px] font-bold tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-slate-900"
                      >
                        {slot.time}
                      </div>
                    </div>
                  </th>
                {/each}
              </tr>
              <!-- Row 3: Dates -->
              <tr class="h-16">
                <th class="sticky top-[88px] left-0 z-[120] bg-white p-0">
                  <!-- Empty corner -->
                </th>
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[88px] z-[100] transition-colors border-r border-b border-slate-200 p-0 min-w-[32px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] group {slot.isSundaySecond
                      ? 'border-l-0'
                      : ''} {hoveredSlotIdx === sIdx
                      ? 'bg-slate-200/50'
                      : 'bg-slate-50/90 backdrop-blur-md'}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                  >
                    <div class="relative w-full h-16">
                      <div
                        class="absolute bottom-3 left-1/2 -translate-x-1/2 text-[13px] font-bold tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-slate-900"
                      >
                        {format(slot.date, "dd. eee", { locale: de })}
                      </div>

                      <!-- Delete Column Button -->
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          removeSlot(slot.id);
                        }}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm z-[110]"
                        title="Spalte löschen"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="bg-white">
              {#each group1 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = pIdx}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-slate-50/40'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-slate-200 px-3 py-0 font-bold text-slate-900 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap text-[13px] h-9 transition-colors {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? 'bg-slate-200/50'
                      : (pIdx % 2 === 1 ? 'bg-slate-50/95' : 'bg-white/95') +
                        ' backdrop-blur-sm'}"
                  >
                    {preacherName}
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-slate-200 p-1 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {(hoveredPreacherIdx === absoluteRowIdx &&
                        hoveredSlotIdx !== null &&
                        sIdx <= hoveredSlotIdx) ||
                      (hoveredSlotIdx === sIdx &&
                        hoveredPreacherIdx !== null &&
                        absoluteRowIdx <= hoveredPreacherIdx)
                        ? code === '-'
                          ? 'bg-slate-100/30'
                          : 'bg-slate-200/50'
                        : ''}"
                      title={code === "-" ? "Abwesend (ChurchTools)" : ""}
                      onclick={() => toggleService(preacherName, slot.id)}
                      onmouseenter={() => {
                        hoveredSlotIdx = sIdx;
                        hoveredPreacherIdx = absoluteRowIdx;
                      }}
                      onmouseleave={() => {
                        hoveredSlotIdx = null;
                        hoveredPreacherIdx = null;
                      }}
                    >
                      <div
                        class="w-8 h-7 flex items-center justify-center font-bold text-[16px] transition-all active:scale-95 rounded-xl {getServiceStyle(
                          code,
                        )}"
                      >
                        {code}
                      </div>
                    </td>
                  {/each}
                </tr>
              {/each}

              <!-- Separator Row -->
              <tr class="h-2 bg-slate-50">
                <td
                  class="sticky left-0 z-[90] bg-slate-50/95 backdrop-blur-sm border-r border-b border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]"
                ></td>
                {#each slots as slot}
                  <td class="border-b border-r border-slate-100 bg-slate-50"
                  ></td>
                {/each}
              </tr>

              {#each group2 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = group1.length + pIdx + 1}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-slate-50/40'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-slate-200 px-3 py-0 font-bold text-slate-900 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap text-[13px] h-9 transition-colors {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? 'bg-slate-200/50'
                      : (pIdx % 2 === 1 ? 'bg-slate-50/95' : 'bg-white/95') +
                        ' backdrop-blur-sm'}"
                  >
                    {preacherName}
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-slate-200 p-1 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {(hoveredPreacherIdx === absoluteRowIdx &&
                        hoveredSlotIdx !== null &&
                        sIdx <= hoveredSlotIdx) ||
                      (hoveredSlotIdx === sIdx &&
                        hoveredPreacherIdx !== null &&
                        absoluteRowIdx <= hoveredPreacherIdx)
                        ? code === '-'
                          ? 'bg-slate-100/30'
                          : 'bg-slate-200/50'
                        : ''}"
                      title={code === "-" ? "Abwesend (ChurchTools)" : ""}
                      onclick={() => toggleService(preacherName, slot.id)}
                      onmouseenter={() => {
                        hoveredSlotIdx = sIdx;
                        hoveredPreacherIdx = absoluteRowIdx;
                      }}
                      onmouseleave={() => {
                        hoveredSlotIdx = null;
                        hoveredPreacherIdx = null;
                      }}
                    >
                      <div
                        class="w-8 h-7 flex items-center justify-center font-bold text-[16px] transition-all active:scale-95 rounded-xl {getServiceStyle(
                          code,
                        )}"
                      >
                        {code}
                      </div>
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Right Side Legend -->
    <div
      class="w-56 bg-white border-l border-slate-100 p-4 overflow-y-auto no-print flex flex-col gap-3 z-10 shadow-[-4px_0_16px_rgba(0,0,0,0.02)]"
    >
      <div
        class="p-4 rounded-2xl border border-slate-100 shadow-sm bg-slate-50/50"
      >
        <h3
          class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 px-1"
        >
          Legende
        </h3>
        <div class="flex flex-col gap-2">
          {#each SERVICE_TYPES as type}
            <div
              class="group flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-md hover:shadow-slate-200/50 transition-all border border-transparent hover:border-slate-100 bg-white"
            >
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 {type.color}"
              >
                {type.code}
              </div>
              <div class="flex flex-col">
                <span
                  class="text-[11px] font-bold text-slate-800 leading-none mb-1"
                  >{type.label}</span
                >
                <span
                  class="text-[9px] text-slate-400 font-medium uppercase tracking-wider"
                  >Dienst</span
                >
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @reference "../../app.css";

  /* Prevent focus outline on click-heavy interface */
  :root {
    -webkit-tap-highlight-color: transparent;
  }

  /* Custom scrollbar for better look */
  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f5f9; /* slate-100 */
    border-radius: 0;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    @apply bg-slate-300 rounded-full border-4 border-slate-100;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    @apply bg-slate-400;
  }

  /* Transition for table shadows */
  tr td.sticky,
  tr th.sticky {
    transition: box-shadow 0.2s;
  }
</style>
