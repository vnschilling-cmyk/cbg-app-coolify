<script lang="ts">
  import { format, isSunday } from "date-fns";
  import { de } from "date-fns/locale";

  interface Slot {
    id: string;
    date: Date;
    time: string;
    label: string;
    isSundaySecond?: boolean;
  }

  interface Preacher {
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
  }

  interface Props {
    title: string;
    slots: Slot[];
    group1: Preacher[];
    group2: Preacher[];
    gridData: Record<string, Record<string, string>>;
    specialEvents?: Record<string, string>;
  }

  let {
    title,
    slots,
    group1,
    group2,
    gridData,
    specialEvents = {},
  }: Props = $props();

  const LEGEND = [
    { code: "L", label: "Leitung", color: "bg-blue-600 text-white" },
    {
      code: "1",
      label: "Predigt 10-15 Min",
      color: "bg-emerald-600 text-white",
    },
    {
      code: "2",
      label: "Predigt 30-40 Min",
      color: "bg-violet-600 text-white",
    },
    {
      code: "T",
      label: "Beteiligung an Bibelstunden",
      color: "bg-orange-600 text-white",
    },
    {
      code: "G",
      label: "Leitung Gebetstunde",
      color: "bg-amber-600 text-white",
    },
  ];
</script>

<div class="print-container bg-white p-[1cm] text-black w-full min-h-screen">
  <!-- Header -->
  <div
    class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-6"
  >
    <h1 class="text-2xl font-black uppercase tracking-widest">{title}</h1>
    <div class="text-sm font-bold">PREDIGERPLAN PRO</div>
  </div>

  /* Matrix */
  <table class="w-full border-collapse border-2 border-black text-[10px]">
    <thead>
      <tr class="h-8">
        <th
          class="border border-black bg-slate-100 text-[12px] font-medium text-black"
          >2026</th
        >
        {#each [...new Set(slots.map((s) => s.date.getMonth()))] as monthIdx}
          {@const firstSlotInMonth = slots.find(
            (s) => s.date.getMonth() === monthIdx,
          )}
          {@const monthSlots = slots.filter(
            (s) => s.date.getMonth() === monthIdx,
          )}
          <th
            colspan={monthSlots.length}
            class="border border-black p-1 text-center bg-slate-100 uppercase font-medium tracking-[0.3em] text-[12px] text-black"
          >
            {firstSlotInMonth
              ? format(firstSlotInMonth.date, "MMMM", { locale: de })
              : ""}
          </th>
        {/each}
      </tr>
      <!-- Row 2: Times -->
      <tr class="h-14 text-black">
        <th class="border border-black bg-slate-50"></th>
        {#each slots as slot}
          <th
            class="border border-black p-0 text-center bg-slate-50 min-w-[18px]"
          >
            <div class="flex flex-col items-center justify-center h-full">
              <div
                class="text-[9px] font-medium [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap leading-none"
              >
                {slot.time}
              </div>
            </div>
          </th>
        {/each}
      </tr>
      <!-- Row 3: Dates -->
      <tr class="h-14 text-black">
        <th class="border border-black bg-slate-50"></th>
        {#each slots as slot}
          <th
            class="border border-black p-0 text-center bg-slate-50 min-w-[18px]"
          >
            <div class="flex flex-col items-center justify-end h-full">
              <div
                class="font-medium text-[9px] [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap leading-none"
              >
                {format(slot.date, "dd. eee", { locale: de })}
              </div>
            </div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each group1 as p}
        <tr class="h-5">
          <td
            class="border border-black p-1 font-medium bg-slate-50 whitespace-nowrap px-1.5 text-[10px] leading-tight"
            >{p.fullName}</td
          >
          {#each slots as slot}
            {@const code = gridData[slot.id]?.[p.fullName] || ""}
            <td class="border border-black p-0 text-center align-middle">
              <span
                class="font-bold text-[12px] {isSunday(slot.date) && code
                  ? 'text-red-600'
                  : ''}">{code}</span
              >
            </td>
          {/each}
        </tr>
      {/each}

      <!-- Separator line -->
      <tr class="h-1 bg-slate-200">
        <td class="border border-black bg-slate-200"></td>
        {#each slots as slot}
          <td class="border border-black bg-slate-200"></td>
        {/each}
      </tr>

      {#each group2 as p}
        <tr class="h-5">
          <td
            class="border border-black p-1 font-medium bg-slate-50 whitespace-nowrap px-1.5 text-[10px] leading-tight"
            >{p.fullName}</td
          >
          {#each slots as slot}
            {@const code = gridData[slot.id]?.[p.fullName] || ""}
            <td class="border border-black p-0 text-center align-middle">
              <span class="font-bold text-[12px]">{code}</span>
            </td>
          {/each}
        </tr>
      {/each}

      <!-- Special Row for Locations / Events -->
      <tr class="bg-slate-50 h-5">
        <td
          class="border border-black p-1 font-bold italic whitespace-nowrap px-1.5 text-[8px] leading-tight text-slate-500"
          >Besonderheiten</td
        >
        {#each slots as slot}
          <td
            class="border border-black p-0 text-[7px] font-bold text-center leading-[1] overflow-hidden text-slate-600"
          >
            {specialEvents[format(slot.date, "yyyy-MM-dd")] || ""}
          </td>
        {/each}
      </tr>
    </tbody>
  </table>

  <!-- Footer / Legend -->
  <div class="mt-8 flex justify-between items-start gap-12">
    <!-- Legend -->
    <div class="flex-1 border border-black p-4">
      <h3
        class="text-[10px] font-black uppercase tracking-tighter mb-2 underline"
      >
        Erklärung der Kürzel:
      </h3>
      <div class="grid grid-cols-2 gap-x-8 gap-y-2">
        {#each LEGEND as item}
          <div class="flex items-center gap-3">
            <span
              class="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold {item.color}"
              >{item.code}</span
            >
            <span class="text-[9px] font-medium text-slate-700"
              >{item.label}</span
            >
          </div>
        {/each}
      </div>
    </div>

    <!-- Notes -->
    <div class="flex-1 border border-black p-4 h-full">
      <h3
        class="text-[10px] font-black uppercase tracking-tighter mb-2 underline"
      >
        Hinweise:
      </h3>
      <div class="text-[9px] leading-relaxed">
        Bitte bei Verhinderung selbstständig für Ersatz sorgen und die Leitung
        informieren. Die aktuellen Termine sind auch in ChurchTools hinterlegt.
      </div>
    </div>

    <!-- Signature -->
    <div class="w-48 text-right self-end pb-2">
      <div class="border-b border-black h-8 mb-1"></div>
      <div class="text-[8px] font-bold uppercase tracking-widest opacity-50">
        Gemeindeleitung
      </div>
    </div>
  </div>
</div>

<style>
  @media print {
    .print-container {
      padding: 0;
      width: 100%;
    }
  }

  table {
    table-layout: fixed;
  }
</style>
