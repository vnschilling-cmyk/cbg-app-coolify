import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";

export class HeaderState {
  show = $state(false);
  selectedMonth = $state(new Date());
  syncing = $state(false);
  saving = $state(false);
  exporting = $state(false);
  showFormatting = $state(false);

  onPrev = () => {};
  onNext = () => {};
  onExport = () => {};
  onSync = () => {};
  onSave = () => {};
  onShare = () => {};
  onFilter = () => {};
  onFormatting = () => {};

  update(data: Partial<HeaderState>) {
    Object.assign(this, data);
  }
}

export const headerState = new HeaderState();
