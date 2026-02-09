<script lang="ts">
  import GridEditor from "$lib/components/GridEditor.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Editor | Predigerplan Pro</title>
</svelte:head>

{#if data.error}
  <div class="flex-1 flex items-center justify-center bg-slate-50">
    <div class="flex flex-col items-center gap-4 text-center p-8">
      <div class="text-red-500 text-5xl">⚠️</div>
      <p class="text-slate-700 font-medium">Fehler beim Laden der Daten</p>
      <p class="text-slate-500 text-sm">{data.error}</p>
    </div>
  </div>
{:else}
  <GridEditor
    serverSlots={data.slots}
    serverPreachers={data.preachers}
    serverAbsences={data.absences}
  />
{/if}
