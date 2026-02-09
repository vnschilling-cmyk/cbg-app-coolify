<script lang="ts">
  import "../app.css";
  import { pb, user } from "$lib/pocketbase";
  import { onMount } from "svelte";
  import {
    LayoutDashboard,
    Calendar,
    Settings,
    LogOut,
    User,
  } from "lucide-svelte";

  let { children } = $props();

  function logout() {
    pb.authStore.clear();
  }
</script>

<div class="h-screen flex flex-col overflow-hidden">
  <!-- Navigation (Hidden on print) -->
  <header class="bg-white border-b border-slate-200 no-print flex-none z-50">
    <div
      class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
    >
      <div class="flex items-center gap-2">
        <div
          class="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold text-xl"
        >
          P
        </div>
        <div>
          <h1 class="text-lg font-bold text-slate-900 leading-none">
            Predigerplan Pro
          </h1>
          <p class="text-xs text-slate-500">Service Planning Made Easy</p>
        </div>
      </div>

      <!-- Spacer to push nav to right -->
      <div class="flex-1"></div>

      <!-- Page-specific controls (slots) -->
      <div id="header-controls" class="flex items-center gap-4">
        <!-- Will be populated by pages -->
      </div>

      <nav class="flex items-center gap-6 mx-4">
        <a
          href="/"
          title="Dashboard"
          aria-label="Dashboard"
          class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-primary-600 hover:bg-slate-50 transition-all"
        >
          <LayoutDashboard size={20} />
        </a>
        <a
          href="/plans"
          title="Pläne"
          aria-label="Pläne"
          class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-primary-600 hover:bg-slate-50 transition-all"
        >
          <Calendar size={20} />
        </a>
      </nav>

      <div class="flex items-center gap-4">
        {#if $user}
          <div class="flex items-center gap-3 pl-4 border-l border-slate-200">
            <div class="text-right">
              <p class="text-sm font-semibold text-slate-900">
                {$user.name || $user.username}
              </p>
              <button
                onclick={logout}
                title="Logout"
                aria-label="Logout"
                class="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
              >
                <LogOut size={16} />
              </button>
            </div>
            <div
              class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"
            >
              <User size={18} />
            </div>
          </div>
        {:else}
          <a href="/login" class="btn btn-primary text-sm">Login</a>
        {/if}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 min-h-0 overflow-hidden">
    {@render children()}
  </main>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
</style>
