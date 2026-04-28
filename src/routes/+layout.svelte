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
      class="bg-dark-bg text-white border-dark-border print:hidden flex-none z-[200] transition-colors duration-300"
    >
      <div class="px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="/"
          class="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div class="w-10 h-10 rounded-xl bg-dark-surface flex items-center justify-center border border-dark-border">
            <img
              src="/logo-dark.png"
              alt="Logo"
              class="h-8 w-auto"
            />
          </div>
          <h1 class="text-xl font-bold tracking-tight">
            διά코νος
          </h1>
        </a>

        <!-- Middle: Page-specific controls -->
        <div id="header-controls" class="flex-1 flex justify-center items-center">
          <!-- Will be populated by pages -->
        </div>

        <div class="flex items-center gap-3">
          <!-- User Info Pill -->
          <div
            class="flex items-center gap-3 bg-dark-surface px-3 py-1.5 rounded-2xl border border-dark-border shadow-lg"
          >
            <div
              class="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-blue-500/20"
            >
              {($user.name || $user.username || "U").charAt(0).toUpperCase()}
            </div>
            <div class="hidden md:block text-left">
              <p class="text-xs font-bold text-white leading-tight">
                {$user.name || $user.username}
              </p>
              <p class="text-[9px] text-zinc-400 leading-tight uppercase tracking-wider">
                {$user.role || "Mitglied"}
              </p>
            </div>

            <div class="flex items-center gap-1.5 ml-2">
              <a
                href="/settings"
                title="Einstellungen"
                class="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-700/50 text-zinc-300 hover:text-white hover:bg-zinc-600 transition-all"
              >
                <Settings size={16} />
              </a>
              <button
                onclick={logout}
                title="Abmelden"
                class="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
              >
                <LogOut size={16} />
              </button>
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
