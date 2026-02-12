<script lang="ts">
  import GridEditor from "$lib/components/GridEditor.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Editor | Predigerplan Pro</title>
</svelte:head>

{#if data.error}
  <div
    class="flex-1 flex items-center justify-center transition-colors duration-300"
  >
    <div class="flex flex-col items-center gap-4 text-center p-8">
      <div class="text-red-500 text-5xl">⚠️</div>
      <p class="text-zinc-700 dark:text-zinc-200 font-medium">
        Fehler beim Laden der Daten
      </p>
      <p class="text-zinc-500 dark:text-zinc-400 text-sm max-w-md">
        {data.error}
      </p>
    </div>
  </div>
{:else}
  <GridEditor
    serverSlots={data.slots}
    serverPreachers={data.preachers}
    serverAbsences={data.absences}
    serverAssignments={data.assignments}
    serverServiceRules={data.serviceRules}
  />
{/if}
