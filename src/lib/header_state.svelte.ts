import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";

// Using a simple reactive object for maximum compatibility in Svelte 5 shared state
export const headerState = $state({
  show: false,
  selectedMonth: new Date(),
  syncing: false,
  saving: false,
  exporting: false,
  showFormatting: false,
  
  // Actions
  onPrev: () => {},
  onNext: () => {},
  onExport: () => {},
  onSync: () => {},
  onSave: () => {},
  onShare: () => {},
  onFilter: () => {},
  onFormatting: () => {},
});
