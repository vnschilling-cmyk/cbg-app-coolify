<script lang="ts">
  import GridEditor from '$lib/components/GridEditor.svelte';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  
  let { data } = $props();
  let loading = $state(true);
  let plan = $state(null);

  onMount(async () => {
    // In a real app, fetch plan by ID from Pocketbase
    // For now, we simulate a loading state
    setTimeout(() => {
      loading = false;
    }, 500);
  });
</script>

<svelte:head>
  <title>Editor | Predigerplan Pro</title>
</svelte:head>

{#if loading}
  <div class="flex-1 flex items-center justify-center bg-slate-50">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-slate-500 font-medium animate-pulse">Lade Planungsdaten...</p>
    </div>
  </div>
{:else}
  <GridEditor />
{/if}
