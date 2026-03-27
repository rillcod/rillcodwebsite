// @refresh reset
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  AcademicCapIcon,
  PhoneIcon,
  EnvelopeIcon,
  BuildingOfficeIcon
} from '@/lib/icons'

interface ProspectiveStudent {
  id: string
  email: string
  full_name: string
  age: number
  grade: string
  school_id: string
  school_name: string
  gender: string
  parent_name: string
  parent_phone: string
  parent_email: string
  course_interest: string
  preferred_schedule: string
  hear_about_us: string
  is_active: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
}

// Row returned by Supabase when prospective_students is joined with schools(name)
type ProspectiveStudentRow = Omit<ProspectiveStudent, 'school_name'> & {
  schools: { name: string } | null
}

export default function StudentApproval() {
  const supabase = createClient()
  const [prospectiveStudents, setProspectiveStudents] = useState<ProspectiveStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)

  useEffect(() => {
    fetchProspectiveStudents()
  }, [])

  const fetchProspectiveStudents = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('prospective_students')
        .select(`
          *,
          schools (
            name
          )
        `)
        .neq('is_deleted', true)
        .order('created_at', { ascending: false })

      if (error) {
        setError(`Error fetching students: ${error.message}`)
        return
      }

      // Transform the data to include school_name from the joined schools row
      const transformedData = (data as unknown as ProspectiveStudentRow[])?.map(student => ({
        ...student,
        school_name: student.schools?.name || 'Unknown School',
      })) || []

      setProspectiveStudents(transformedData)
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const approveStudent = async (studentId: string) => {
    try {
      setApproving(studentId)
      setError(null)

      // First, create a user profile for the student
      const student = prospectiveStudents.find(s => s.id === studentId)
      if (!student) return

      // Create portal user
      const { data: newUser, error: createError } = await supabase
        .from('portal_users')
        .insert({
          email: student.email,
          full_name: student.full_name,
          role: 'student',
          is_active: true,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            student_id: student.id,
            school_id: student.school_id,
            grade: student.grade,
            age: student.age,
            gender: student.gender,
            parent_name: student.parent_name,
            parent_phone: student.parent_phone,
            parent_email: student.parent_email,
            course_interest: student.course_interest,
            preferred_schedule: student.preferred_schedule
          }
        })
        .select()
        .single()

      if (createError) {
        setError(`Error creating portal user: ${createError.message}`)
        return
      }

      // Update prospective student status
      const { error: updateError } = await supabase
        .from('prospective_students')
        .update({
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId)

      if (updateError) {
        setError(`Error updating student status: ${updateError.message}`)
        return
      }

      // Refresh the list
      await fetchProspectiveStudents()
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setApproving(null)
    }
  }

  const rejectStudent = async (studentId: string) => {
    try {
      setApproving(studentId)
      setError(null)

      const { error } = await supabase
        .from('prospective_students')
        .update({
          is_active: false,
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', studentId)

      if (error) {
        setError(`Error rejecting student: ${error.message}`)
        return
      }

      await fetchProspectiveStudents()
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setApproving(null)
    }
  }

  const getStatusBadge = (isActive: boolean, isDeleted: boolean) => {
    if (isDeleted) {
      return (
        <span className="inline-flex items-center px-4 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-[#ffc9c9] text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
          <XCircleIcon className="w-4 h-4 mr-2" />
          Rejected
        </span>
      )
    }

    if (isActive) {
      return (
        <span className="inline-flex items-center px-4 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-[#b6e3f4] text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
          <CheckCircleIcon className="w-4 h-4 mr-2" />
          Approved
        </span>
      )
    }

    return (
      <span className="inline-flex items-center px-4 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-[#fffde7] text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
        <ClockIcon className="w-4 h-4 mr-2" />
        Pending
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-16 h-16 bg-[#fff9c4] border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] animate-spin flex items-center justify-center">
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-4 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#f8f9fa] p-6 border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
        <div>
          <h2 className="text-3xl font-black text-black uppercase tracking-tight">
            Student Approval System
          </h2>
          <p className="text-black font-medium mt-1">Review and approve student registrations</p>
        </div>
        <button
          onClick={fetchProspectiveStudents}
          className="flex items-center px-6 py-3 bg-[#e8f5e9] text-black font-bold border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all uppercase tracking-wider"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-[#ffc9c9] border-4 border-black p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <p className="text-black font-bold">{error}</p>
        </div>
      )}

      <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
        <div className="px-6 py-4 border-b-4 border-black bg-[#b3e5fc]">
          <h3 className="text-xl font-black text-black uppercase tracking-wider">
            Prospective Students ({prospectiveStudents.length})
          </h3>
        </div>

        {prospectiveStudents.length === 0 ? (
          <div className="p-12 text-center bg-[#fffde7]">
            <UserIcon className="mx-auto h-16 w-16 text-black" />
            <h3 className="mt-4 text-xl font-black text-black uppercase tracking-wider">No prospective students</h3>
            <p className="mt-2 font-bold text-black border-2 border-black inline-block p-3 bg-white shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              Students who register will appear here for approval.
            </p>
          </div>
        ) : (
          <div className="divide-y-4 divide-black">
            {prospectiveStudents.map((student) => (
              <div key={student.id} className="p-6 hover:bg-[#e1f5fe] transition-colors bg-white">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-5">
                      <h4 className="text-2xl font-black text-black">
                        {student.full_name}
                      </h4>
                      {getStatusBadge(student.is_active, student.is_deleted)}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm font-bold text-black">
                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <AcademicCapIcon className="w-5 h-5 mr-3" />
                        <span>{student.grade} • {student.age} years old</span>
                      </div>

                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <BuildingOfficeIcon className="w-5 h-5 mr-3" />
                        <span>{student.school_name}</span>
                      </div>

                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <UserIcon className="w-5 h-5 mr-3" />
                        <span>{student.gender}</span>
                      </div>

                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <UserIcon className="w-5 h-5 mr-3" />
                        <span>Parent: {student.parent_name}</span>
                      </div>

                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <PhoneIcon className="w-5 h-5 mr-3" />
                        <span>{student.parent_phone}</span>
                      </div>

                      <div className="flex items-center p-3 border-2 border-black bg-[#fffde7] shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <EnvelopeIcon className="w-5 h-5 mr-3" />
                        <span>{student.parent_email}</span>
                      </div>
                    </div>

                    <div className="mt-6 text-sm text-black font-medium border-l-[6px] border-black pl-4 py-3 bg-[#f8f9fa] shadow-[4px_4px_0_0_rgba(0,0,0,1)] border-r-2 border-t-2 border-b-2">
                      <p className="mb-1"><strong className="font-black">Course Interest:</strong> {student.course_interest}</p>
                      <p className="mb-1"><strong className="font-black">Preferred Schedule:</strong> {student.preferred_schedule}</p>
                      <p><strong className="font-black">How they heard about us:</strong> {student.hear_about_us}</p>
                    </div>
                  </div>

                  {!student.is_active && !student.is_deleted && (
                    <div className="flex flex-col space-y-4 ml-6">
                      <button
                        onClick={() => approveStudent(student.id)}
                        disabled={approving === student.id}
                        className="px-6 py-3 bg-[#c8e6c9] text-black font-black border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all uppercase tracking-wider disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)]"
                      >
                        {approving === student.id ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => rejectStudent(student.id)}
                        disabled={approving === student.id}
                        className="px-6 py-3 bg-[#ffcdd2] text-black font-black border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all uppercase tracking-wider disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)]"
                      >
                        {approving === student.id ? '...' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 