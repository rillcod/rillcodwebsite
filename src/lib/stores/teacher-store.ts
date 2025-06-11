import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

interface TeacherMetrics {
  activeStudents: number
  assignmentsDue: number
  devicesOnline: number
  lastUpdated: Date
}

interface TeacherStore {
  metrics: TeacherMetrics | null
  isLoading: boolean
  fetchMetrics: () => Promise<void>
  subscribeToUpdates: () => void
}

export const useTeacherStore = create<TeacherStore>()(
  persist(
    (set, get) => ({
      metrics: null,
      isLoading: false,

      fetchMetrics: async () => {
        set({ isLoading: true })
        try {
          // Fetch from Supabase
          const { data: students } = await supabase
            .from('students')
            .select('*')

          const { data: devices } = await supabase
            .from('iot_devices')
            .select('*')
            .eq('status', 'active')

          set({
            metrics: {
              activeStudents: students?.length || 0,
              assignmentsDue: 0, // Calculate from assignments
              devicesOnline: devices?.length || 0,
              lastUpdated: new Date()
            },
            isLoading: false
          })
        } catch (error) {
          console.error('Failed to fetch metrics:', error)
          set({ isLoading: false })
        }
      },

      subscribeToUpdates: () => {
        const channel = supabase
          .channel('teacher-metrics')
          .on('postgres_changes',
            { event: '*', schema: 'public' },
            () => {
              get().fetchMetrics()
            }
          )
          .subscribe()
      }
    }),
    {
      name: 'teacher-store',
      partialize: (state) => ({ metrics: state.metrics })
    }
  )
) 