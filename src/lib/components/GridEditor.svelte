<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, Save, Download, Printer, ChevronLeft, ChevronRight, User } from 'lucide-svelte';
  import { format, addMonths, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isWednesday, isFriday, isSunday, isFirstDayOfMonth } from 'date-fns';
  import { de } from 'date-fns/locale';

  // Constants
  const SERVICE_TYPES = [
    { code: 'L', label: 'Leitung', color: 'bg-blue-100 text-blue-700' },
    { code: '1', label: 'Predigt (10-15m)', color: 'bg-green-100 text-green-700' },
    { code: '2', label: 'Predigt (30-40m)', color: 'bg-purple-100 text-purple-700' },
    { code: 'T', label: 'Bibelstunde', color: 'bg-orange-100 text-orange-700' },
    { code: 'G', label: 'Gebetstunde', color: 'bg-amber-100 text-amber-700' }
  ];

  const PREACHERS = [
    { firstName: 'Alexander', lastName: 'Auschew' },
    { firstName: 'Eduard', lastName: 'Bockshorn' },
    { firstName: 'Viktor', lastName: 'Demler' },
    { firstName: 'Waldemar', lastName: 'Enns' },
    { firstName: 'Johann', lastName: 'Letkemann' },
    { firstName: 'Andreas', lastName: 'Lorenz' },
    { firstName: 'Peter', lastName: 'Müller' },
    { firstName: 'Heinrich', lastName: 'Penner' },
    { firstName: 'Sergej', lastName: 'Sabirko' },
    { firstName: 'Waldemar', lastName: 'Schilling' },
    { firstName: 'Jakob', lastName: 'Wiese' }
  ].sort((a, b) => a.lastName.localeCompare(b.lastName))
   .map(p => `${p.firstName} ${p.lastName}`);

  // State
  let selectedMonth = new Date(2026, 2, 1); // Start with March 2026
  let gridData = $state<Record<string, Record<string, string>>>({});
  
  // Computed: Get relevant dates (Mi, Fr, So) for the 2-month period
  let dates = $derived.by(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(addMonths(selectedMonth, 1));
    const days = eachDayOfInterval({ start, end });
    
    return days.filter(d => isWednesday(d) || isFriday(d) || isSunday(d));
  });

  function getCellKey(preacher: string, date: Date) {
    return `${preacher}-${format(date, 'yyyy-MM-dd')}`;
  }

  function toggleService(preacher: string, date: Date) {
    const key = getCellKey(preacher, date);
    const dateKey = format(date, 'yyyy-MM-dd');
    
    if (!gridData[dateKey]) gridData[dateKey] = {};
    
    const current = gridData[dateKey][preacher] || '';
    const currentIndex = SERVICE_TYPES.findIndex(s => s.code === current);
    
    if (currentIndex === -1) {
      gridData[dateKey][preacher] = SERVICE_TYPES[0].code;
    } else if (currentIndex === SERVICE_TYPES.length - 1) {
      delete gridData[dateKey][preacher];
    } else {
      gridData[dateKey][preacher] = SERVICE_TYPES[currentIndex + 1].code;
    }
  }

  function getServiceStyle(code: string) {
    return SERVICE_TYPES.find(s => s.code === code)?.color || 'bg-white';
  }

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
    await new Promise(r => setTimeout(r, 1200));
    saving = false;
    alert('Plan erfolgreich gespeichert!');
  }
</script>

<div class="flex-1 flex flex-col bg-slate-50 overscroll-none">
  <!-- Editor Toolbar -->
  <div class="bg-white border-b border-slate-200 p-4 flex items-center justify-between no-print sticky top-16 z-40">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
        <button onclick={prevMonth} class="p-1.5 hover:bg-white rounded-md transition-all">
          <ChevronLeft size={20} />
        </button>
        <div class="px-4 py-1.5 font-bold text-slate-700 min-w-[240px] text-center">
          {format(selectedMonth, 'MMMM', { locale: de })} - {format(addMonths(selectedMonth, 1), 'MMMM yyyy', { locale: de })}
        </div>
        <button onclick={nextMonth} class="p-1.5 hover:bg-white rounded-md transition-all">
          <ChevronRight size={20} />
        </button>
      </div>

      <div class="h-8 w-px bg-slate-200"></div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">Legende:</span>
        {#each SERVICE_TYPES as type}
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full {type.color} text-xs font-bold border border-current opacity-80">
            <span class="w-4 text-center">{type.code}</span>
            <span class="opacity-70">{type.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <a href="/print/1" target="_blank" class="btn btn-secondary flex items-center gap-2">
        <Printer size={18} />
        Drucken
      </a>
      <button 
        onclick={savePlan} 
        disabled={saving}
        class="btn btn-primary flex items-center gap-2 min-w-[120px] justify-center"
      >
        {#if saving}
          <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Speichere...
        {:else}
          <Save size={18} />
          Speichern
        {/if}
      </button>
    </div>
  </div>

  <!-- Grid Container -->
  <div class="flex-1 overflow-auto p-8">
    <div class="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 inline-block min-w-full overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-slate-200 border-b border-slate-300">
            <th class="sticky left-0 z-30 bg-slate-200 border-r border-slate-300 p-2 shadow-[2px_0_5px_rgba(0,0,0,0.05)] text-left">
              <span class="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-2">Zeitraum</span>
            </th>
            {#each [selectedMonth, addMonths(selectedMonth, 1)] as month}
              {@const monthDates = dates.filter(d => d.getMonth() === month.getMonth())}
              {#if monthDates.length > 0}
                <th colspan={monthDates.length} class="border-r border-slate-300 p-2 text-center bg-slate-100">
                  <span class="text-xs font-black uppercase tracking-[0.3em] text-primary-700">
                    {format(month, 'MMMM yyyy', { locale: de })}
                  </span>
                </th>
              {/if}
            {/each}
          </tr>
          <tr class="bg-slate-50 border-b border-slate-200">
            <th class="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 p-4 text-left w-48 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
              <div class="flex items-center gap-2 text-slate-400">
                <User size={18} />
                <span class="text-sm font-bold uppercase tracking-wider">Prediger</span>
              </div>
            </th>
            {#each dates as date}
              <th class="border-r border-slate-100 p-3 min-w-[60px] text-center">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">
                  {format(date, 'eee', { locale: de })}
                </div>
                <div class="text-lg font-black text-slate-700 leading-none">
                  {format(date, 'dd')}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each PREACHERS as preacher}
            <tr class="hover:bg-slate-50/50 group transition-colors">
              <td class="sticky left-0 z-20 bg-white border-r border-slate-100 group-hover:bg-slate-50 p-4 font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                {preacher}
              </td>
              {#each dates as date}
                {@const code = gridData[format(date, 'yyyy-MM-dd')]?.[preacher] || ''}
                <td 
                  class="border-b border-r border-slate-100 p-0 hover:bg-primary-50 transition-all cursor-pointer select-none"
                  onclick={() => toggleService(preacher, date)}
                >
                  <div class="w-full h-12 flex items-center justify-center font-black text-lg transition-transform active:scale-90 {getServiceStyle(code)}">
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

<style>
  @reference "../../app.css";

  /* Sticky header shadows */
  thead th {
    @apply sticky top-0 bg-slate-50 z-30;
  }
  
  /* Prevent focus outline on click-heavy interface */
  :root {
    -webkit-tap-highlight-color: transparent;
  }
</style>
