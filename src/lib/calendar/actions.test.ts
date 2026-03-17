import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cancelCalendarBookingRecordMock,
  createCalendarBookingRecordMock,
  createClientMock,
  deleteCalendarConnectionSecretsMock,
  disconnectGoogleCalendarConnectionMock,
  getCalendarConnectionByOrganizationIdMock,
  getCalendarPageDataByOrganizationIdMock,
  lookupBookingAvailabilityMock,
  resolveActiveOrganizationContextMock,
  updateCalendarBookingRecordMock,
} = vi.hoisted(() => ({
  cancelCalendarBookingRecordMock: vi.fn(),
  createCalendarBookingRecordMock: vi.fn(),
  createClientMock: vi.fn(),
  deleteCalendarConnectionSecretsMock: vi.fn(),
  disconnectGoogleCalendarConnectionMock: vi.fn(),
  getCalendarConnectionByOrganizationIdMock: vi.fn(),
  getCalendarPageDataByOrganizationIdMock: vi.fn(),
  lookupBookingAvailabilityMock: vi.fn(),
  resolveActiveOrganizationContextMock: vi.fn(),
  updateCalendarBookingRecordMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/organizations/active-context', () => ({
  resolveActiveOrganizationContext: resolveActiveOrganizationContextMock,
}))

vi.mock('@/lib/calendar/bookings', () => ({
  cancelCalendarBookingRecord: cancelCalendarBookingRecordMock,
  createCalendarBookingRecord: createCalendarBookingRecordMock,
  deleteCalendarConnectionSecrets: deleteCalendarConnectionSecretsMock,
  disconnectGoogleCalendarConnection: disconnectGoogleCalendarConnectionMock,
  getCalendarConnectionByOrganizationId: getCalendarConnectionByOrganizationIdMock,
  getCalendarPageDataByOrganizationId: getCalendarPageDataByOrganizationIdMock,
  lookupBookingAvailability: lookupBookingAvailabilityMock,
  updateCalendarBookingRecord: updateCalendarBookingRecordMock,
}))

import { disconnectGoogleCalendarAction, replaceAvailabilityRulesAction } from '@/lib/calendar/actions'

describe('calendar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    resolveActiveOrganizationContextMock.mockResolvedValue({
      activeOrganizationId: 'org-1',
    })
  })

  it('replaces availability rules through an RPC so delete and insert stay atomic', async () => {
    const rpcMock = vi.fn(async () => ({
      data: [
        {
          id: 'rule-1',
          organization_id: 'org-1',
          day_of_week: 1,
          start_minute: 540,
          end_minute: 1080,
          label: 'Pazartesi',
          active: true,
          created_at: '2026-03-17T10:00:00.000Z',
          updated_at: '2026-03-17T10:00:00.000Z',
        },
      ],
      error: null,
    }))
    const fromMock = vi.fn(() => {
      throw new Error('from should not be called for atomic availability replacement')
    })

    createClientMock.mockResolvedValue({
      rpc: rpcMock,
      from: fromMock,
    })

    await replaceAvailabilityRulesAction([
      {
        day_of_week: 1,
        start_minute: 540,
        end_minute: 1080,
        label: 'Pazartesi',
        active: true,
      },
    ])

    expect(rpcMock).toHaveBeenCalledWith('replace_booking_availability_rules', {
      p_organization_id: 'org-1',
      p_rules: [
        {
          day_of_week: 1,
          start_minute: 540,
          end_minute: 1080,
          label: 'Pazartesi',
          active: true,
        },
      ],
    })
  })

  it('routes Google disconnect through the cleanup helper before dropping the connection', async () => {
    const connection = {
      id: 'connection-1',
      organization_id: 'org-1',
      provider: 'google',
      status: 'active',
      sync_mode: 'write_through',
      external_account_id: 'acct-1',
      external_account_email: 'calendar@example.com',
      primary_calendar_id: 'primary',
      scopes: ['calendar'],
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
      connected_by: 'user-1',
      connected_at: '2026-03-17T09:00:00.000Z',
      disconnected_at: null,
      created_at: '2026-03-17T09:00:00.000Z',
      updated_at: '2026-03-17T09:00:00.000Z',
    }

    createClientMock.mockResolvedValue({
      from: vi.fn(),
    })
    getCalendarConnectionByOrganizationIdMock.mockResolvedValue(connection)
    disconnectGoogleCalendarConnectionMock.mockResolvedValue({
      ...connection,
      status: 'disconnected',
    })

    await disconnectGoogleCalendarAction()

    expect(disconnectGoogleCalendarConnectionMock).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      connection
    )
    expect(deleteCalendarConnectionSecretsMock).not.toHaveBeenCalled()
  })
})
