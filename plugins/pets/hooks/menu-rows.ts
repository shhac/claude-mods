// The pet's menu as plain rows, shared by the hooks that build it and the
// surface module that draws it.

// An action, or a choice of a few laid side by side.
export type MenuRow =
  | { kind: 'action'; id: string; label: string; isDisabled: boolean }
  | {
      kind: 'choices'
      label: string
      choices: readonly { id: string; label: string; isCurrent: boolean; isDisabled: boolean }[]
    }

// Where each choice sits inside the border: a space, the row's label, a
// space, then each choice's label and a space after it.
export const choiceSpans = (row: Extract<MenuRow, { kind: 'choices' }>) =>
  row.choices.reduce<{ id: string; from: number; to: number }[]>((spans, choice) => {
    const from = spans.at(-1)?.to ?? row.label.length + 2
    return [...spans, { id: choice.id, from, to: from + choice.label.length + 1 }]
  }, [])

const widthOf = (row: MenuRow) => (row.kind === 'action' ? row.label.length + 2 : (choiceSpans(row).at(-1)?.to ?? 0))

// The menu's size on screen, its border included.
export const menuSize = (rows: readonly MenuRow[]) => ({
  columns: Math.max(0, ...rows.map(widthOf)) + 2,
  rows: rows.length + 2,
})
