import { writable, type Writable } from "svelte/store";

export interface HeaderActionState {
  show: boolean;
  selectedMonth: Date;
  syncing: boolean;
  saving: boolean;
  exporting: boolean;
  showFormatting: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExport: () => void;
  onSync: () => void;
  onSave: () => void;
  onShare: () => void;
  onFilter: () => void;
  onFormatting: () => void;
}

export const createHeaderStore = () => {
  return writable<HeaderActionState>({
    show: false,
    selectedMonth: new Date(),
    syncing: false,
    saving: false,
    exporting: false,
    showFormatting: false,
    onPrev: () => {},
    onNext: () => {},
    onExport: () => {},
    onSync: () => {},
    onSave: () => {},
    onShare: () => {},
    onFilter: () => {},
    onFormatting: () => {},
  });
};

export const HEADER_CONTEXT_KEY = Symbol('header-context');
