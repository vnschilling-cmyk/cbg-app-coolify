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
    title = "PREDIGERPLAN",
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

<div class="print-container bg-white p-[5mm] text-black w-full min-h-screen">
  <!-- Header -->
  <div
    class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-6"
  >
    <h1 class="text-2xl font-black uppercase tracking-widest">{title}</h1>
  </div>

  /* Matrix */
  <table class="w-full border-collapse border-2 border-black text-[12px]">
    <thead>
      <tr class="h-8">
        <th
          class="border border-black bg-zinc-100 text-[14px] font-medium text-black align-bottom p-1 w-[100px]"
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
            class="border border-black p-1 text-center bg-zinc-100 uppercase font-medium tracking-[0.3em] text-[14px] text-black"
          >
            {firstSlotInMonth
              ? format(firstSlotInMonth.date, "MMMM", { locale: de })
              : ""}
          </th>
        {/each}
      </tr>
      <!-- Row 2: Times -->
      <tr class="h-14 text-black">
        <th
          class="border border-black bg-zinc-50 p-0 align-middle w-[100px]"
          rowspan="2"
        >
          <div class="flex items-center justify-center p-1 overflow-hidden">
            <img
              src="/logo-light.png"
              alt="Logo"
              class="w-12 max-w-[50px] h-auto grayscale opacity-90"
              style="width: 50px;"
            />
          </div>
        </th>
        {#each slots as slot}
          <th class="border border-black p-0 text-center bg-zinc-50 w-[14px]">
            <div class="flex flex-col items-center justify-center h-full">
              <div
                class="text-[10px] font-medium [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap leading-none"
              >
                {slot.time}
              </div>
            </div>
          </th>
        {/each}
      </tr>
      <!-- Row 3: Dates -->
      <tr class="h-14 text-black">
        <!-- Cell merged with above -->
        {#each slots as slot}
          <th class="border border-black p-0 text-center bg-zinc-50 w-[14px]">
            <div class="flex flex-col items-center justify-end h-full">
              <div
                class="font-medium text-[10px] [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap leading-none"
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
        <tr class="h-11">
          <td
            class="border border-black p-1 font-bold bg-zinc-50 whitespace-nowrap px-1.5 text-[13px] leading-tight text-black"
            >{p.fullName}</td
          >
          {#each slots as slot}
            {@const code = gridData[slot.id]?.[p.fullName] || ""}
            <td class="border border-black p-0 text-center align-middle">
              <span
                class="font-bold text-[14px] {isSunday(slot.date) && code
                  ? 'text-red-600'
                  : ''}">{code}</span
              >
            </td>
          {/each}
        </tr>
      {/each}

      <!-- Separator line -->
      <tr class="h-2 bg-zinc-200">
        <td class="border border-black bg-zinc-200"></td>
        {#each slots as slot}
          <td class="border border-black bg-zinc-200"></td>
        {/each}
      </tr>

      {#each group2 as p}
        <tr class="h-11">
          <td
            class="border border-black p-1 font-bold bg-zinc-50 whitespace-nowrap px-1.5 text-[13px] leading-tight text-black"
            >{p.fullName}</td
          >
          {#each slots as slot}
            {@const code = gridData[slot.id]?.[p.fullName] || ""}
            <td class="border border-black p-0 text-center align-middle">
              <span class="font-bold text-[14px]">{code}</span>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  @media print {
    @page {
      size: A4 landscape;
      margin: 10mm 15mm; /* Top/Bottom 10mm, Left/Right 15mm */
    }
    .print-container {
      padding: 0 !important;
      width: auto !important;
      max-width: none !important;
      margin: 0 !important;
    }
    :global(body),
    :global(html) {
      margin: 0 !important;
      padding: 0 !important;
      width: auto !important;
      height: auto !important;
    }
  }

  table {
    table-layout: auto;
    width: auto;
  }
</style>
