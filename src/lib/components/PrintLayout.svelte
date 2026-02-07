<script lang="ts">
  import { format } from 'date-fns';
  import { de } from 'date-fns/locale';

  interface Props {
    title: string;
    dates: Date[];
    preachers: string[];
    gridData: Record<string, Record<string, string>>;
    specialEvents?: Record<string, string>;
  }

  let { title, dates, preachers, gridData, specialEvents = {} }: Props = $props();

  const LEGEND = [
    { code: 'L', label: 'Leitung' },
    { code: '1', label: 'Predigt 10-15 Min' },
    { code: '2', label: 'Predigt 30-40 Min' },
    { code: 'T', label: 'Beteiligung an Bibelstunden' },
    { code: 'G', label: 'Leitung Gebetstunde' }
  ];
</script>

<div class="print-container bg-white p-[1cm] text-black w-full min-h-screen">
  <!-- Header -->
  <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-6">
    <h1 class="text-2xl font-black uppercase tracking-widest">{title}</h1>
    <div class="text-sm font-bold">PREDIGERPLAN PRO</div>
  </div>

  /* Matrix */
  <table class="w-full border-collapse border-2 border-black text-[10px]">
    <thead>
      <tr>
        <th class="border border-black bg-slate-100 w-24"></th>
        {#each [...new Set(dates.map(d => d.getMonth()))] as monthIdx}
          {@const monthDate = dates.find(d => d.getMonth() === monthIdx)}
          {@const monthDates = dates.filter(d => d.getMonth() === monthIdx)}
          <th colspan={monthDates.length} class="border border-black p-1 text-center bg-slate-100 uppercase font-black tracking-[0.3em] text-[10px]">
            {format(monthDate, 'MMMM yyyy', { locale: de })}
          </th>
        {/each}
      </tr>
      <tr>
        <th class="border border-black p-1 bg-slate-50 w-24 font-bold uppercase text-[8px]">Prediger</th>
        {#each dates as date}
          <th class="border border-black p-0.5 text-center bg-slate-50">
            <div class="font-bold text-[8px] leading-tight">{format(date, 'eee', { locale: de })}</div>
            <div class="font-black leading-tight border-t border-black/10 mt-0.5 pt-0.5">{format(date, 'dd.MM.')}</div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each preachers as preacher}
        <tr>
          <td class="border border-black p-1 font-bold bg-slate-50 truncate">{preacher}</td>
          {#each dates as date}
            {@const code = gridData[format(date, 'yyyy-MM-dd')]?.[preacher] || ''}
            <td class="border border-black p-0 text-center align-middle h-6">
              <span class="font-black text-xs">{code}</span>
            </td>
          {/each}
        </tr>
      {/each}

      <!-- Special Row for Locations / Events -->
      <tr class="bg-slate-100">
        <td class="border border-black p-1 font-bold italic">Besonderheiten</td>
        {#each dates as date}
          <td class="border border-black p-0.5 text-[7px] font-bold text-center leading-[1.1] overflow-hidden">
            {specialEvents[format(date, 'yyyy-MM-dd')] || ''}
          </td>
        {/each}
      </tr>
    </tbody>
  </table>

  <!-- Footer / Legend -->
  <div class="mt-8 flex justify-between items-start gap-12">
    <!-- Legend -->
    <div class="flex-1 border border-black p-4">
      <h3 class="text-[10px] font-black uppercase tracking-tighter mb-2 underline">Erklärung der Kürzel:</h3>
      <div class="grid grid-cols-2 gap-x-8 gap-y-1">
        {#each LEGEND as item}
          <div class="flex gap-2 text-[9px]">
            <span class="font-black w-3">{item.code}:</span>
            <span>{item.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Notes -->
    <div class="flex-1 border border-black p-4 h-full">
      <h3 class="text-[10px] font-black uppercase tracking-tighter mb-2 underline">Hinweise:</h3>
      <div class="text-[9px] leading-relaxed">
        Bitte bei Verhinderung selbstständig für Ersatz sorgen und die Leitung informieren. 
        Die aktuellen Termine sind auch in ChurchTools hinterlegt.
      </div>
    </div>

    <!-- Signature -->
    <div class="w-48 text-right self-end pb-2">
      <div class="border-b border-black h-8 mb-1"></div>
      <div class="text-[8px] font-bold uppercase tracking-widest opacity-50">Gemeindeleitung</div>
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
