<script lang="ts">
  import { toast, confirm } from "$lib/notifications.svelte";
  import { onMount, onDestroy } from "svelte";
  import {
    Calendar,
    Save,
    Download,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    User,
    Wine,
    X,
    Trash2,
    Share,
    Plus,
    PlusCircle,
    Clock,
    Star,
    Bold,
    Italic,
    Type,
    Settings2,
    FileText,
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
    getDate,
    getMonth,
    getYear,
  } from "date-fns";
  import { de } from "date-fns/locale";
  import DatePicker from "./DatePicker.svelte";

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
    id: string | number;
    firstName: string;
    lastName: string;
    role: string;
    allowed_services?: string[];
  }

  interface ServerAbsence {
    id: string;
    personId: number;
    fullName?: string; // Add this
    startDate: string;
    endDate: string;
    reason?: string;
  }

  interface Props {
    planId?: string;
    serverSlots?: ServerSlot[];
    serverPreachers?: ServerPreacher[];
    serverAbsences?: ServerAbsence[];
    serverAssignments?: Record<string, Record<string, string>>;
    serverFormatting?: any;
    serverServiceRules?: any[];
  }

  import ExportPreview from "./ExportPreview.svelte";

  let {
    planId = "",
    serverSlots = [],
    serverPreachers = [],
    serverAbsences = [],
    serverAssignments = {},
    serverFormatting = null,
    serverServiceRules = [],
  }: Props = $props();

  let hoveredSlotIdx = $state<number | null>(null);
  let hoveredPreacherIdx = $state<number | null>(null);
  let hoveredSpecialServiceId = $state<string | null>(null);
  let deletedSlotIds = $state<string[]>([]);
  let showLegend = $state(false);
  let exportResults = $state<{
    success: boolean;
    message: string;
    results: string[];
  } | null>(null);
  let showExportModal = $state(false);
  let showFormatting = $state(false);
  let activeFontSelector = $state<string | null>(null);
  let manualSlots = $state<Slot[]>([]);
  let showManualSlotEntry = $state(false);
  let newSlotDate = $state(format(new Date(), "yyyy-MM-dd"));
  let newSlotTime = $state("10:00");
  let specialServices = $state<Record<string, string>>({});
  let editingSpecialService = $state<string | null>(null);

  // Formatting state
  let formatting = $state({
    names: { bold: true, italic: false, fontSize: 13, fontFamily: "Inter" },
    entries: { bold: true, italic: false, fontSize: 14, fontFamily: "Inter" },
    dates: { bold: true, italic: false, fontSize: 12, fontFamily: "Inter" },
    months: { bold: true, italic: false, fontSize: 16, fontFamily: "Inter" },
  });

  // Load from localStorage or Server on mount
  onMount(() => {
    let loaded = false;
    if (typeof localStorage !== "undefined" && planId) {
      const saved = localStorage.getItem(`formatting_${planId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.assign(formatting, parsed);
          loaded = true;
        } catch (e) {
          console.error("Failed to parse formatting from localStorage", e);
        }
      }
    }

    if (!loaded && serverFormatting) {
      Object.assign(formatting, serverFormatting);
    }

    // Load special services
    if (typeof localStorage !== "undefined" && planId) {
      const savedSpecial = localStorage.getItem(`specialServices_${planId}`);
      if (savedSpecial) {
        try {
          specialServices = JSON.parse(savedSpecial);
        } catch (e) {
          console.error("Failed to parse specialServices from localStorage", e);
        }
      }
    }
  });

  // Save to localStorage when formatting changes
  $effect(() => {
    if (typeof localStorage !== "undefined" && planId) {
      localStorage.setItem(`formatting_${planId}`, JSON.stringify(formatting));
      localStorage.setItem(
        `specialServices_${planId}`,
        JSON.stringify(specialServices),
      );
    }
  });

  function checkOverflow(node: HTMLElement, text: string) {
    function update() {
      const isOverflowing = node.scrollWidth > node.clientWidth;
      if (isOverflowing) {
        node.classList.add("liveticker-content");
      } else {
        node.classList.remove("liveticker-content");
      }
    }

    update();
    // Re-check on text change or resize
    window.addEventListener("resize", update);

    return {
      update() {
        update();
      },
      destroy() {
        window.removeEventListener("resize", update);
      },
    };
  }

  const FONT_FAMILIES = [
    { label: "Sans", value: "Inter" },
    { label: "Montserrat", value: "Montserrat Alternates" },
    { label: "Quicksand", value: "Quicksand" },
    { label: "Jura", value: "Jura" },
    { label: "Gruppo", value: "Gruppo" },
    { label: "Poiret", value: "Poiret One" },
    { label: "Scope", value: "Scope One" },
    { label: "Tinos", value: "Tinos" },
    { label: "Alumni", value: "Alumni Sans Pinstripe" },
  ];

  function getFormattingStyle(section: keyof typeof formatting) {
    const s = formatting[section];
    return `font-weight: ${s.bold ? "bold" : "normal"}; font-style: ${s.italic ? "italic" : "normal"}; font-size: ${s.fontSize}px; font-family: '${s.fontFamily}', sans-serif;`;
  }

  // State - Moved to top to avoid ReferenceError
  let selectedMonth = $state(new Date(2026, 2, 1)); // Start with March 2026
  let gridData = $state<Record<string, Record<string, string>>>({});
  let showExport = $state(false);

  // Constants
  const SERVICE_TYPES = [
    {
      code: "🍷",
      label: "Abendmahl",
      color: "bg-rose-900 text-white",
      isIcon: true,
    },
    {
      code: "V",
      label: "Verteilen",
      color: "bg-rose-400 text-white",
    },
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
      code: "BN",
      label: "Bad Neustadt",
      color: "bg-lime-600 text-white",
    },
    {
      code: "Als",
      label: "Alsfeld",
      color: "bg-indigo-500 text-white",
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
    // Group 1: Leiter & Teilnehmer (including fallbacks)
    return preachers
      .filter(
        (p) =>
          p.role === "Leiter" ||
          p.role === "Teilnehmer" ||
          p.role === "admin" ||
          p.role === "user",
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName || ""));
  });

  let group2 = $derived.by(() => {
    const preachers =
      serverPreachers.length > 0 ? serverPreachers : fallbackPreachers;
    // Group 2: Teilnehmer 2
    return preachers
      .filter((p) => p.role === "Teilnehmer 2")
      .sort((a, b) => a.lastName.localeCompare(b.lastName || ""));
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
  // Map preacher name to ID for absence lookup
  let preacherIdMap = $derived(
    new Map(
      serverPreachers
        .filter((p) => p && p.firstName)
        .map((p) => [`${p.firstName} ${p.lastName || ""}`, String(p.id)]),
    ),
  );

  // --- HELPER: Easter Calculation (Meeus/Jones/Butcher) ---
  function getEaster(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    // Return NOON to avoid DST/timezone shifts
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  // --- HELPER: Holiday Detection ---
  function getHolidayName(date: Date): string | null {
    const d = date.getDate();
    const m = date.getMonth() + 1; // 1-based
    const y = date.getFullYear();
    const dateStr = `${d}.${m}.`;

    // Fixed Holidays
    if (dateStr === "1.1.") return "Neujahr";
    if (dateStr === "1.5.") return "Tag der Arbeit";
    if (dateStr === "3.10.") return "Tag der Deutschen Einheit";
    if (dateStr === "25.12.") return "1. Weihnachtsfeiertag";
    if (dateStr === "26.12.") return "2. Weihnachtsfeiertag";

    // Variable Holidays (Easter based)
    const easter = getEaster(y);

    const check = (offset: number, name: string) => {
      const h = addDays(easter, offset);
      if (h.getDate() === d && h.getMonth() + 1 === m) return name;
      return null;
    };

    if (check(0, "Ostersonntag")) return "Ostersonntag";
    if (check(-2, "Karfreitag")) return "Karfreitag";
    if (check(-3, "Gründonnerstag")) return "Gründonnerstag";
    if (check(1, "Ostermontag")) return "Ostermontag";
    if (check(39, "Christi Himmelfahrt")) return "Christi Himmelfahrt";
    if (check(49, "Pfingstsonntag")) return "Pfingstsonntag";
    if (check(50, "Pfingstmontag")) return "Pfingstmontag";

    return null;
  }

  // --- HELPER: Day Highlight Logic ---
  function getDayHighlightClass(date: Date, time: string): string {
    const specialClass = getSpecialSundayClass(date, time);
    if (specialClass) return specialClass;

    const holiday = getHolidayName(date);
    if (holiday) {
      return "";
    }

    return "";
  }

  // --- HELPER: Special Sunday & Communion Detection ---
  function getSpecialSundayClass(date: Date, time: string): string {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();

    const easter = getEaster(y);

    // Check if current date is one of the special days
    const isDay = (offset: number) => {
      const h = addDays(easter, offset);
      return h.getDate() === d && h.getMonth() + 1 === m;
    };

    const isEasterSunday = isDay(0);
    const isGoodFriday = isDay(-2);
    const isMaundyThursday = isDay(-3);

    // --- RULE 1: Special Afternoon (17:00) ---
    // Every EVEN month (Feb=1, Apr=3...) -> Odd Index in JS
    if (time === "17:00") {
      const monthIndex = date.getMonth(); // 0-11
      // Check for Even Calendar Month (Feb=1, Apr=3, Jun=5...) -> Odd Index 1, 3, 5...
      if (monthIndex % 2 !== 0) {
        return "";
      }
    }

    // 1st Sunday check
    const isFirstSunday = isSunday(date) && date.getDate() <= 7;

    // --- RULE 2: Communion (Abendmahl) ---
    // Every 1st Sunday (EXCEPT Easter) OR Maundy Thursday OR Good Friday
    // AND time must be appropriate? Usually main services.

    const isCommunionDay =
      (isFirstSunday && !isEasterSunday) || isMaundyThursday || isGoodFriday;

    if (isCommunionDay) {
      // Highlighting for Communion
      // Usually Morning Service (09:30 or 10:00)
      // For Maundy Thursday, it's evening (e.g. 19:00, 20:00)
      if (isMaundyThursday) {
        if (time >= "18:00") return "";
      } else if (isGoodFriday) {
        // Good Friday: Highlight ALL slots
        return "";
      } else {
        // Sunday Morning
        if (time === "09:30" || time === "10:00") return ""; // Rose for Abendmahl
      }
    }

    if (!isFirstSunday) return "";

    return "";
  }

  // --- VALIDATION LOGIC ---
  // Returns Set of preacher names that are invalid in this slot
  // Returns Set of preacher names that are invalid in this slot
  function validateSlot(
    slotId: string,
    data: Record<string, string>,
  ): Set<string> {
    const invalidPreachers = new Set<string>();
    const counts: Record<string, number> = {};
    const preachersByService: Record<string, string[]> = {};

    const slot = slots.find((s) => s.id === slotId);
    const rule = slot ? getRuleForSlot(slot) : null;
    const maxAssignments = rule?.max_assignments || {};

    // Count services
    for (const [preacher, service] of Object.entries(data)) {
      if (service === "-" || service === "X" || service === "") continue;

      counts[service] = (counts[service] || 0) + 1;
      if (!preachersByService[service]) preachersByService[service] = [];
      preachersByService[service].push(preacher);
    }

    // Check Rules
    for (const [service, count] of Object.entries(counts)) {
      let max = maxAssignments[service] || 1;
      // Legacy fallbacks if no rule found
      if (!rule) {
        if (service === "V") max = 3;
        else if (service === "BN") max = 2;
      }

      if (count > max) {
        preachersByService[service].forEach((p) => invalidPreachers.add(p));
      }
    }

    return invalidPreachers;
  }

  // Computed Validation State for the whole grid
  let validationState = $derived.by(() => {
    const state: Record<string, Set<string>> = {};
    for (const slotId in gridData) {
      state[slotId] = validateSlot(slotId, gridData[slotId]);
    }
    return state;
  });

  // Auto-fill absences
  $effect(() => {
    // Build optimized lookup for absences: personId -> Set<dateString>
    const absenceLookup = new Map<string, Set<string>>();

    serverAbsences.forEach((a) => {
      // KEY CHANGE: Use Name for lookup instead of ID
      // because PB ID != CT Person ID
      // and we don't have CT Person ID in PB yet
      const key = a.fullName || String(a.personId);

      if (!absenceLookup.has(key)) absenceLookup.set(key, new Set());

      // Use a robust date parser for yyyy-MM-dd strings
      const [y, m, d] = a.startDate.split("-").map(Number);
      let curr = new Date(y, m - 1, d);

      const [ey, em, ed] = a.endDate.split("-").map(Number);
      const end = new Date(ey, em - 1, ed);

      // Safety break
      let steps = 0;
      while (curr <= end && steps < 365) {
        absenceLookup.get(key)?.add(format(curr, "yyyy-MM-dd"));
        curr.setDate(curr.getDate() + 1);
        steps++;
      }
    });

    let hasUpdates = false;
    const newGridData = { ...gridData }; // Copy to avoid multiple trigger

    // 1. Clean up outdated data FIRST (Removed absences or assignments)
    for (const slotId in newGridData) {
      if (!newGridData[slotId]) continue;

      const slotData = { ...newGridData[slotId] };
      let rowChanged = false;

      // Find date for this slotId (format is appointmentId-yyyy-mm-dd)
      const parts = slotId.split("-");
      const slotDateStr =
        parts.length >= 4 ? parts.slice(parts.length - 3).join("-") : "";

      for (const preacherName in slotData) {
        const val = slotData[preacherName];
        if (val === "-") {
          // If NOT in absence lookup anymore -> REMOVE
          if (!absenceLookup.get(preacherName)?.has(slotDateStr)) {
            slotData[preacherName] = "";
            rowChanged = true;
          }
        } else if (val === "X") {
          // If assignment was placeholder (X) and is no longer on server -> REMOVE
          if (
            !serverAssignments[slotId] ||
            !serverAssignments[slotId][preacherName]
          ) {
            slotData[preacherName] = "";
            rowChanged = true;
          }
        }
      }

      if (rowChanged) {
        newGridData[slotId] = slotData;
        hasUpdates = true;
      }
    }

    // 2. Apply current absences
    for (const slot of slots) {
      const slotDateStr = format(new Date(slot.date), "yyyy-MM-dd");

      for (const preacherName of PREACHERS_FLAT) {
        // MATCH BY NAME
        if (absenceLookup.get(preacherName)?.has(slotDateStr)) {
          if (!newGridData[slot.id]) newGridData[slot.id] = {};
          // Only overwrite if empty or X (placeholder)
          if (
            !newGridData[slot.id][preacherName] ||
            newGridData[slot.id][preacherName] === "X"
          ) {
            newGridData[slot.id][preacherName] = "-";
            hasUpdates = true;
          }
        }
      }
    }

    // 3. Apply server assignments (pre-filled data)
    for (const slotId in serverAssignments) {
      if (!newGridData[slotId]) newGridData[slotId] = {};
      const slotData = { ...newGridData[slotId] };
      let rowChanged = false;

      for (const preacherName in serverAssignments[slotId]) {
        // ONLY if NEVER touched/initialized (even empty string means "touched")
        if (slotData[preacherName] === undefined) {
          slotData[preacherName] = serverAssignments[slotId][preacherName];
          rowChanged = true;
        }
      }

      if (rowChanged) {
        newGridData[slotId] = slotData;
        hasUpdates = true;
      }
    }

    // Only update state if something changed
    if (hasUpdates) {
      gridData = newGridData;
    }
  });

  // State definition moved to top

  // Transform server slots to internal format
  let slots = $derived.by(() => {
    if (serverSlots.length > 0) {
      // Use real server data
      const transformed: Slot[] = serverSlots
        .map((s) => {
          // Parse manually to YYYY, MM, DD and create NOON date to avoid timezone offset
          const parts = s.date.split("-");
          if (parts.length !== 3) {
            console.error("Invalid date format:", s.date);
            return null;
          }
          const [y, m, d] = parts.map(Number);
          const date = new Date(y, m - 1, d, 12, 0, 0);

          if (isNaN(date.getTime())) {
            console.error("Invalid date object:", s.date);
            return null;
          }

          // Detect if this is a second Sunday service (evening)
          const hour = parseInt(s.time.split(":")[0], 10);
          const isSundaySecond = isSunday(date) && hour >= 14;

          return {
            id: s.id,
            date,
            time: s.time,
            label: s.label,
            calendar: s.calendar || undefined,
            isSundaySecond,
          } as Slot;
        })
        .filter((s): s is Slot => s !== null);

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

      // Final filter: remove deleted ones, add manual ones, and sort
      return [...deduped, ...manualSlots]
        .filter((s) => !deletedSlotIds.includes(String(s.id)))
        .sort((a, b) => {
          const dA = format(a.date, "yyyy-MM-dd");
          const dB = format(b.date, "yyyy-MM-dd");
          return dA.localeCompare(dB) || a.time.localeCompare(b.time);
        });
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

  function getRuleForSlot(slot: Slot) {
    const date = slot.date;
    const time = slot.time;
    const weekday = String(date.getDay());
    const nthSunday = getNthSundayOfMonth(date);
    const holiday = getHolidayName(date);

    // Dynamic Rule Lookup
    let applicableRules = serverServiceRules.filter((r) => {
      // Rule for specific holiday
      if (holiday && r.weekday === "Holiday" && r.time === time) return true;
      // Rule for specific weekday and time
      if (r.weekday === weekday && r.time === time) {
        if (weekday === "0") {
          // Sunday: check nth_sunday
          return r.nth_sunday === 0 || r.nth_sunday === nthSunday;
        }
        return true;
      }
      return false;
    });

    if (applicableRules.length > 0) {
      // Use the most specific rule (e.g. nth_sunday > 0 over nth_sunday === 0)
      return (
        applicableRules.find((r) => r.nth_sunday > 0) || applicableRules[0]
      );
    }

    return null;
  }

  // Get allowed service types for a specific slot based on day/time rules
  function getAllowedTypesForSlot(slot: Slot): string[] {
    const rule = getRuleForSlot(slot);
    if (rule) return rule.allowed_services || [];

    // Fallback to legacy hardcoded rules if no DB rules found
    const date = slot.date;
    const holiday = getHolidayName(date);
    if (isWednesday(date)) return ["Als"];

    if (holiday === "Karfreitag" || holiday === "Gründonnerstag") {
      return ["🍷", "L", "1", "2", "V"];
    }

    if (isFriday(date)) return ["BS", "GS"];

    if (isSunday(date)) {
      const time = slot.time;
      const hour = parseInt(time.split(":")[0], 10);
      const nthSunday = getNthSundayOfMonth(date);
      const isMorning = hour < 12;
      const isEvening16 = hour >= 15 && hour < 17;

      if (nthSunday === 1) {
        return isMorning ? ["🍷", "L", "1", "2", "V"] : ["L", "1", "2", "Als"];
      } else if (nthSunday === 2) {
        return isMorning ? ["L", "1", "2", "BN"] : ["L", "1", "2"];
      } else if (nthSunday === 3) {
        if (isMorning) return ["L", "1", "2"];
        if (isEvening16) return ["1", "2"];
        return ["L", "1", "2"];
      } else {
        return ["L", "1", "2"];
      }
    }

    // Default: all types
    return SERVICE_TYPES.map((s) => s.code);
  }

  // No legacy persons needed anymore - now handled via PocketBase member permissions

  // Filter allowed types based on person restrictions
  function getPersonAllowedTypes(
    slotTypes: string[],
    preacherName: string,
  ): string[] {
    const preacher = ([...serverPreachers, ...fallbackPreachers] as any[]).find(
      (p) => `${p.firstName} ${p.lastName}` === preacherName,
    );

    const allowed = preacher?.allowed_services;

    return slotTypes.filter((code) => {
      // If preacher has strict allowed_services defined in PB, use ONLY them
      if (allowed && allowed.length > 0) {
        return allowed.includes(code);
      }

      // Default: If no individual restrictions are set, everything that fits the slot is allowed
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

    // Check which allowed types are already taken by others in this slot
    // and should not be duplicated (respect dynamic limit)
    const takenInSlot = new Set<string>();
    const rule = getRuleForSlot(slot);
    const maxAssignments = rule?.max_assignments || {};

    for (const [pName, service] of Object.entries(gridData[slotId])) {
      if (pName !== preacher && service) {
        let max = maxAssignments[service] || 1;
        // Legacy fallbacks
        if (!rule) {
          if (service === "V") max = 3;
          else if (service === "BN") max = 2;
        }

        const count = Object.values(gridData[slotId]).filter(
          (s) => s === service,
        ).length;
        if (count >= max) {
          takenInSlot.add(service);
        }
      }
    }

    const currentIndex = allowedTypes.indexOf(current);
    let nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;

    // Cycle through allowed types, skipping those that are "full"
    // We try at most allowedTypes.length + 1 times (to include the 'clear' state)
    let tries = 0;
    while (tries <= allowedTypes.length) {
      if (nextIndex >= allowedTypes.length) {
        // Clear state
        gridData[slotId][preacher] = "";
        return;
      }

      const candidate = allowedTypes[nextIndex];
      if (!takenInSlot.has(candidate)) {
        gridData[slotId][preacher] = candidate;
        return;
      }

      nextIndex++;
      tries++;
    }

    // If we're here, all allowed types are taken. Clear.
    gridData[slotId][preacher] = "";
  }

  function getServiceStyle(code: string) {
    if (code === "-")
      return "bg-zinc-100 dark:bg-zinc-700/50 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors";

    // Auto-map legacy codes to new ones
    const mappedCode = code === "Anf" ? "1" : code === "Schl" ? "2" : code;

    return (
      SERVICE_TYPES.find((s) => s.code === mappedCode)?.color ||
      "bg-white dark:bg-zinc-700"
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
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(gridData));
      formData.append("formatting", JSON.stringify(formatting));
      formData.append("specialServices", JSON.stringify(specialServices));

      const response = await fetch("?/save", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      // fetch returns application/json directly or we might need to parse it
      // but in SvelteKit standard actions, we usually use applyAction or similar
      // for simple fetch, we check success
      if (response.ok) {
        toast.success("Plan erfolgreich gespeichert!");
      } else {
        toast.error("Speichern fehlgeschlagen.");
      }
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Fehler beim Verbinden zum Server.");
    } finally {
      saving = false;
    }
  }

  let exporting = $state(false);

  async function exportToChurchTools() {
    const confirmed = await confirm(
      "Möchtest du die aktuellen Dienste wirklich nach ChurchTools exportieren? Bestehende Dienste werden ggf. überschrieben.",
    );
    if (!confirmed) return;

    exporting = true;
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(gridData));

      const response = await fetch("?/export", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      console.log("Export results:", result);
      exportResults = result;
      showExportModal = true;

      if (response.ok) {
        // Optionale automatische Schließung nach Erfolg? Nein, Debug ist gewünscht.
        await invalidateAll(); // Refresh to see synced state (X)
      } else {
        // Error already handled by showing modal
      }
    } catch (e) {
      console.error("Export error:", e);
      exportResults = {
        success: false,
        message: "Verbindungsfehler",
        results: [
          "Konnte keine Verbindung zum Server herstellen. Bitte prüfe deine Internetverbindung.",
        ],
      };
      showExportModal = true;
    } finally {
      exporting = false;
    }
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
  onmouseleave={() => {
    hoveredSlotIdx = null;
    hoveredPreacherIdx = null;
  }}
  class="flex-1 h-full flex flex-col p-0 bg-white dark:bg-zinc-700 overflow-hidden transition-colors duration-300"
>
  <!-- Toolbar - will be portaled to header -->
  <div bind:this={toolbarRef} class="flex items-center gap-4 no-print">
    <!-- Month Navigation -->
    <!-- Month Navigation -->
    <div class="flex items-center gap-2">
      <button
        onclick={prevMonth}
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-500 text-white hover:bg-zinc-600 hover:shadow-zinc-500/20 transition-all shadow-sm"
        title="Vorheriger Monat"
        aria-label="Vorheriger Monat"
      >
        <ChevronLeft size={18} />
      </button>
      <div
        class="px-2 py-1 text-sm font-bold text-zinc-800 dark:text-zinc-200 min-w-[140px] text-center"
      >
        {format(selectedMonth, "MMMM", { locale: de })} - {format(
          addMonths(selectedMonth, 1),
          "MMMM yyyy",
          { locale: de },
        )}
      </div>
      <button
        onclick={nextMonth}
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-500 text-white hover:bg-zinc-600 hover:shadow-zinc-500/20 transition-all shadow-sm"
        title="Nächster Monat"
        aria-label="Nächster Monat"
      >
        <ChevronRight size={18} />
      </button>
    </div>

    <!-- Actions -->

    <button
      onclick={() => (showExport = true)}
      class="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow-orange-500/20 transition-all border border-transparent"
      title="Als PDF Exportieren"
      aria-label="Als PDF Exportieren"
    >
      <FileText size={18} />
    </button>

    <button
      onclick={syncData}
      disabled={syncing}
      class="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm hover:shadow-cyan-500/20 transition-all border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      title="Von ChurchTools synchronisieren"
      aria-label="Von ChurchTools synchronisieren"
    >
      <RefreshCw size={18} class={syncing ? "animate-spin" : ""} />
    </button>

    <button
      onclick={savePlan}
      disabled={saving}
      class="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-500 text-white hover:bg-blue-600 shadow-sm hover:shadow-blue-500/20 disabled:opacity-50 transition-all border border-transparent"
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

    <button
      onclick={exportToChurchTools}
      disabled={exporting}
      class="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm hover:shadow-emerald-500/20 disabled:opacity-50 transition-all border border-transparent"
      title={exporting
        ? "Wird exportiert..."
        : "Nach ChurchTools exportieren (Push)"}
      aria-label={exporting
        ? "Wird exportiert..."
        : "Nach ChurchTools exportieren (Push)"}
    >
      {#if exporting}
        <div
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></div>
      {:else}
        <Share size={18} />
      {/if}
    </button>

    <!-- Formatting Toggle -->
    <div class="relative">
      <button
        onclick={() => (showFormatting = !showFormatting)}
        class="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:bg-fuchsia-500 hover:text-white dark:hover:bg-fuchsia-600 dark:hover:text-white transition-all shadow-sm hover:shadow-fuchsia-500/20 border border-transparent {showFormatting
          ? '!bg-fuchsia-500 !text-white ring-2 ring-fuchsia-200 dark:ring-fuchsia-900'
          : ''}"
        title="Formatierung anpassen"
        aria-label="Formatierung anpassen"
      >
        <Settings2 size={18} />
      </button>

      {#if showFormatting}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 z-[150] no-print"
          onclick={() => (showFormatting = false)}
        ></div>
        <div
          class="absolute top-11 right-0 w-80 bg-white dark:bg-zinc-700 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-600 p-4 z-[200] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div class="flex items-center justify-between mb-4">
            <h3
              class="font-black text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500"
            >
              Tabellen-Formatierung
            </h3>
            <button
              onclick={() => (showFormatting = false)}
              class="text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div class="space-y-6">
            {#each ["names", "entries", "dates", "months"] as const as key}
              {@const label = {
                names: "Namen & Legende",
                entries: "Diensteinträge",
                dates: "Datum & Uhrzeit",
                months: "Monate",
              }[key]}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span
                    class="text-xs font-bold text-zinc-700 dark:text-zinc-200"
                    >{label}</span
                  >
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="flex gap-1">
                    <button
                      onclick={() =>
                        (formatting[key].bold = !formatting[key].bold)}
                      class="flex-1 h-8 rounded-lg border text-xs font-bold transition-all {formatting[
                        key
                      ].bold
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                        : 'bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-600 hover:bg-zinc-50'}"
                    >
                      F
                    </button>
                    <button
                      onclick={() =>
                        (formatting[key].italic = !formatting[key].italic)}
                      class="flex-1 h-8 rounded-lg border text-xs italic transition-all {formatting[
                        key
                      ].italic
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                        : 'bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-600 hover:bg-zinc-50'}"
                    >
                      I
                    </button>
                  </div>
                  <div
                    class="flex gap-1 items-center bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-600 px-2"
                  >
                    <Type size={12} class="text-zinc-400" />
                    <input
                      type="number"
                      bind:value={formatting[key].fontSize}
                      min="8"
                      max="32"
                      class="w-full bg-transparent border-none text-[11px] font-bold focus:ring-0 p-0 text-right"
                    />
                    <span class="text-[9px] text-zinc-400 font-bold ml-0.5"
                      >PX</span
                    >
                  </div>
                </div>
                <!-- Custom Font Selector -->
                <div class="relative">
                  <button
                    onclick={() =>
                      (activeFontSelector =
                        activeFontSelector === key ? null : key)}
                    class="w-full h-8 flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-bold focus:ring-2 focus:ring-primary-500 px-2 transition-all"
                    aria-label="Schriftart wählen"
                    aria-expanded={activeFontSelector === key}
                  >
                    <span style="font-family: {formatting[key].fontFamily}">
                      {FONT_FAMILIES.find(
                        (f) => f.value === formatting[key].fontFamily,
                      )?.label || formatting[key].fontFamily}
                    </span>
                    <ChevronRight
                      size={12}
                      class="transition-transform text-zinc-400 {activeFontSelector ===
                      key
                        ? 'rotate-90'
                        : ''}"
                    />
                  </button>

                  {#if activeFontSelector === key}
                    <button
                      class="fixed inset-0 z-40 bg-black/5 dark:bg-black/20"
                      onclick={() => (activeFontSelector = null)}
                      aria-label="Menü schließen"
                    ></button>
                    <div
                      class="absolute bottom-10 left-0 w-full max-h-48 overflow-y-auto rounded-xl bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 p-1"
                      role="listbox"
                    >
                      {#each FONT_FAMILIES as font}
                        <button
                          onclick={() => {
                            formatting[key].fontFamily = font.value;
                            activeFontSelector = null;
                          }}
                          class="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors {formatting[
                            key
                          ].fontFamily === font.value
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-primary-600 font-bold'
                            : 'text-zinc-600 dark:text-zinc-300'}"
                          style="font-family: {font.value}"
                          role="option"
                          aria-selected={formatting[key].fontFamily ===
                            font.value}
                        >
                          {font.label}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Legend Toggle (Mobile only) -->
    <button
      onclick={() => (showLegend = !showLegend)}
      class="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 text-white hover:bg-amber-600 shadow-sm hover:shadow-amber-500/20 transition-all border border-transparent"
      title="Legende anzeigen"
      aria-label="Legende anzeigen"
    >
      <div class="p-1 rounded bg-white/20">
        <div class="grid grid-cols-2 gap-0.5">
          <div class="w-1.5 h-1.5 rounded-sm bg-white"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-white"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-white"></div>
          <div class="w-1.5 h-1.5 rounded-sm bg-white"></div>
        </div>
      </div>
    </button>
  </div>

  <!-- Grid Card Container -->
  <div
    class="flex-1 flex overflow-hidden border-t border-b border-zinc-200 dark:border-zinc-600 relative transition-colors duration-300"
  >
    <div class="flex-1 overflow-auto custom-scrollbar">
      <div
        class="min-w-fit px-8 pb-8 pt-4 flex justify-center items-stretch gap-2"
      >
        <div
          class="inline-block align-top shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-600"
          role="presentation"
          onmouseleave={() => {
            hoveredSlotIdx = null;
            hoveredPreacherIdx = null;
          }}
        >
          <table class="table-fixed border-separate border-spacing-0">
            <colgroup>
              <col class="w-[200px]" />
              {#each slots as _}
                <col class="w-7" />
              {/each}
            </colgroup>
            <thead>
              <!-- Row 1: Months -->
              <tr class="h-9">
                <th
                  class="sticky top-0 left-0 z-[120] bg-zinc-100 dark:bg-zinc-700 border-r border-b border-zinc-200 dark:border-zinc-600 p-1 text-center w-[200px] min-w-[200px] shadow-[4px_4px_8px_-4px_rgba(0,0,0,0.1)] transition-colors duration-300"
                >
                  <div class="flex items-center justify-center">
                    <span
                      class="uppercase tracking-[0.3em] text-zinc-900 dark:text-white"
                      style={getFormattingStyle("months")}
                    >
                      {selectedMonth?.getFullYear()}
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
                    class="sticky top-0 z-[100] bg-zinc-100 dark:bg-zinc-700 border-r border-b border-zinc-200 dark:border-zinc-600 p-2 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] transition-colors duration-300"
                  >
                    <span
                      class="uppercase tracking-[0.3em] text-zinc-900 dark:text-white"
                      style={getFormattingStyle("months")}
                    >
                      {monthDate
                        ? format(monthDate, "MMMM", { locale: de })
                        : ""}
                    </span>
                  </th>
                {/each}
              </tr>
              <!-- Row 2: Times -->
              <tr class="h-10">
                <th
                  rowspan="2"
                  class="sticky top-[36px] left-0 z-[120] bg-white dark:bg-zinc-700 border-r border-b border-zinc-200 dark:border-zinc-600 p-2 transition-colors duration-300"
                >
                  <div class="flex items-center justify-center h-full">
                    <img
                      src="/logo-light.png"
                      alt="Logo"
                      class="h-16 w-auto dark:hidden"
                    />
                    <img
                      src="/logo-dark.png"
                      alt="Logo"
                      class="h-16 w-auto hidden dark:block"
                    />
                  </div>
                </th>
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[36px] z-[100] transition-all border-r border-b border-zinc-200 dark:border-zinc-600 p-0 w-7 min-w-[28px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)]
                    {getDayHighlightClass(new Date(slot.date), slot.time)}
                    {slot.isSundaySecond ? 'border-l-0' : ''} 
                    {hoveredSlotIdx === sIdx
                      ? '!bg-amber-500/10 dark:!bg-amber-500/20 shadow-[inset_0_4px_0_0_#f59e0b]'
                      : ''}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                  >
                    <div class="relative w-full h-12">
                      <div
                        class="absolute top-2 left-1/2 -translate-x-1/2 tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-zinc-900 dark:text-zinc-100"
                        style={getFormattingStyle("dates")}
                      >
                        {slot.time}
                      </div>
                    </div>
                  </th>
                {/each}
              </tr>
              <!-- Row 3: Dates -->
              <tr class="h-14">
                {#each slots as slot, sIdx}
                  <th
                    class="sticky top-[76px] z-[100] transition-colors border-r border-b border-zinc-200 dark:border-zinc-600 p-0 w-7 min-w-[28px] text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)] group {slot.isSundaySecond
                      ? 'border-l-0'
                      : ''} 
                    {getDayHighlightClass(new Date(slot.date), slot.time)}
                      {hoveredSlotIdx === sIdx
                      ? '!bg-amber-500/10 dark:!bg-amber-500/20'
                      : ''}"
                    onmouseenter={() => (hoveredSlotIdx = sIdx)}
                    onmouseleave={() => (hoveredSlotIdx = null)}
                    title={getHolidayName(new Date(slot.date)) || ""}
                  >
                    <div class="relative w-full h-14">
                      <div
                        class="absolute bottom-3 left-1/2 -translate-x-1/2 tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap text-zinc-900 dark:text-zinc-100"
                        style={getFormattingStyle("dates")}
                      >
                        {format(slot.date, "dd. eee", { locale: de })}
                      </div>

                      <!-- Column Header Tools -->
                      <div
                        class="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-[110]"
                      >
                        <!-- Add Slot Button -->
                        <button
                          onclick={(e) => {
                            e.stopPropagation();
                            newSlotDate = format(slot.date, "yyyy-MM-dd");
                            newSlotTime = slot.time;
                            showManualSlotEntry = true;
                          }}
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_4px_12px_rgba(5,150,105,0.4)] hover:scale-110 active:scale-90 transition-all z-[111]"
                          title="Manuellen Termin hinzufügen"
                        >
                          <Plus size={16} />
                        </button>

                        <!-- Star Toggle Button -->
                        <button
                          onclick={(e) => {
                            e.stopPropagation();
                            if (specialServices[slot.id]) {
                              delete specialServices[slot.id];
                            } else {
                              specialServices[slot.id] = "Neuer Eintrag";
                            }
                          }}
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-500 shadow-[0_4px_12px_rgba(245,158,11,0.4)] hover:scale-110 active:scale-90 transition-all z-[112]"
                          title="Besonderheit hinzufügen/entfernen"
                        >
                          <Star size={16} class="fill-white" />
                        </button>

                        <!-- Delete Column Button -->
                        <button
                          onclick={(e) => {
                            e.stopPropagation();
                            removeSlot(slot.id);
                          }}
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 shadow-[0_4px_12px_rgba(220,38,38,0.4)] hover:scale-110 active:scale-90 transition-all z-[111]"
                          title="Spalte löschen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-zinc-700">
              {#each group1 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = pIdx}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-zinc-50/40 dark:bg-zinc-700/20'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-zinc-200 dark:border-zinc-600 px-3 py-0 text-zinc-900 dark:text-zinc-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap h-7 w-[200px] min-w-[200px] transition-all {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? '!bg-amber-500/10 dark:!bg-amber-500/20 shadow-[inset_4px_0_0_0_#f59e0b] z-[100]'
                      : (pIdx % 2 === 1
                          ? 'bg-zinc-50/95 dark:bg-zinc-700/95'
                          : 'bg-white/95 dark:bg-zinc-700/95') +
                        ' backdrop-blur-sm'}"
                  >
                    <span style={getFormattingStyle("names")}>
                      {preacherName}
                    </span>
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-zinc-200 dark:border-zinc-600 p-0.5 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {getDayHighlightClass(new Date(slot.date), slot.time)}
                        {validationState[slot.id]?.has(preacherName)
                        ? '!bg-red-100 dark:!bg-red-900/30 !ring-inset !ring-1 !ring-red-500'
                        : ''}
                        {hoveredPreacherIdx === absoluteRowIdx &&
                      hoveredSlotIdx === sIdx
                        ? '!bg-amber-500/20 dark:!bg-amber-500/30 !ring-2 !ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] z-10 relative'
                        : hoveredPreacherIdx === absoluteRowIdx ||
                            hoveredSlotIdx === sIdx
                          ? code === '-'
                            ? '!bg-zinc-100/30 dark:!bg-zinc-700/30'
                            : '!bg-zinc-200/50 dark:!bg-zinc-700/50'
                          : ''}"
                      title={code === "-" ? "Abwesend (ChurchTools)" : ""}
                      onclick={() => toggleService(preacherName, slot.id)}
                      oncontextmenu={(e) => {
                        e.preventDefault();
                        if (gridData[slot.id]?.[preacherName]) {
                          gridData[slot.id][preacherName] = "";
                        }
                      }}
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
                          class="w-6 h-6 mx-auto flex items-center justify-center transition-all active:scale-95 rounded-lg {getServiceStyle(
                            code,
                          )}"
                          style={getFormattingStyle("entries")}
                        >
                          {code}
                        </div>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}

              {#each group2 as p, pIdx}
                {@const preacherName = `${p.firstName} ${p.lastName}`}
                {@const absoluteRowIdx = group1.length + pIdx}
                <tr
                  class="group transition-colors {pIdx % 2 === 1
                    ? 'bg-zinc-50/40 dark:bg-zinc-700/20'
                    : ''}"
                  onmouseenter={() => (hoveredPreacherIdx = absoluteRowIdx)}
                  onmouseleave={() => (hoveredPreacherIdx = null)}
                >
                  <td
                    class="sticky left-0 z-[90] border-r border-b border-zinc-200 dark:border-zinc-600 px-3 py-0 text-zinc-900 dark:text-zinc-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] whitespace-nowrap h-7 w-[200px] min-w-[200px] transition-all {hoveredPreacherIdx ===
                    absoluteRowIdx
                      ? '!bg-amber-500/10 dark:!bg-amber-500/20 shadow-[inset_4px_0_0_0_#f59e0b] z-[100]'
                      : (pIdx % 2 === 1
                          ? 'bg-zinc-50/95 dark:bg-zinc-700/95'
                          : 'bg-white/95 dark:bg-zinc-700/95') +
                        ' backdrop-blur-sm'}"
                  >
                    <span style={getFormattingStyle("names")}>
                      {preacherName}
                    </span>
                  </td>
                  {#each slots as slot, sIdx}
                    {@const code = gridData[slot.id]?.[preacherName] || ""}
                    <td
                      class="border-b border-r border-zinc-200 dark:border-zinc-600 p-0.5 transition-all select-none
                        {code === '-' ? 'cursor-not-allowed' : 'cursor-pointer'}
                        {getDayHighlightClass(new Date(slot.date), slot.time)}
                        {validationState[slot.id]?.has(preacherName)
                        ? '!bg-red-100 dark:!bg-red-900/30 !ring-inset !ring-1 !ring-red-500'
                        : ''}
                        {hoveredPreacherIdx === absoluteRowIdx &&
                      hoveredSlotIdx === sIdx
                        ? '!bg-amber-500/20 dark:!bg-amber-500/30 !ring-2 !ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] z-10 relative'
                        : hoveredPreacherIdx === absoluteRowIdx ||
                            hoveredSlotIdx === sIdx
                          ? code === '-'
                            ? '!bg-zinc-100/30 dark:!bg-zinc-700/30'
                            : '!bg-zinc-200/50 dark:!bg-zinc-700/50'
                          : ''}"
                      title={code === "-" ? "Abwesend (ChurchTools)" : ""}
                      onclick={() => toggleService(preacherName, slot.id)}
                      oncontextmenu={(e) => {
                        e.preventDefault();
                        if (gridData[slot.id]?.[preacherName]) {
                          gridData[slot.id][preacherName] = "";
                        }
                      }}
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
                          class="w-8 h-6 flex items-center justify-center font-bold text-[16px] transition-all active:scale-95 rounded-lg {getServiceStyle(
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

              <!-- Individual Besonderheiten Rows -->
              {#each Object.entries(specialServices) as [sid, text], idx}
                {@const s = slots.find((sl) => sl.id === sid)}
                {#if s}
                  <tr
                    class="group transition-colors border-t border-amber-500/10"
                    onmouseenter={() => (hoveredSpecialServiceId = sid)}
                    onmouseleave={() => (hoveredSpecialServiceId = null)}
                  >
                    <td
                      class="sticky left-0 z-[90] border-r border-b border-zinc-200 dark:border-zinc-600 px-3 py-0 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] transition-all whitespace-nowrap h-7 w-[200px] min-w-[200px] {hoveredSpecialServiceId ===
                      sid
                        ? '!bg-amber-500/10 dark:!bg-amber-500/20 text-amber-600 dark:text-amber-500 shadow-[inset_4px_0_0_0_#f59e0b] z-[100]'
                        : 'bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-500 backdrop-blur-sm'}"
                    >
                      <div class="flex items-center gap-2">
                        <Star size={12} class="fill-current shrink-0" />
                        <span
                          class="text-[11px] font-bold truncate"
                          style={getFormattingStyle("names")}
                        >
                          {text}
                        </span>
                      </div>
                    </td>
                    {#each slots as slot, sIdx}
                      <td
                        class="border-b border-r border-zinc-200 dark:border-zinc-600 p-0.5 transition-all
                            {getDayHighlightClass(
                          new Date(slot.date),
                          slot.time,
                        )}
                            {hoveredSlotIdx === sIdx &&
                        hoveredSpecialServiceId === sid
                          ? '!bg-amber-500/20 dark:!bg-amber-500/30 !ring-2 !ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] z-10 relative'
                          : hoveredSlotIdx === sIdx ||
                              hoveredSpecialServiceId === sid
                            ? '!bg-amber-500/10 dark:!bg-amber-900/10'
                            : ''}"
                        onmouseenter={() => (hoveredSlotIdx = sIdx)}
                        onmouseleave={() => (hoveredSlotIdx = null)}
                      >
                        {#if slot.id === sid}
                          <div
                            class="w-6 h-6 mx-auto flex items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm transition-all hover:scale-110"
                          >
                            <Star size={12} class="fill-white" />
                          </div>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Right Side Legend (Desktop) -->
        <div
          class="hidden lg:flex w-56 flex-shrink-0 no-print flex flex-col gap-3"
        >
          <div
            class="p-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 bg-white dark:bg-zinc-700 h-full"
          >
            <h3
              class="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 mb-2 px-1"
            >
              Legende & Hilfe
            </h3>
            <div class="flex flex-col gap-2">
              {#each SERVICE_TYPES as type}
                <div
                  class="group flex items-center gap-2 p-1 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/50 border border-zinc-100/50 dark:border-zinc-600/50 shadow-sm hover:bg-white dark:hover:bg-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-500 hover:shadow-md transition-all"
                >
                  <div
                    class="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold transition-transform group-hover:scale-110 {type.color}"
                  >
                    {type.code}
                  </div>
                  <div class="flex flex-col">
                    <span
                      class="leading-none text-[11px] text-zinc-800 dark:text-zinc-200"
                      style={getFormattingStyle("names")}>{type.label}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Besonderheiten Box -->
          <div
            class="p-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-600 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 bg-white dark:bg-zinc-700 h-full flex flex-col"
          >
            <h3
              class="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 mb-2 px-1"
            >
              Besonderheiten
            </h3>
            <div
              class="flex flex-col gap-2 overflow-y-auto max-h-[300px] custom-scrollbar"
            >
              {#each Object.entries(specialServices) as [sid, val]}
                {@const s = slots.find((sl) => sl.id === sid)}
                {#if s}
                  <div
                    class="group flex items-center gap-2 p-1 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/50 border border-zinc-100/50 dark:border-zinc-600/50 shadow-sm hover:bg-white dark:hover:bg-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-500 hover:shadow-md transition-all cursor-text"
                    onclick={() => (editingSpecialService = sid)}
                  >
                    <div
                      class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center bg-amber-500 text-white shadow-sm transition-transform group-hover:scale-110 z-10"
                    >
                      <Star size={12} class="fill-white" />
                    </div>
                    <div
                      class="flex flex-col flex-1 min-w-0 overflow-hidden relative"
                    >
                      {#if editingSpecialService === sid}
                        <input
                          type="text"
                          bind:value={specialServices[sid]}
                          placeholder="Besonderheit..."
                          class="bg-transparent border-none focus:ring-0 text-[11px] text-zinc-800 dark:text-zinc-200 p-0 h-4 w-full placeholder:text-zinc-400"
                          style={getFormattingStyle("names")}
                          autoFocus
                          onblur={() => (editingSpecialService = null)}
                          onkeydown={(e) => {
                            if (e.key === "Enter") editingSpecialService = null;
                            e.stopPropagation();
                          }}
                        />
                      {:else}
                        <div
                          class="liveticker-container w-full h-4 relative flex items-center"
                        >
                          <span
                            use:checkOverflow={val}
                            class="text-[11px] text-zinc-800 dark:text-zinc-200"
                            style={getFormattingStyle("names")}
                          >
                            {val || "Besonderheit..."}
                          </span>
                        </div>
                      {/if}
                    </div>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        delete specialServices[sid];
                      }}
                      class="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all z-10"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                {/if}
              {/each}
              {#if Object.keys(specialServices).length === 0}
                <div
                  class="flex flex-col items-center justify-center py-4 opacity-30"
                >
                  <Star size={24} class="text-zinc-400 mb-2" />
                  <span
                    class="text-[10px] uppercase font-black tracking-widest text-zinc-400"
                    >Keine Einträge</span
                  >
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Legend Drawer Overlay -->
    {#if showLegend}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="lg:hidden fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[200] no-print"
        onclick={() => (showLegend = false)}
      >
        <div
          class="absolute right-0 top-0 bottom-0 w-64 bg-white dark:bg-zinc-700 shadow-2xl flex flex-col p-6 overflow-y-auto"
          onclick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between mb-8">
            <h3
              class="text-xs font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white"
            >
              Legende
            </h3>
            <button
              onclick={() => (showLegend = false)}
              class="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div class="flex flex-col gap-3">
            {#each SERVICE_TYPES as type}
              <div
                class="group flex items-center gap-3 p-1.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/50 border border-zinc-100/50 dark:border-zinc-600/50 shadow-sm hover:bg-white dark:hover:bg-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-500 hover:shadow-md transition-all"
              >
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold {type.color}"
                >
                  {type.code}
                </div>
                <div class="flex flex-col">
                  <span
                    class="text-[12px] font-bold text-zinc-800 dark:text-zinc-100"
                    >{type.label}</span
                  >
                </div>
              </div>
            {/each}
          </div>

          <div class="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-600">
            <h3
              class="text-xs font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white mb-4"
            >
              Besonderheiten
            </h3>
            <div class="flex flex-col gap-3">
              {#each Object.entries(specialServices) as [sid, val]}
                {@const s = slots.find((sl) => sl.id === sid)}
                {#if s}
                  <div
                    class="group flex items-center gap-3 p-1.5 rounded-2xl bg-zinc-50/50 dark:bg-zinc-800/50 border border-zinc-100/50 dark:border-zinc-600/50 shadow-sm hover:bg-white dark:hover:bg-zinc-700 hover:border-zinc-200 dark:hover:border-zinc-500 hover:shadow-md transition-all cursor-text"
                    onclick={() => (editingSpecialService = sid)}
                  >
                    <div
                      class="w-8 h-8 shrink-0 rounded-lg bg-amber-500 flex items-center justify-center shadow-sm z-10"
                    >
                      <Star size={16} class="text-white fill-white" />
                    </div>
                    <div
                      class="flex flex-col flex-1 min-w-0 overflow-hidden relative"
                    >
                      {#if editingSpecialService === sid}
                        <input
                          type="text"
                          bind:value={specialServices[sid]}
                          placeholder="Beschreibung..."
                          class="bg-transparent border-none focus:ring-0 text-[12px] text-zinc-800 dark:text-zinc-100 p-0 h-5 w-full"
                          style={getFormattingStyle("names")}
                          autoFocus
                          onblur={() => (editingSpecialService = null)}
                          onkeydown={(e) => {
                            if (e.key === "Enter") editingSpecialService = null;
                            e.stopPropagation();
                          }}
                        />
                      {:else}
                        <div
                          class="liveticker-container w-full h-5 relative flex items-center"
                        >
                          <span
                            use:checkOverflow={val}
                            class="text-[12px] text-zinc-800 dark:text-zinc-100"
                            style={getFormattingStyle("names")}
                          >
                            {val || "Beschreibung..."}
                          </span>
                        </div>
                      {/if}
                    </div>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        delete specialServices[sid];
                      }}
                      class="p-2 text-zinc-400 hover:text-red-500 transition-colors z-10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                {/if}
              {/each}
              {#if Object.keys(specialServices).length === 0}
                <p
                  class="text-[10px] uppercase font-black tracking-widest text-zinc-400 italic text-center py-4"
                >
                  Keine Einträge
                </p>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Export Results Modal -->
  {#if showExportModal}
    <div
      class="fixed inset-0 bg-zinc-900/60 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
    >
      <div
        class="bg-white dark:bg-zinc-700 w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-600 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200"
      >
        <div
          class="px-6 py-5 border-b border-zinc-100 dark:border-zinc-600 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-700/50"
        >
          <div class="flex items-center gap-3">
            <div
              class="p-2 rounded-xl {exportResults?.success
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-red-500/10 text-red-600'}"
            >
              <Share size={20} />
            </div>
            <div>
              <h3 class="font-bold text-zinc-900 dark:text-white">
                ChurchTools Export Log
              </h3>
              <p
                class="text-[10px] text-zinc-400 uppercase tracking-widest font-black"
              >
                {exportResults?.success
                  ? "Abgeschlossen"
                  : "Fehler aufgetreten"}
              </p>
            </div>
          </div>
          <button
            onclick={() => (showExportModal = false)}
            class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div
          class="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white dark:bg-zinc-700/50"
        >
          {#if exportResults}
            <div
              class="mb-4 p-4 rounded-2xl {exportResults.success
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50'
                : 'bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/50'}"
            >
              <p
                class="text-sm font-bold {exportResults.success
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'}"
              >
                {exportResults.message}
              </p>
            </div>

            <div class="space-y-1.5 font-mono text-[11px]">
              {#each exportResults.results || [] as log}
                <div
                  class="p-3 rounded-xl border border-zinc-100 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-700/50 flex gap-3"
                >
                  {#if log.startsWith("OK")}
                    <span class="text-emerald-500 font-bold shrink-0">DONE</span
                    >
                  {:else if log.startsWith("ERROR")}
                    <span class="text-red-500 font-bold shrink-0">FAIL</span>
                  {:else}
                    <span class="text-amber-500 font-bold shrink-0">SKIP</span>
                  {/if}
                  <span class="text-zinc-600 dark:text-zinc-400"
                    >{log.split(": ").slice(1).join(": ") || log}</span
                  >
                </div>
              {/each}
              {#if !exportResults.results?.length}
                <p class="text-zinc-400 italic text-center py-8">
                  Keine Log-Einträge vorhanden.
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <div
          class="p-4 bg-zinc-50/50 dark:bg-zinc-700/50 border-t border-zinc-100 dark:border-zinc-600 flex justify-end"
        >
          <button
            onclick={() => (showExportModal = false)}
            class="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showManualSlotEntry}
    <div
      class="fixed inset-0 bg-zinc-900/60 backdrop-blur-md z-[1000] flex items-center justify-center p-4"
    >
      <div
        class="bg-white dark:bg-zinc-800 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in zoom-in-95 fade-in duration-300"
      >
        <div class="p-8">
          <div class="flex items-center justify-between mb-8">
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
              >
                <PlusCircle size={28} />
              </div>
              <h3 class="text-xl font-black text-zinc-900 dark:text-white">
                Manueller Termin
              </h3>
            </div>
            <button
              onclick={() => (showManualSlotEntry = false)}
              class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label
                class="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400"
                for="date-picker">Datum</label
              >
              <div id="date-picker">
                <DatePicker
                  value={newSlotDate}
                  onchange={(val) => (newSlotDate = val)}
                />
              </div>
            </div>

            <div class="space-y-2">
              <label
                class="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400"
                for="time-input">Uhrzeit</label
              >
              <div
                class="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl focus-within:border-primary-500 transition-all"
              >
                <Clock size={18} class="text-zinc-400" />
                <input
                  id="time-input"
                  type="time"
                  bind:value={newSlotTime}
                  class="bg-transparent border-none focus:ring-0 text-sm font-bold text-zinc-800 dark:text-zinc-200 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          class="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3"
        >
          <button
            onclick={() => (showManualSlotEntry = false)}
            class="px-6 py-3 text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Abbrechen
          </button>
          <button
            onclick={() => {
              const [y, m, d] = newSlotDate.split("-").map(Number);
              const date = new Date(y, m - 1, d, 12, 0, 0);
              const newId = `manual-${Date.now()}`;
              const newSlot: Slot = {
                id: newId,
                date,
                time: newSlotTime,
                label: "Manueller Termin",
              };
              manualSlots = [...manualSlots, newSlot];
              if (!gridData[newId]) gridData[newId] = {};
              showManualSlotEntry = false;
            }}
            class="px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

{#if showExport}
  <ExportPreview
    close={() => (showExport = false)}
    {slots}
    rows={[...group1, ...group2]}
    assignments={gridData}
    {formatting}
  />
{/if}

<style>
  @reference "../../app.css";

  /* Prevent focus outline on click-heavy interface */
  :root {
    -webkit-tap-highlight-color: transparent;
  }

  .dark {
    --scrollbar-track: #0f172a; /* zinc-900 */
    --scrollbar-thumb: #334155; /* zinc-700 */
    --scrollbar-thumb-hover: #475569; /* zinc-600 */
  }

  :root:not(.dark) {
    --scrollbar-track: #f8fafc; /* zinc-50 */
    --scrollbar-thumb: #e2e8f0; /* zinc-200 */
    --scrollbar-thumb-hover: #cbd5e1; /* zinc-300 */
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

  .liveticker-container span {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    transition: all 0.3s ease;
  }

  .liveticker-container span:global(.liveticker-content) {
    animation: marquee 15s linear infinite;
    padding-left: 100%;
    text-overflow: clip; /* Clip instead of ellipsis */
  }

  .liveticker-container:hover span:global(.liveticker-content) {
    animation-play-state: paused;
  }

  @keyframes marquee {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }
</style>
