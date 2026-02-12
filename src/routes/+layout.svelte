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
  import ThemeSwitcher from "$lib/components/ThemeSwitcher.svelte";

  let { children } = $props();

  function logout() {
    pb.authStore.clear();
  }
</script>

<div
  class="h-screen flex flex-col overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300"
>
  <!-- Navigation (Hidden on print) -->
  <header
    class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 no-print flex-none z-50 transition-colors duration-300"
  >
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
          <h1
            class="text-lg font-bold text-slate-900 dark:text-white leading-none"
          >
            Predigerplan Pro
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Einfache Dienstplanung
          </p>
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
          title="Übersicht"
          aria-label="Übersicht"
          class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
        >
          <LayoutDashboard size={20} />
        </a>
        <a
          href="/plans"
          title="Pläne"
          aria-label="Pläne"
          class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
        >
          <Calendar size={20} />
        </a>
        <a
          href="/meetings"
          title="Meetings"
          aria-label="Meetings"
          class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
        >
          <ClipboardList size={20} />
        </a>
        <ThemeSwitcher />
      </nav>

      <div class="flex items-center gap-4">
        {#if $user}
          <div
            class="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-800"
          >
            <!-- User Info Card -->
            <div
              class="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-700/50 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <div
                class="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-primary-500/20"
              >
                {($user.name || $user.username || "U").charAt(0).toUpperCase()}
              </div>
              <div class="hidden sm:block text-left">
                <p
                  class="text-xs font-bold text-slate-900 dark:text-white leading-tight"
                >
                  {$user.name || $user.username}
                </p>
                <p
                  class="text-[10px] text-slate-500 dark:text-slate-400 leading-tight capitalize"
                >
                  {$user.role || "Mitglied"}
                </p>
              </div>

              <div
                class="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 ml-1 pl-1"
              >
                <a
                  href="/settings"
                  title="Einstellungen"
                  class="p-1.5 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded-lg hover:bg-white dark:hover:bg-slate-700 shadow-sm sm:shadow-none"
                >
                  <Settings size={16} />
                </a>
                <button
                  onclick={logout}
                  title="Abmelden"
                  class="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-white dark:hover:bg-slate-700 shadow-sm sm:shadow-none"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        {:else}
          <a
            href="/login"
            class="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <User size={16} />
            Login
          </a>
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
