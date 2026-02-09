<script lang="ts">
  import PrintLayout from '$lib/components/PrintLayout.svelte';
  import { onMount } from 'svelte';
  import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWednesday, isFriday, isSaturday, isSunday, addMonths } from 'date-fns';
  import { de } from 'date-fns/locale';

  // Mock data for the print view
  const RAW_PREACHERS = [
    { firstName: 'Dietrich', lastName: 'Auschew', role: 'Teilnehmer' },
    { firstName: 'Alexander', lastName: 'Bockshorn', role: 'Teilnehmer' },
    { firstName: 'Christian', lastName: 'Deder', role: 'Teilnehmer 2' },
    { firstName: 'Alexander', lastName: 'Demler', role: 'Leiter' },
    { firstName: 'Konstantin', lastName: 'Demler', role: 'Teilnehmer' },
    { firstName: 'Alexander', lastName: 'Enns', role: 'Teilnehmer' },
    { firstName: 'Jakob', lastName: 'Enns', role: 'Teilnehmer' },
    { firstName: 'Viktor', lastName: 'Enns', role: 'Leiter' },
    { firstName: 'Viktor', lastName: 'Enns', role: 'Teilnehmer 2' },
    { firstName: 'Christoph', lastName: 'Hinsmann', role: 'Teilnehmer 2' },
    { firstName: 'Eduard', lastName: 'Jeske', role: 'Teilnehmer 2' },
    { firstName: 'Edgar', lastName: 'Kampen', role: 'Teilnehmer 2' },
    { firstName: 'Valerij', lastName: 'Letkemann', role: 'Teilnehmer' },
    { firstName: 'Heinrich', lastName: 'Lorenz', role: 'Teilnehmer' },
    { firstName: 'Manuel', lastName: 'Lorenz', role: 'Teilnehmer' },
    { firstName: 'Andreas', lastName: 'Müller', role: 'Teilnehmer' },
    { firstName: 'Christian', lastName: 'Müller', role: 'Teilnehmer 2' },
    { firstName: 'David', lastName: 'Penner', role: 'Teilnehmer' },
    { firstName: 'Jakob', lastName: 'Penner', role: 'Teilnehmer' },
    { firstName: 'Nikolaj', lastName: 'Sabirko', role: 'Teilnehmer' },
    { firstName: 'Viktor', lastName: 'Schilling', role: 'Leiter' },
    { firstName: 'Gustav', lastName: 'Schmidt', role: 'Teilnehmer 2' },
    { firstName: 'Michail', lastName: 'Suzchniev', role: 'Teilnehmer' },
    { firstName: 'Florian', lastName: 'Wiese', role: 'Teilnehmer' }
  ];

  const group1 = RAW_PREACHERS.filter(p => p.role === 'Leiter' || p.role === 'Teilnehmer')
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .map(p => ({ ...p, fullName: `${p.firstName} ${p.lastName}` }));
  
  const group2 = RAW_PREACHERS.filter(p => p.role === 'Teilnehmer 2')
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .map(p => ({ ...p, fullName: `${p.firstName} ${p.lastName}` }));

  const selectedMonth = new Date(2026, 2, 1); // März 2026
  const start = startOfMonth(selectedMonth);
  const end = endOfMonth(addMonths(selectedMonth, 1));
  const days = eachDayOfInterval({ start, end });
  
  const slots: any[] = [];
  
  const shouldIncludeEvent = (date: Date, calendar: string) => {
    if (calendar === 'Sondergemeinschaften' && isSaturday(date)) return false;
    return true;
  };

  days.forEach(d => {
    const dateStr = format(d, 'yyyy-MM-dd');
    
    // Standard Days
    if (isSunday(d)) {
      slots.push({ id: `${dateStr}-1`, date: d, time: '09:30', label: 'Gottesdienst', calendar: 'Gottesdienst' });
      slots.push({ id: `${dateStr}-2`, date: d, time: '17:00', label: 'Gottesdienst', calendar: 'Gottesdienst', isSundaySecond: true });
    } else if (isWednesday(d)) {
      slots.push({ id: `${dateStr}`, date: d, time: '19:00', label: 'Gebetsstunde', calendar: 'Gottesdienst' });
    } else if (isFriday(d)) {
      slots.push({ id: `${dateStr}`, date: d, time: '19:00', label: 'Bibelstunde', calendar: 'Gottesdienst' });
    }

    // Tuesday Mock
    if (format(d, 'eee') === 'Tue' && d.getDate() < 8) {
      slots.push({ id: `${dateStr}`, date: d, time: '18:30', label: 'Sondertermin', calendar: 'Bad Neustadt' });
    }

    // Saturday Mock (Sondergemeinschaften - HIDDEN)
    if (isSaturday(d) && d.getDate() === 7) {
      if (shouldIncludeEvent(d, 'Sondergemeinschaften')) {
        slots.push({ id: `${dateStr}`, date: d, time: '10:00', label: 'Sonder-Sa', calendar: 'Sondergemeinschaften' });
      }
    }

    // Saturday Mock (Other - SHOWN)
    if (isSaturday(d) && d.getDate() === 14) {
      if (shouldIncludeEvent(d, 'Bad Neustadt')) {
        slots.push({ id: `${dateStr}`, date: d, time: '15:00', label: 'Sa-Event', calendar: 'Bad Neustadt' });
      }
    }
  });

  slots.sort((a, b) => a.date.getTime() - b.date.getTime() || a.time.localeCompare(b.time));

  const title = `DIENSTPLAN ${format(selectedMonth, 'MMMM', { locale: de })} - ${format(addMonths(selectedMonth, 1), 'MMMM yyyy', { locale: de })}`.toUpperCase();

  const gridData = {
    '2026-03-01-1': { 'Schilling': 'L' },
    '2026-03-04': { 'Enns': 'T' },
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
    {slots} 
    {group1} 
    {group2} 
    {gridData} 
    {specialEvents} 
  />
</div>

<style>
  :global(body) {
    background: white;
  }
</style>
