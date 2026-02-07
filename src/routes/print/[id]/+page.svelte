<script lang="ts">
  import PrintLayout from '$lib/components/PrintLayout.svelte';
  import { onMount } from 'svelte';
  import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWednesday, isFriday, isSunday, addMonths } from 'date-fns';
  import { de } from 'date-fns/locale';

  // Mock data for the print view
  const preachers = [
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

  const selectedMonth = new Date(2026, 2, 1); // März 2026
  const start = startOfMonth(selectedMonth);
  const end = endOfMonth(addMonths(selectedMonth, 1));
  const dates = eachDayOfInterval({ start, end }).filter(d => isWednesday(d) || isFriday(d) || isSunday(d));

  const title = `DIENSTPLAN ${format(selectedMonth, 'MMMM', { locale: de })} - ${format(addMonths(selectedMonth, 1), 'MMMM yyyy', { locale: de })}`.toUpperCase();

  const gridData = {
    '2026-03-01': { 'Schilling': 'L', 'Müller': '1' },
    '2026-03-04': { 'Enns': 'T' },
    '2026-04-01': { 'Lorenz': '2', 'Penner': 'L' },
  };

  const specialEvents = {
    '2026-03-15': 'Zeugnisabend',
    '2026-04-12': 'Ostern'
  };

  onMount(() => {
    // window.print();
  });
</script>

<div class="bg-white">
  <PrintLayout 
    {title} 
    {dates} 
    {preachers} 
    {gridData} 
    {specialEvents} 
  />
</div>

<style>
  :global(body) {
    background: white;
  }
</style>
