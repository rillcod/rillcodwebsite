'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, MapPin, Phone, Mail, Globe, Users, Monitor, Calendar, Eye, Trash2, RefreshCw } from 'lucide-react';

interface School {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  student_count: number | null;
  grade_levels: string;
  computer_labs: number | null;
  internet_access: string;
  preferred_schedule: string;
  program_interest: string[];
  additional_info: string;
  created_at: string;
}

export default function SchoolRegistrationsViewer() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setSchools(data || []);
    } catch (err) {
      console.error('Error fetching schools:', err);
      setError('Failed to load school registrations');
    } finally {
      setLoading(false);
    }
  };

  const deleteSchool = async (id: string) => {
    if (!confirm('Are you sure you want to delete this school registration?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      alert('School registration deleted successfully');
      fetchSchools();
    } catch (err) {
      console.error('Error deleting school:', err);
      alert('Failed to delete school registration');
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading school registrations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchSchools}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">School Registrations</h2>
          <p className="text-gray-600">View all submitted school registration forms</p>
        </div>
        <button
          onClick={fetchSchools}
          className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{schools.length}</div>
          <div className="text-sm text-blue-600">Total Registrations</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {schools.filter(s => s.internet_access === 'yes').length}
          </div>
          <div className="text-sm text-green-600">With Internet Access</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">
            {schools.filter(s => s.computer_labs && s.computer_labs > 0).length}
          </div>
          <div className="text-sm text-purple-600">With Computer Labs</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">
            {schools.reduce((sum, s) => sum + (s.student_count || 0), 0)}
          </div>
          <div className="text-sm text-orange-600">Total Students</div>
        </div>
      </div>

      {/* Schools List */}
      <div className="bg-white rounded-lg shadow">
        {schools.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No school registrations found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    School
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Students
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Programs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schools.map((school) => (
                  <tr key={school.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{school.name}</div>
                          <div className="text-sm text-gray-500">{school.contact_person}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{school.email}</div>
                      <div className="text-sm text-gray-500">{school.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{school.city}, {school.state}</div>
                      <div className="text-sm text-gray-500">{school.address}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {school.student_count || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {school.program_interest?.slice(0, 2).map((program, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {program}
                          </span>
                        ))}
                        {school.program_interest?.length > 2 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            +{school.program_interest.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(school.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setSelectedSchool(school)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteSchool(school.id)}
                          className="text-red-600 hover:text-red-900"
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
        )}
      </div>

      {/* School Details Modal */}
      {selectedSchool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">School Details</h3>
                <button
                  onClick={() => setSelectedSchool(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900">{selectedSchool.name}</h4>
                  <p className="text-sm text-gray-600">{selectedSchool.contact_person}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <p className="text-sm text-gray-900">{selectedSchool.address}</p>
                    <p className="text-sm text-gray-900">{selectedSchool.city}, {selectedSchool.state} {selectedSchool.postal_code}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Contact</label>
                    <p className="text-sm text-gray-900">{selectedSchool.email}</p>
                    <p className="text-sm text-gray-900">{selectedSchool.phone}</p>
                    {selectedSchool.website && (
                      <p className="text-sm text-blue-600">{selectedSchool.website}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">School Info</label>
                    <p className="text-sm text-gray-900">Students: {selectedSchool.student_count || 'N/A'}</p>
                    <p className="text-sm text-gray-900">Grade Levels: {selectedSchool.grade_levels || 'N/A'}</p>
                    <p className="text-sm text-gray-900">Computer Labs: {selectedSchool.computer_labs || 'N/A'}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Preferences</label>
                    <p className="text-sm text-gray-900">Internet: {selectedSchool.internet_access || 'N/A'}</p>
                    <p className="text-sm text-gray-900">Schedule: {selectedSchool.preferred_schedule || 'N/A'}</p>
                  </div>
                </div>

                {selectedSchool.program_interest && selectedSchool.program_interest.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Programs of Interest</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedSchool.program_interest.map((program, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                        >
                          {program}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSchool.additional_info && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Additional Information</label>
                    <p className="text-sm text-gray-900 mt-1">{selectedSchool.additional_info}</p>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  Registered on: {new Date(selectedSchool.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 