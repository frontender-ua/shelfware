export type ReaderTab = 'manuscript' | 'source' | 'edit' | 'folio'

/** The reader's active tab, shared so the `e` shortcut can switch it from the tray. */
export function useReaderTab() {
  return useState<ReaderTab>('reader-tab', () => 'manuscript')
}
