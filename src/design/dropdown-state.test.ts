import { describe, expect, it } from 'vitest'
import { shouldNotifyDropdownOpenChange } from '@/design/dropdown-state'

describe('shouldNotifyDropdownOpenChange', () => {
  it('suppresses duplicate close notifications', () => {
    expect(shouldNotifyDropdownOpenChange(false, false)).toBe(false)
  })

  it('suppresses duplicate open notifications', () => {
    expect(shouldNotifyDropdownOpenChange(true, true)).toBe(false)
  })

  it('notifies when the dropdown state actually changes', () => {
    expect(shouldNotifyDropdownOpenChange(false, true)).toBe(true)
    expect(shouldNotifyDropdownOpenChange(true, false)).toBe(true)
  })
})
