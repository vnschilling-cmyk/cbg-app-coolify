class HeaderState {
  show = $state(false);
  selectedMonth = $state(new Date());
  syncing = $state(false);
  saving = $state(false);
  exporting = $state(false);
  showFormatting = $state(false);

  onPrev = $state(() => {});
  onNext = $state(() => {});
  onExport = $state(() => {});
  onSync = $state(() => {});
  onSave = $state(() => {});
  onShare = $state(() => {});
  onFilter = $state(() => {});
  onFormatting = $state(() => {});
}

export const headerState = new HeaderState();
