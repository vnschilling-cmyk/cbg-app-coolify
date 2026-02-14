<script lang="ts">
    import { X } from "lucide-svelte";
    import { format, isSunday } from "date-fns";
    import { de } from "date-fns/locale";

    let {
        close,
        slots = [],
        rows = [],
        assignments = {},
        formatting = {},
    } = $props();

    let previewRef: HTMLElement;

    // Safe hex colors for html2canvas (Tailwind 4 uses oklch which fails)
    const HEX = {
        white: "#ffffff",
        zinc50: "#fafafa",
        zinc100: "#f4f4f5",
        zinc200: "#e4e4e7",
        zinc300: "#d4d4d8",
        zinc600: "#52525b",
        zinc900: "#18181b",
        black: "#000000",
    };

    const SERVICE_TYPES = [
        { code: "L", label: "Leitung" },
        { code: "1", label: "Predigt (10-15m)" },
        { code: "2", label: "Predigt (30-40m)" },
        { code: "BS", label: "Bibelstunde" },
        { code: "GS", label: "Gebetstunde" },
        { code: "V", label: "Verteilen" },
        { code: "BN", label: "Bad Neustadt" },
        { code: "Als", label: "Alsfeld" },
        { code: "Anf", label: "Anfang" },
        { code: "Schl", label: "Schluss" },
        { code: "🍷", label: "Abendmahl", isIcon: true },
    ];

    function getServiceStyle(code: string) {
        if (code === "-") return `color: ${HEX.black}; opacity: 0.4;`;
        return `color: ${HEX.black};`;
    }

    function getFormattingStyle(section: string) {
        const s = formatting[section] || {};
        const isActuallyBold =
            section === "entries" || section === "names" ? false : s.bold;

        // User requested 11px for names (and dates/times are handled in template)
        const fontSize = section === "names" ? 11 : s.fontSize;

        return `font-weight: ${isActuallyBold ? "bold" : "normal"}; font-style: ${s.italic ? "italic" : "normal"}; font-size: ${fontSize}px; font-family: '${s.fontFamily}', sans-serif;`;
    }

    function getDayHighlightStyle(date: Date, time: string) {
        const hour = parseInt(time.split(":")[0], 10);

        if (hour >= 16 && hour < 18) {
            return "";
        }

        if (isSunday(date)) {
            const dateStr = format(date, "yyyy-MM-dd");
            const firstSlotOfThisDay = slots.find(
                (s) => format(s.date, "yyyy-MM-dd") === dateStr,
            );
            if (firstSlotOfThisDay && firstSlotOfThisDay.time === time) {
                return `background-color: ${HEX.zinc100};`;
            }
        }

        return "";
    }
</script>

<div
    class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md print:hidden"
>
    <div
        class="bg-zinc-900 rounded-2xl shadow-2xl flex flex-col max-h-[95vh] w-full max-w-[98vw] overflow-hidden border border-zinc-800"
    >
        <!-- Header -->
        <div
            class="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900"
        >
            <div>
                <h3 class="font-bold text-lg text-zinc-100">Druckvorschau</h3>
                <p class="text-sm text-zinc-500">
                    Optimiert für Ausdruck: Kompakte Legende, reduziert auf das
                    Wesentliche.
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button
                    onclick={close}
                    class="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                >
                    <X size={24} />
                </button>
            </div>
        </div>

        <!-- Preview Area -->
        <div
            class="flex-1 overflow-auto p-8 flex justify-center items-center"
            style="background-color: {HEX.zinc900};"
        >
            <!-- A4 Container (Landscape) -->
            <div
                bind:this={previewRef}
                data-export-root
                class="shadow-2xl relative shrink-0"
                style="width: 297mm; height: 210mm; padding: 6mm; filter: grayscale(1); background-color: {HEX.white}; position: relative; display: block;"
            >
                <div class="w-full h-full flex flex-col">
                    <!-- Table Container - Full Height - Rounded & Shadowed -->
                    <div
                        class="flex-1 w-full relative rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden bg-white"
                        style="background-color: {HEX.white}; border: 1px solid {HEX.zinc200};"
                    >
                        <table
                            class="w-full h-full border-separate border-spacing-0 table-fixed"
                        >
                            <!-- Column Widths -->
                            <colgroup>
                                <col style="width: 45mm;" />
                                <!-- Name Column reduced -->
                                {#each slots as _}
                                    <col />
                                {/each}
                            </colgroup>

                            <thead>
                                <!-- Month Header -->
                                <tr class="h-8">
                                    <th
                                        class="border-r border-b p-1 text-center font-normal"
                                        style="background-color: {HEX.zinc100}; border-color: {HEX.zinc200};"
                                    >
                                        <div
                                            class="flex items-center justify-center"
                                        >
                                            <span
                                                class="uppercase tracking-[0.3em] text-[13px]"
                                                style="{getFormattingStyle(
                                                    'months',
                                                )} color: {HEX.zinc900};"
                                            >
                                                {slots[0]?.date.getFullYear()}
                                            </span>
                                        </div>
                                    </th>
                                    {#each [...new Set(slots.map( (s) => s.date.getMonth(), ))] as mIdx}
                                        {@const monthSlots = slots.filter(
                                            (s) => s.date.getMonth() === mIdx,
                                        )}
                                        <th
                                            colspan={monthSlots.length}
                                            class="border-r border-b p-1 text-center"
                                            style="background-color: {HEX.zinc100}; border-color: {HEX.zinc200};"
                                        >
                                            <span
                                                class="uppercase tracking-[0.3em] text-[13px]"
                                                style="{getFormattingStyle(
                                                    'months',
                                                )} color: {HEX.zinc900};"
                                            >
                                                {format(
                                                    new Date(2024, mIdx, 1),
                                                    "MMMM",
                                                    { locale: de },
                                                )}
                                            </span>
                                        </th>
                                    {/each}
                                </tr>

                                <!-- Time/Logo Row -->
                                <tr class="h-8">
                                    <th
                                        rowspan="2"
                                        class="border-r border-b p-1"
                                        style="background-color: {HEX.white}; border-color: {HEX.zinc200};"
                                    >
                                        <div
                                            class="flex items-center justify-center h-full"
                                        >
                                            <img
                                                src="/logo-light.png"
                                                alt="Logo"
                                                class="h-12 w-auto object-contain"
                                            />
                                        </div>
                                    </th>
                                    {#each slots as slot}
                                        <th
                                            class="border-r border-b p-0 text-center"
                                            style="border-color: {HEX.zinc200}; {getDayHighlightStyle(
                                                slot.date,
                                                slot.time,
                                            )}"
                                        >
                                            <div
                                                class="relative w-full h-10 overflow-hidden"
                                            >
                                                <div
                                                    class="absolute top-2 left-1/2 -translate-x-1/2 tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap"
                                                    style="{getFormattingStyle(
                                                        'dates',
                                                    )} color: {HEX.zinc900}; font-size: 11px;"
                                                >
                                                    {slot.time}
                                                </div>
                                            </div>
                                        </th>
                                    {/each}
                                </tr>

                                <!-- Date Row -->
                                <tr class="h-12">
                                    {#each slots as slot}
                                        <th
                                            class="border-r border-b p-0 text-center"
                                            style="border-color: {HEX.zinc200}; {getDayHighlightStyle(
                                                slot.date,
                                                slot.time,
                                            )}"
                                        >
                                            <div
                                                class="relative w-full h-12 overflow-hidden"
                                            >
                                                <div
                                                    class="absolute bottom-2 left-1/2 -translate-x-1/2 tracking-tight [writing-mode:vertical-rl] -rotate-180 whitespace-nowrap"
                                                    style="{getFormattingStyle(
                                                        'dates',
                                                    )} color: {HEX.zinc900}; font-size: 11px;"
                                                >
                                                    {format(
                                                        slot.date,
                                                        "dd. eee",
                                                        { locale: de },
                                                    )}
                                                </div>
                                            </div>
                                        </th>
                                    {/each}
                                </tr>
                            </thead>

                            <tbody>
                                {#each rows as preacher, idx}
                                    <tr
                                        style="background-color: {idx % 2 === 1
                                            ? HEX.zinc50
                                            : HEX.white};"
                                    >
                                        <td
                                            class="border-r border-b px-2 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                                            style="{getFormattingStyle(
                                                'names',
                                            )} border-color: {HEX.zinc200}; color: {HEX.zinc900};"
                                        >
                                            {preacher.lastName}, {preacher.firstName}
                                        </td>
                                        {#each slots as slot}
                                            {@const preacherName = `${preacher.firstName} ${preacher.lastName}`}
                                            {@const assignment =
                                                assignments[slot.id]?.[
                                                    preacherName
                                                ]}
                                            <td
                                                class="border-r border-b p-0.5 text-center align-middle"
                                                style="border-color: {HEX.zinc200}; {getDayHighlightStyle(
                                                    slot.date,
                                                    slot.time,
                                                )}"
                                            >
                                                {#if assignment}
                                                    <div
                                                        class="flex items-center justify-center text-[10px]"
                                                        style="{getFormattingStyle(
                                                            'entries',
                                                        )} {getServiceStyle(
                                                            assignment,
                                                        )} {assignment === '🍷'
                                                            ? 'filter: brightness(0.4); font-weight: 900; font-size: 12px; line-height: 1;'
                                                            : ''}"
                                                    >
                                                        {assignment}
                                                    </div>
                                                {/if}
                                            </td>
                                        {/each}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- Legend Footer: Compact / Flex -->
                    <div
                        class="mt-2 pt-1.5 border-t flex flex-wrap gap-x-4 gap-y-0.5"
                        style="border-color: {HEX.zinc300};"
                    >
                        {#each SERVICE_TYPES as type}
                            <div class="flex items-center gap-1">
                                <span
                                    class="text-[9px] font-bold"
                                    style="color: {HEX.black}; {type.code ===
                                    '🍷'
                                        ? 'filter: brightness(0.4); font-weight: 900;'
                                        : ''}"
                                >
                                    {type.code}
                                </span>
                                <span class="text-[9px] text-zinc-600 truncate"
                                    >{type.label}</span
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
