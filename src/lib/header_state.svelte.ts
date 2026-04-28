export const headerState = $state({
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
