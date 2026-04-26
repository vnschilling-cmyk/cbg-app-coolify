<script lang="ts">
  import "../app.css";
  import { pb, user } from "$lib/pocketbase";
  import { onMount } from "svelte";
  import {
    LayoutDashboard,
    Calendar,
    ClipboardList,
    Settings,
    LogOut,
    User,
  } from "lucide-svelte";

  import { page } from "$app/stores";
  import NotificationProvider from "$lib/components/NotificationProvider.svelte";

  let { children } = $props();

  function logout() {
    pb.authStore.clear();
  }
</script>

<div
  class="h-screen flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 print:overflow-visible print:h-auto"
>
  {#if $user && $page.url.pathname !== "/login"}
    <!-- Navigation (Hidden on print) -->
    <header
      id="main-header"
      class="bg-dark-bg border-dark-border print:hidden flex-none z-[200] transition-colors duration-300 border-b"
    >
      <div
        class="max-w-full mx-auto px-6 h-16 flex items-center justify-between"
      >
        <a
          href="/"
          class="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div class="w-10 h-10 flex items-center justify-center bg-dark-surface rounded-xl border border-dark-border shadow-lg">
            <svg viewBox="0 0 24 24" class="w-6 h-6 text-white fill-none stroke-current stroke-2" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
              <path d="M12 6v12M8 10h8" />
            </svg>
          </div>
          <h1 class="text-2xl font-light text-white tracking-widest lowercase">
            διάκονος
          </h1>
        </a>

        <!-- Page-specific controls (slots) -->
        <div id="header-controls" class="flex-1 flex justify-center px-4">
          <!-- Will be populated by GridEditor -->
        </div>

        <div class="flex items-center gap-4">
          <!-- User Profile -->
          <div class="flex items-center gap-4">
             <div class="flex items-center gap-3 bg-dark-surface px-4 py-1.5 rounded-2xl border border-dark-border shadow-sm">
                <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-black text-[10px]">
                  {($user.name || $user.username || "U").charAt(0).toUpperCase()}
                </div>
                <div class="hidden md:block text-left">
                  <p class="text-xs font-bold text-white leading-tight">
                    {$user.name || $user.username}
                  </p>
                  <p class="text-[10px] text-zinc-500 leading-tight">
                    {$user.role || "Mitglied"}
                  </p>
                </div>
                
                <div class="flex items-center gap-1.5 ml-2 border-l border-dark-border pl-3">
                  <a
                    href="/settings"
                    title="Einstellungen"
                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600 hover:text-white transition-all"
                  >
                    <Settings size={16} />
                  </a>
                  <button
                    onclick={logout}
                    title="Abmelden"
                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
             </div>
          </div>
        </div>
      </div>
    </header>

  {/if}

  <!-- Main Content -->
  <main class="flex-1 min-h-0 overflow-hidden">
    {@render children()}
  </main>
</div>

<NotificationProvider />

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
</style>
