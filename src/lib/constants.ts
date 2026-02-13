import { BookOpen, Settings, Flame, Users, Info, Gavel } from "lucide-svelte";

export const categories = [
    {
        id: "lehre",
        label: "Lehre",
        icon: BookOpen,
        color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    },
    {
        id: "organisation",
        label: "Organisation",
        icon: Settings,
        color: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    },
    {
        id: "gebet",
        label: "Gebet",
        icon: Flame,
        color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800",
    },
    {
        id: "menschen",
        label: "Menschen",
        icon: Users,
        color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    },
];

export const tags = [
    {
        id: "info",
        label: "Info",
        icon: Info,
        color: "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400",
    },
    {
        id: "entscheidung",
        label: "Entscheidung",
        icon: Gavel,
        color: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400",
    },
];
