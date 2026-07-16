import type { ComponentType } from 'react'

interface SlotEntry {
  component: ComponentType
  order?: number
  key?: string
}

export class SlotRegistry {
  private slots = new Map<string, SlotEntry[]>()

  add(slotName: string, options: SlotEntry): void {
    const existing = this.slots.get(slotName) ?? []

    if (options.key !== undefined) {
      const filtered = existing.filter((e) => e.key !== options.key)
      this.slots.set(slotName, [...filtered, options])
    } else {
      this.slots.set(slotName, [...existing, options])
    }
  }

  get(slotName: string): SlotEntry[] {
    const entries = this.slots.get(slotName)
    if (!entries || entries.length === 0) return []
    return [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
}
