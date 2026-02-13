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
      class="bg-zinc-50/80 dark:bg-zinc-800/80 backdrop-blur-md border-zinc-200 dark:border-zinc-700 print:hidden flex-none z-[200] transition-colors duration-300 {$page.url.pathname.includes(
        '/editor/',
      )
        ? ''
        : 'border-b'}"
    >
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <img
            src="/logo-light.png"
            alt="Logo"
            class="h-10 w-auto dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt="Logo"
            class="h-10 w-auto hidden dark:block"
          />
          <div>
            <h1
              class="text-2xl font-normal text-zinc-900 dark:text-white leading-none tracking-tight"
            >
              διάκονος
            </h1>
          </div>
        </div>

        <!-- Spacer to push nav to right -->
        <div class="flex-1"></div>

        <!-- Page-specific controls (slots) -->
        <div id="header-controls" class="flex items-center gap-4">
          <!-- Will be populated by pages -->
        </div>

        <nav class="flex items-center gap-6 mx-4">
          {#if $page.url.pathname !== "/"}
            <a
              href="/"
              title="Dashboard"
              aria-label="Dashboard"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all shadow-sm hover:shadow-blue-500/20"
            >
              <LayoutDashboard size={18} />
            </a>
            <a
              href="/plans"
              title="Pläne"
              aria-label="Pläne"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white transition-all shadow-sm hover:shadow-emerald-500/20"
            >
              <Calendar size={18} />
            </a>
            <a
              href="/meetings"
              title="Meetings"
              aria-label="Meetings"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-600 dark:hover:text-white transition-all shadow-sm hover:shadow-amber-500/20"
            >
              <ClipboardList size={18} />
            </a>
          {/if}
        </nav>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 pl-4">
            <!-- User Info Card -->
            <div
              class="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <div
                class="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-primary-500/20"
              >
                {($user.name || $user.username || "U").charAt(0).toUpperCase()}
              </div>
              <div class="hidden sm:block text-left">
                <p
                  class="text-xs font-bold text-zinc-900 dark:text-white leading-tight"
                >
                  {$user.name || $user.username}
                </p>
                <p
                  class="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight capitalize"
                >
                  {$user.role || "Mitglied"}
                </p>
              </div>

              <div class="flex items-center gap-1 ml-1 pl-1">
                <a
                  href="/settings"
                  title="Einstellungen"
                  class="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-500 text-white hover:bg-slate-600 shadow-sm hover:shadow-slate-500/20 transition-all border border-transparent"
                >
                  <Settings size={18} />
                </a>
                <button
                  onclick={logout}
                  title="Abmelden"
                  class="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-sm hover:shadow-red-500/20 transition-all border border-transparent"
                >
                  <LogOut size={18} />
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
