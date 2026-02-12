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
    serverAssignments?: Record<string, Record<string, string>>;
  }

  let {
    serverSlots = [],
    serverPreachers = [],
    serverAbsences = [],
    serverAssignments = {},
  }: Props = $props();

  let hoveredSlotIdx = $state<number | null>(null);
  let hoveredPreacherIdx = $state<number | null>(null);
  let deletedSlotIds = $state<string[]>([]);
  let showLegend = $state(false);

  // Constants
  const SERVICE_TYPES = [
    {
      code: "L",
      label: "Leitung",
      color: "bg-blue-600 text-white",
    },
    {
      code: "1",
      label: "Predigt (10-15m)",
      color: "bg-emerald-600 text-white",
    },
    {
      code: "2",
      label: "Predigt (30-40m)",
      color: "bg-violet-600 text-white",
    },
    {
      code: "BS",
      label: "Bibelstunde",
      color: "bg-fuchsia-600 text-white",
    },
    {
      code: "GS",
      label: "Gebetstunde",
      color: "bg-amber-600 text-white",
    },
    {
      code: "V",
      label: "Verteilen",
      color: "bg-cyan-600 text-white",
    },
    {
      code: "BN",
      label: "Bad Neustadt",
      color: "bg-lime-600 text-white",
    },
    {
      code: "Als",
      label: "Alsfeld",
      color: "bg-teal-600 text-white",
    },
    {
      code: "Anf",
      label: "Anfang",
      color: "bg-sky-600 text-white",
    },
    {
      code: "Schl",
      label: "Schluss",
      color: "bg-indigo-600 text-white",
    },
    {
      code: "🍷",
      label: "Abendmahl",
      color: "bg-rose-600 text-white",
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

    // 1. Apply absences
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

    // 2. Apply server assignments (pre-filled data)
    for (const slotId in serverAssignments) {
      if (!newGridData[slotId]) newGridData[slotId] = {};
      for (const preacherName in serverAssignments[slotId]) {
        if (!newGridData[slotId][preacherName]) {
          newGridData[slotId][preacherName] =
            serverAssignments[slotId][preacherName];
          hasUpdates = true;
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
          // Other days: Keep only the first slot to avoid duplicates
          const s = daySlots[0];
          if (isWednesday(date)) {
            s.label =
              s.label === "Unbenannter Termin" ? "Gebetsstunde" : s.label;
            s.time = s.time === "00:00" ? "19:00" : s.time;
          } else if (isFriday(date)) {
            s.label =
              s.label === "Unbenannter Termin" ? "Bibelstunde" : s.label;
            s.time = s.time === "00:00" ? "19:00" : s.time;
          }
          deduped.push(s);
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
    if (code === "-")
      return "bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors";
    return (
      SERVICE_TYPES.find((s) => s.code === code)?.color ||
      "bg-white dark:bg-slate-800"
    );
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

<div
  class="flex-1 h-full flex flex-col p-0 bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300"
>
  <!-- Toolbar - will be portaled to header -->
  <div bind:this={toolbarRef} class="flex items-center gap-4 no-print">
    <!-- Month Navigation -->
    <div
      class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-1 flex items-center gap-1"
    >
      <button
        onclick={prevMonth}
        class="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <ChevronLeft size={16} />
      </button>
      <div
        class="px-3 py-1 text-sm font-semibold text-slate-800 dark:text-slate-200 min-w-[140px] text-center"
      >
        {format(selectedMonth, "MMMM", { locale: de })} - {format(
          addMonths(selectedMonth, 1),
          "MMMM yyyy",
          { locale: de },
        )}
      </div>
      <button
        onclick={nextMonth}
        class="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <ChevronRight size={16} />
      </button>
    </div>

    <div class="h-5 w-px bg-slate-300 dark:bg-slate-700"></div>

    <!-- Actions -->
    <a
      href="/print/1"
      target="_blank"
      class="flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
      title="Druckansicht"
      aria-label="Druckansicht"
    >
      <Printer size={18} />
    </a>

    <button
      onclick={syncData}
      disabled={syncing}
      class="flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
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

    <!-- Legend Toggle (Mobile only) -->
    <button
      onclick={() => (showLegend = !showLegend)}
      class="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
      title="Legende anzeigen"
      aria-label="Legende anzeigen"
    >
      <div class="p-1 rounded bg-slate-100 dark:bg-slate-800">
        <div class="grid grid-cols-2 gap-0.5">
          <div class="w-1.5 h-1.5 rounded-sm bg-blue-500"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-emerald-500"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-violet-500"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-amber-500"></div>
        </div>
      </div>
    </button>
  </div>

  <!-- Grid Card Container -->
  <div
    class="flex-1 flex overflow-hidden bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700 relative transition-colors duration-300"
  >
    <div class="flex-1 overflow-auto custom-scrollbar">
      <div class="min-w-full px-4 pb-4 pt-0 flex justify-start">
        <div
          class="inline-block align-top shadow-2xl shadow-slate-200/50 dark:shadow-black/50"
        >
          <table class="border-separate border-spacing-0">
            <thead>
              <!-- Row 1: Months -->
              <tr class="h-10">
                <th
                  class="sticky top-0 left-0 z-[120] bg-slate-100 dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 p-2 text-center min-w-[180px] shadow-[4px_4px_8px_-4px_rgba(0,0,0,0.1)] transition-colors duration-300"
                >
                  <div class="flex flex-col items-start gap-1 px-1">
                    <span
                      class="text-[13px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white"
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
                {#each [...new Set(slots.map( (s) => s.date.getMonth(), ))] as mIdx}
                  {@const monthDate = slots.find(
                    (s) => s.date.getMonth() === mIdx,
                  )?.date}
                  {@const monthSlots = slots.filter(
                    (s) => s.date.getMonth() === mIdx,
                  )}
                  <th
                    colspan={monthSlots.length}
                    class="sticky top-0 z-[100] bg-slate-100 dark:bg-slate-900 border-r border-b border-slate-200 dark:border-slate-800 p-2 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors duration-300"
                  >
                    <span
                      class="text-[16px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white"
                    >
                      {monthDate
                        ? format(monthDate, "MMMM", { locale: de })
                        : ""}
                    </span>
                  </th>
                {/each}
              </tr>
              <!-- Row 2: Times -->
              <tr class="h-12">
                <th
                  class="sticky top-[40px] left-0 z-[120] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-0 transition-colors duration-300"
                >
                  <!-- Empty corner -->
                </th>
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[40px] z-[100] transition-colors border-r border-b border-slate-200 dark:border-slate-800 p-0 min-w-[32px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] {slot.isSundaySecond
                      ? 'border-l-0'
                      : ''} {hoveredSlotIdx === sIdx
                      ? 'bg-slate-200/50 dark:bg-slate-800/80'
                      : 'bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md'}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                  >
                    <div class="relative w-full h-12">
                      <div
                        class="absolute top-2 left-1/2 -translate-x-1/2 text-[13px] font-bold tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-slate-900 dark:text-slate-100"
                      >
                        {slot.time}
                      </div>
                    </div>
                  </th>
                {/each}
              </tr>
              <!-- Row 3: Dates -->
              <tr class="h-16">
                <th
                  class="sticky top-[88px] left-0 z-[120] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-0 transition-colors duration-300"
                >
                  <!-- Empty corner -->
                </th>
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[88px] z-[100] transition-colors border-r border-b border-slate-200 dark:border-slate-800 p-0 min-w-[32px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] group {slot.isSundaySecond
                      ? 'border-l-0'
                      : ''} {hoveredSlotIdx === sIdx
                      ? 'bg-slate-200/50 dark:bg-slate-800/80'
                      : 'bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md'}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                  >
                    <div class="relative w-full h-16">
                      <div
                        class="absolute bottom-3 left-1/2 -translate-x-1/2 text-[13px] font-bold tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-slate-900 dark:text-slate-100"
                      >
                        {format(slot.date, "dd. eee", { locale: de })}
                      </div>

                      <!-- Delete Column Button -->
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          removeSlot(slot.id);
                        }}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm z-[110]"
                        title="Spalte löschen"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-slate-800">
              {#each group1 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = pIdx}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-slate-50/40 dark:bg-slate-900/20'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-slate-200 dark:border-slate-700 px-3 py-0 font-bold text-slate-900 dark:text-slate-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap text-[13px] h-9 transition-colors {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? 'bg-slate-200/50 dark:bg-slate-800/80'
                      : (pIdx % 2 === 1
                          ? 'bg-slate-50/95 dark:bg-slate-900/95'
                          : 'bg-white/95 dark:bg-slate-900/95') +
                        ' backdrop-blur-sm'}"
                  >
                    {preacherName}
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-slate-200 dark:border-slate-700 p-1 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {(hoveredPreacherIdx === absoluteRowIdx &&
                        hoveredSlotIdx !== null &&
                        sIdx <= hoveredSlotIdx) ||
                      (hoveredSlotIdx === sIdx &&
                        hoveredPreacherIdx !== null &&
                        absoluteRowIdx <= hoveredPreacherIdx)
                        ? code === '-'
                          ? 'bg-slate-100/30 dark:bg-slate-700/30'
                          : 'bg-slate-200/50 dark:bg-slate-700/50'
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
                      {#if code}
                        <div
                          class="w-8 h-7 flex items-center justify-center font-bold text-[16px] transition-all active:scale-95 rounded-xl {getServiceStyle(
                            code,
                          )}"
                        >
                          {code}
                        </div>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}

              <!-- Separator Row -->
              <tr class="h-2 bg-slate-50 dark:bg-slate-900/50">
                <td
                  class="sticky left-0 z-[90] bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-r border-b border-slate-200 dark:border-slate-700 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]"
                ></td>
                {#each slots as slot}
                  <td
                    class="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50"
                  ></td>
                {/each}
              </tr>

              {#each group2 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = group1.length + pIdx + 1}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-slate-50/40 dark:bg-slate-900/20'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-slate-200 dark:border-slate-700 px-3 py-0 font-bold text-slate-900 dark:text-slate-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap text-[13px] h-9 transition-colors {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? 'bg-slate-200/50 dark:bg-slate-800/80'
                      : (pIdx % 2 === 1
                          ? 'bg-slate-50/95 dark:bg-slate-900/95'
                          : 'bg-white/95 dark:bg-slate-900/95') +
                        ' backdrop-blur-sm'}"
                  >
                    {preacherName}
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-slate-200 dark:border-slate-700 p-1 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {(hoveredPreacherIdx === absoluteRowIdx &&
                        hoveredSlotIdx !== null &&
                        sIdx <= hoveredSlotIdx) ||
                      (hoveredSlotIdx === sIdx &&
                        hoveredPreacherIdx !== null &&
                        absoluteRowIdx <= hoveredPreacherIdx)
                        ? code === '-'
                          ? 'bg-slate-100/30 dark:bg-slate-700/30'
                          : 'bg-slate-200/50 dark:bg-slate-700/50'
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
                      {#if code}
                        <div
                          class="w-8 h-7 flex items-center justify-center font-bold text-[16px] transition-all active:scale-95 rounded-xl {getServiceStyle(
                            code,
                          )}"
                        >
                          {code}
                        </div>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Right Side Legend (Desktop) -->
    <div
      class="hidden lg:flex w-56 bg-white dark:bg-slate-800 border-l border-slate-100 dark:border-slate-700 p-4 overflow-y-auto no-print flex flex-col gap-3 z-10 shadow-[-4px_0_16px_rgba(0,0,0,0.02)]"
    >
      <div
        class="p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        <h3
          class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-4 px-1"
        >
          Legende
        </h3>
        <div class="flex flex-col gap-2">
          {#each SERVICE_TYPES as type}
            <div
              class="group flex items-center gap-3 p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 hover:shadow-md hover:shadow-slate-200/50 dark:hover:shadow-black/50 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
            >
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 {type.color}"
              >
                {type.code}
              </div>
              <div class="flex flex-col">
                <span
                  class="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-none mb-1"
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

    <!-- Mobile Legend Drawer Overlay -->
    {#if showLegend}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] no-print"
        onclick={() => (showLegend = false)}
      >
        <div
          class="absolute right-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-800 shadow-2xl flex flex-col p-6 overflow-y-auto"
          onclick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between mb-8">
            <h3
              class="text-xs font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white"
            >
              Legende
            </h3>
            <button
              onclick={() => (showLegend = false)}
              class="p-2 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div class="flex flex-col gap-3">
            {#each SERVICE_TYPES as type}
              <div
                class="flex items-center gap-4 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold {type.color}"
                >
                  {type.code}
                </div>
                <div class="flex flex-col">
                  <span
                    class="text-[13px] font-bold text-slate-800 dark:text-slate-100"
                    >{type.label}</span
                  >
                  <span
                    class="text-[10px] text-slate-400 font-medium uppercase tracking-wider"
                  >
                    Dienst
                  </span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @reference "../../app.css";

  /* Prevent focus outline on click-heavy interface */
  :root {
    -webkit-tap-highlight-color: transparent;
  }

  .dark {
    --scrollbar-track: #0f172a; /* slate-900 */
    --scrollbar-thumb: #334155; /* slate-700 */
    --scrollbar-thumb-hover: #475569; /* slate-600 */
  }

  :root:not(.dark) {
    --scrollbar-track: #f1f5f9; /* slate-100 */
    --scrollbar-thumb: #cbd5e1; /* slate-300 */
    --scrollbar-thumb-hover: #94a3b8; /* slate-400 */
  }

  /* Custom scrollbar for better look */
  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 0;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 9999px;
    border: 4px solid var(--scrollbar-track);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Transition for table shadows */
  tr td.sticky,
  tr th.sticky {
    transition: box-shadow 0.2s;
  }
</style>
