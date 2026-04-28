import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";

export interface HeaderActionState {
  show: boolean;
  selectedMonth: Date;
  onPrev: () => void;
  onNext: () => void;
  onExport: () => void;
  onSync: () => void;
  onSave: () => void;
  onShare: () => void;
  onFilter: () => void;
  onFormatting: () => void;
  syncing: boolean;
  saving: boolean;
  exporting: boolean;
  showFormatting: boolean;
}

export const headerState = $state<HeaderActionState>({
  show: false,
  selectedMonth: new Date(),
  onPrev: () => {},
  onNext: () => {},
  onExport: () => {},
  onSync: () => {},
  onSave: () => {},
  onShare: () => {},
  onFilter: () => {},
  onFormatting: () => {},
  syncing: false,
  saving: false,
  exporting: false,
  showFormatting: false,
});
