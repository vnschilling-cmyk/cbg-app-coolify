<script lang="ts">
    import { pb } from "$lib/pocketbase";
    import { UserCheck, UserX } from "lucide-svelte";

    interface Member {
        id: string;
        name: string;
        role?: string;
    }

    interface Attendance {
        id: string;
        meeting_id: string;
        member_id: string;
        present: boolean;
    }

    interface Props {
        members: Member[];
        attendance: Attendance[];
        meetingId: string;
    }

    let { members, attendance, meetingId }: Props = $props();

    let localAttendance = $state<Attendance[]>(
        attendance.map((a) => ({ ...a })),
    );

    let presentCount = $derived(
        localAttendance.filter((a) => a.present).length,
    );

    function isPresent(memberId: string): boolean {
        return (
            localAttendance.find((a) => a.member_id === memberId)?.present ??
            false
        );
    }

    function getAttendanceRecord(memberId: string): Attendance | undefined {
        return localAttendance.find((a) => a.member_id === memberId);
    }

    async function toggleAttendance(memberId: string) {
        const existing = getAttendanceRecord(memberId);

        if (existing) {
            // Update existing record
            const newPresent = !existing.present;
            // Optimistic update
            localAttendance = localAttendance.map((a) =>
                a.member_id === memberId ? { ...a, present: newPresent } : a,
            );
            try {
                await pb
                    .collection("meeting_attendance")
                    .update(existing.id, { present: newPresent });
            } catch (err) {
                console.error("Failed to update attendance:", err);
                // Revert
                localAttendance = localAttendance.map((a) =>
                    a.member_id === memberId
                        ? { ...a, present: !newPresent }
                        : a,
                );
            }
        } else {
            // Create new record
            const tempId = `temp-${memberId}`;
            const newRecord: Attendance = {
                id: tempId,
                meeting_id: meetingId,
                member_id: memberId,
                present: true,
            };
            localAttendance = [...localAttendance, newRecord];
            try {
                const created = await pb
                    .collection("meeting_attendance")
                    .create({
                        meeting_id: meetingId,
                        member_id: memberId,
                        present: true,
                    });
                localAttendance = localAttendance.map((a) =>
                    a.id === tempId ? { ...a, id: created.id } : a,
                );
            } catch (err) {
                console.error("Failed to create attendance:", err);
                localAttendance = localAttendance.filter(
                    (a) => a.id !== tempId,
                );
            }
        }
    }

    // Realtime subscription
    import { onMount, onDestroy } from "svelte";
    let unsubscribe: (() => void) | null = null;

    onMount(async () => {
        try {
            unsubscribe = await pb
                .collection("meeting_attendance")
                .subscribe("*", (e) => {
                    const record = e.record as unknown as Attendance;
                    if (record.meeting_id !== meetingId) return;

                    if (e.action === "create") {
                        if (!localAttendance.find((a) => a.id === record.id)) {
                            localAttendance = [...localAttendance, record];
                        }
                    } else if (e.action === "update") {
                        localAttendance = localAttendance.map((a) =>
                            a.id === record.id ? record : a,
                        );
                    } else if (e.action === "delete") {
                        localAttendance = localAttendance.filter(
                            (a) => a.id !== record.id,
                        );
                    }
                });
        } catch (err) {
            console.error("Failed to subscribe to attendance:", err);
        }
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });
</script>

<div
    class="bg-white dark:bg-zinc-800/80 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm overflow-hidden"
>
    <!-- Header -->
    <div
        class="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-700/50"
    >
        <div class="flex items-center gap-2.5">
            <div
                class="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400"
            >
                <UserCheck size={15} />
            </div>
            <h3
                class="text-sm font-bold text-zinc-900 dark:text-white tracking-wide uppercase"
            >
                Anwesenheit
            </h3>
        </div>
        <span
            class="text-xs font-semibold px-2.5 py-1 rounded-full {presentCount ===
            members.length
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'}"
        >
            {presentCount}/{members.length}
        </span>
    </div>

    <!-- Member Chips -->
    <div class="px-4 py-3 flex flex-wrap gap-2">
        {#each members as member}
            {@const present = isPresent(member.id)}
            <button
                onclick={() => toggleAttendance(member.id)}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 {present
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm'
                    : 'bg-zinc-50 dark:bg-zinc-700/50 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 line-through'}"
                title={present
                    ? `${member.name} ist anwesend`
                    : `${member.name} ist abwesend`}
            >
                {#if present}
                    <UserCheck size={12} />
                {:else}
                    <UserX size={12} />
                {/if}
                {member.name}
                {#if member.role}
                    <span class="opacity-50 font-normal">• {member.role}</span>
                {/if}
            </button>
        {/each}

        {#if members.length === 0}
            <p class="text-xs text-zinc-400 dark:text-zinc-500 py-1">
                Keine Mitglieder angelegt. Verwalte Mitglieder auf der
                Meetings-Übersichtsseite.
            </p>
        {/if}
    </div>
</div>
