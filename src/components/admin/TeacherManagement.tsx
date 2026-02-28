"use client";
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  User,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  GraduationCap,
  Mail,
  Phone,
  School,
  BookOpen,
  Users
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

interface Teacher {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  subjects: string[];
  experience_years: number;
  education: string;
  bio: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export default function TeacherManagement() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  // Form state for adding/editing teachers
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    subjects: [] as string[],
    experience_years: 0,
    education: '',
    bio: '',
    is_active: true
  });

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching teachers:', error);
        toast.error('Failed to fetch teachers');
        return;
      }

      setTeachers(data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error('Failed to fetch teachers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const teacherData = {
        ...formData,
        created_by: profile?.id
      };

      const { data, error } = await supabase
        .from('teachers')
        .insert([teacherData])
        .select();

      if (error) {
        console.error('Error adding teacher:', error);
        toast.error('Failed to add teacher');
        return;
      }

      toast.success('Teacher added successfully');
      setShowAddForm(false);
      resetForm();
      fetchTeachers();
    } catch (error) {
      console.error('Error adding teacher:', error);
      toast.error('Failed to add teacher');
    }
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTeacher) return;

    try {
      const updateData = {
        ...formData,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('teachers')
        .update(updateData)
        .eq('id', selectedTeacher.id);

      if (error) {
        console.error('Error updating teacher:', error);
        toast.error('Failed to update teacher');
        return;
      }

      toast.success('Teacher updated successfully');
      setShowEditForm(false);
      setSelectedTeacher(null);
      resetForm();
      fetchTeachers();
    } catch (error) {
      console.error('Error updating teacher:', error);
      toast.error('Failed to update teacher');
    }
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', teacherId);

      if (error) {
        console.error('Error deleting teacher:', error);
        toast.error('Failed to delete teacher');
        return;
      }

      toast.success('Teacher deleted successfully');
      fetchTeachers();
    } catch (error) {
      console.error('Error deleting teacher:', error);
      toast.error('Failed to delete teacher');
    }
  };

  const handleToggleStatus = async (teacher_id: string, is_active: boolean) => {
    try {
      const { error } = await supabase
        .from('portal_users')
        .update({ is_active })
        .eq('id', teacher_id);

      if (error) throw error;

      toast.success(`Teacher ${is_active ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      console.error('Error updating teacher status:', error);
      toast.error('Failed to update teacher status');
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      phone: '',
      subjects: [],
      experience_years: 0,
      education: '',
      bio: '',
      is_active: true
    });
  };

  const openEditForm = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFormData({
      email: teacher.email,
      full_name: teacher.full_name,
      phone: teacher.phone,
      subjects: teacher.subjects || [],
      experience_years: teacher.experience_years,
      education: teacher.education,
      bio: teacher.bio,
      is_active: teacher.is_active
    });
    setShowEditForm(true);
  };

  const openDetails = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowDetails(true);
  };

  const filteredTeachers = teachers.filter(teacher => {
    const matchesSearch = teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && teacher.is_active) ||
      (statusFilter === 'inactive' && !teacher.is_active);

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (is_active: boolean) => {
    return is_active ? 'bg-[#b6e3f4] text-black border-2 border-black' : 'bg-[#ffc9c9] text-black border-2 border-black';
  };

  const getStatusIcon = (is_active: boolean) => {
    return is_active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />;
  };

  const subjects = [
    'ICT Fundamentals', 'Scratch Programming', 'HTML/CSS Programming',
    'Python Programming', 'Web Design', 'Robotics Programming',
    'Computer Science', 'Mathematics', 'Physics'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-16 h-16 bg-[#fff9c4] border-4 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] animate-spin flex items-center justify-center">
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#f8f9fa] p-6 border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
        <div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">Teacher Management</h1>
          <p className="text-black font-medium mt-1">Manage teachers and their profiles</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center px-4 py-3 bg-[#e8f5e9] text-black font-bold border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Teacher
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search teachers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-black bg-[#fffde7] focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] font-medium text-black placeholder-gray-600 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 border-2 border-black bg-[#fffde7] focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] font-bold text-black appearance-none transition-all"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="flex items-center space-x-2 bg-black text-white px-4 py-2 border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
            <span className="text-sm font-bold uppercase tracking-wider">Total: {filteredTeachers.length}</span>
          </div>
        </div>
      </div>

      {/* Teachers Table */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] overflow-x-auto">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y-4 divide-black">
            <thead className="bg-[#b3e5fc]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black border-r-2">
                  Teacher
                </th>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black border-r-2">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black border-r-2">
                  Subjects
                </th>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black border-r-2">
                  Experience
                </th>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black border-r-2">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-black text-black uppercase tracking-wider border-b-4 border-black">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y-2 divide-black">
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-[#e1f5fe] transition-colors bg-white">
                  <td className="px-6 py-4 whitespace-nowrap border-r-2 border-black">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-[#c8e6c9] border-2 border-black flex items-center justify-center shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        <User className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-md font-black text-black">{teacher.full_name}</div>
                        <div className="text-sm font-bold text-gray-700">{teacher.education}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap border-r-2 border-black">
                    <div className="text-sm font-bold text-black">{teacher.email}</div>
                    <div className="text-sm font-bold text-gray-700 mt-1">{teacher.phone}</div>
                  </td>
                  <td className="px-6 py-4 border-r-2 border-black">
                    <div className="flex flex-wrap gap-1">
                      {teacher.subjects.slice(0, 2).map((subject, index) => (
                        <span key={index} className="inline-flex items-center px-3 py-1 border-2 border-black text-xs font-bold bg-[#e1bee7] text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                          {subject}
                        </span>
                      ))}
                      {teacher.subjects.length > 2 && (
                        <span className="inline-flex items-center px-3 py-1 border-2 border-black text-xs font-bold bg-white text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                          +{teacher.subjects.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap border-r-2 border-black">
                    <div className="text-sm font-black text-black">{teacher.experience_years} yrs</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap border-r-2 border-black">
                    <span className={`inline-flex items-center px-3 py-1 text-xs font-bold uppercase tracking-wider ${getStatusColor(teacher.is_active)} shadow-[2px_2px_0_0_rgba(0,0,0,1)]`}>
                      {getStatusIcon(teacher.is_active)}
                      <span className="ml-1.5">{teacher.is_active ? 'Active' : 'Inactive'}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium border-l-[0px]">
                    <div className="flex items-center space-x-2 bg-black text-white px-4 py-2 border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
                      <button
                        onClick={() => openDetails(teacher)}
                        className="p-2 border-2 border-black bg-[#e3f2fd] text-black hover:bg-blue-200 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditForm(teacher)}
                        className="p-2 border-2 border-black bg-[#fff9c4] text-black hover:bg-yellow-200 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(teacher.id, !teacher.is_active)}
                        className={`p-2 border-2 border-black text-black hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all ${teacher.is_active ? 'bg-[#ffcdd2] hover:bg-red-200' : 'bg-[#c8e6c9] hover:bg-green-200'}`}
                        title={teacher.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {teacher.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher.id)}
                        className="p-2 border-2 border-black bg-[#ffccbc] text-black hover:bg-orange-200 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_0_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black mb-6 uppercase border-b-4 border-black pb-2">Add New Teacher</h2>
            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.experience_years}
                    onChange={(e) => setFormData({ ...formData, experience_years: parseInt(e.target.value) })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Education</label>
                  <input
                    type="text"
                    required
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                    placeholder="e.g., B.Sc Computer Science, M.Ed"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Subjects</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    {subjects.map(subject => (
                      <label key={subject} className="flex items-center">
                        <input
                          type="checkbox"
                          value={subject}
                          checked={formData.subjects.includes(subject)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, subjects: [...formData.subjects, subject] });
                            } else {
                              setFormData({ ...formData, subjects: formData.subjects.filter(s => s !== subject) });
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{subject}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Bio</label>
                  <textarea
                    rows={3}
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                    placeholder="Brief description about the teacher..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border-2 border-black font-bold text-black bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#b3e5fc] text-black font-bold border-2 border-black hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all"
                >
                  Add Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {showEditForm && selectedTeacher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_0_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black mb-6 uppercase border-b-4 border-black pb-2">Edit Teacher</h2>
            <form onSubmit={handleUpdateTeacher} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.experience_years}
                    onChange={(e) => setFormData({ ...formData, experience_years: parseInt(e.target.value) })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Education</label>
                  <input
                    type="text"
                    required
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Subjects</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    {subjects.map(subject => (
                      <label key={subject} className="flex items-center">
                        <input
                          type="checkbox"
                          value={subject}
                          checked={formData.subjects.includes(subject)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, subjects: [...formData.subjects, subject] });
                            } else {
                              setFormData({ ...formData, subjects: formData.subjects.filter(s => s !== subject) });
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{subject}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-black text-black uppercase tracking-wider">Bio</label>
                  <textarea
                    rows={3}
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="mt-2 block w-full border-2 border-black bg-[#fffde7] px-4 py-3 focus:outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setSelectedTeacher(null);
                    resetForm();
                  }}
                  className="px-6 py-2 border-2 border-black font-bold text-black bg-white hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#b3e5fc] text-black font-bold border-2 border-black hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all"
                >
                  Update Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teacher Details Modal */}
      {showDetails && selectedTeacher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_0_rgba(0,0,0,1)]">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-black uppercase text-black border-b-4 border-black pb-2">Teacher Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 bg-red-100 text-black font-bold border-2 border-black hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-black uppercase text-black border-b-2 border-black pb-1 mb-3">Personal Information</h3>
                <div className="space-y-2">
                  <div><strong>Name:</strong> {selectedTeacher.full_name}</div>
                  <div><strong>Email:</strong> {selectedTeacher.email}</div>
                  <div><strong>Phone:</strong> {selectedTeacher.phone}</div>
                  <div><strong>Education:</strong> {selectedTeacher.education}</div>
                  <div><strong>Experience:</strong> {selectedTeacher.experience_years} years</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black uppercase text-black border-b-2 border-black pb-1 mb-3">Subjects & Bio</h3>
                <div className="space-y-2">
                  <div><strong>Subjects:</strong></div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTeacher.subjects.map((subject, index) => (
                      <span key={index} className="inline-flex items-center px-3 py-1 border-2 border-black text-xs font-bold bg-[#e1bee7] text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                        {subject}
                      </span>
                    ))}
                  </div>
                  {selectedTeacher.bio && (
                    <div><strong>Bio:</strong> {selectedTeacher.bio}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 