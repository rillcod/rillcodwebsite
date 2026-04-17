'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  MagnifyingGlassIcon, UserGroupIcon, EnvelopeIcon, PhoneIcon,
  PencilSquareIcon, TrashIcon, PlusIcon, ArrowDownTrayIcon,
  FunnelIcon, XMarkIcon, CheckIcon, UserIcon, AcademicCapIcon,
  BuildingOfficeIcon, ChatBubbleLeftRightIcon,
} from '@/lib/icons';

interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  parent_email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_relationship: string | null;
  school_name: string | null;
  grade_level: string | null;
  section_class: string | null;
  role: 'student' | 'parent' | 'teacher' | 'school';
  _type: 'student' | 'parent' | 'staff';
}

export default function DirectoryPage() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'students' | 'parents' | 'staff'>('all');
  const [filterSchool, setFilterSchool] = useState('');
  const [schools, setSchools] = useState<string[]>([]);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  useEffect(() => {
    if (isStaff) loadContacts();
  }, [isStaff]);

  useEffect(() => {
    applyFilters();
  }, [contacts, search, filterType, filterSchool]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      // Fetch students with parent info
      const studentsRes = await fetch('/api/students');
      const studentsJson = await studentsRes.json();
      const students = (studentsJson.data ?? []).map((s: any) => ({
        ...s,
        _type: 'student' as const,
        role: 'student' as const,
      }));

      // Fetch portal users (parents, teachers, school staff)
      const usersRes = await fetch('/api/portal-users?scoped=true');
      const usersJson = await usersRes.json();
      const users = (usersJson.data ?? [])
        .filter((u: any) => ['parent', 'teacher', 'school'].includes(u.role))
        .map((u: any) => ({
          ...u,
          _type: u.role === 'parent' ? 'parent' : 'staff',
        }));

      const allContacts = [...students, ...users];
      setContacts(allContacts);

      // Extract unique schools
      const uniqueSchools = [...new Set(allContacts.map((c: any) => c.school_name).filter(Boolean))];
      setSchools(uniqueSchools as string[]);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = contacts;

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(c => c._type === filterType);
    }

    // School filter
    if (filterSchool) {
      filtered = filtered.filter(c => c.school_name === filterSchool);
    }

    // Search filter
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.full_name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.parent_name?.toLowerCase().includes(term) ||
        c.parent_email?.toLowerCase().includes(term) ||
        c.parent_phone?.toLowerCase().includes(term) ||
        c.school_name?.toLowerCase().includes(term) ||
        c.grade_level?.toLowerCase().includes(term)
      );
    }

    setFilteredContacts(filtered);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact({ ...contact });
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!editingContact) return;
    setSaving(true);
    try {
      if (editingContact._type === 'student') {
        // Update student parent info
        const res = await fetch(`/api/students/${editingContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_email: editingContact.parent_email || null,
            parent_name: editingContact.parent_name || null,
            parent_phone: editingContact.parent_phone || null,
            parent_relationship: editingContact.parent_relationship || null,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        // Update portal user
        const res = await fetch(`/api/portal-users/${editingContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: editingContact.full_name,
            email: editingContact.email,
            phone: editingContact.phone || null,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      await loadContacts();
      setShowEditModal(false);
      setEditingContact(null);
    } catch (err: any) {
      alert(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Type', 'School', 'Grade/Class', 'Parent Name', 'Parent Email', 'Parent Phone', 'Relationship'];
    const rows = filteredContacts.map(c => [
      c.full_name,
      c.email,
      c.phone || '',
      c._type,
      c.school_name || '',
      c.grade_level || c.section_class || '',
      c.parent_name || '',
      c.parent_email || '',
      c.parent_phone || '',
      c.parent_relationship || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const sendWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${name}, this is Rillcod Technologies. `);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  if (!isStaff) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Access denied. Staff only.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg">
            <UserGroupIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">School Directory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage contacts for students, parents, and staff</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Types</option>
              <option value="students">Students</option>
              <option value="parents">Parents</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          {/* School Filter */}
          <div>
            <select
              value={filterSchool}
              onChange={e => setFilterSchool(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Schools</option>
              {schools.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats & Export */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{filteredContacts.length}</span> of <span className="font-bold text-foreground">{contacts.length}</span> contacts
          </p>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="text-center py-20 bg-card border border-border rounded-xl">
          <UserGroupIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No contacts found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">School/Grade</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Info</th>
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          contact._type === 'student' ? 'bg-blue-500' :
                          contact._type === 'parent' ? 'bg-emerald-500' : 'bg-violet-500'
                        }`}>
                          {contact.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{contact.full_name}</p>
                          {contact.section_class && (
                            <p className="text-xs text-muted-foreground">{contact.section_class}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        contact._type === 'student' ? 'bg-blue-500/20 text-blue-400' :
                        contact._type === 'parent' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-violet-500/20 text-violet-400'
                      }`}>
                        {contact._type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <EnvelopeIcon className="w-3 h-3" />
                            <a href={`mailto:${contact.email}`} className="hover:text-orange-500 transition-colors">
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <PhoneIcon className="w-3 h-3" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {contact.school_name && (
                          <p className="text-xs text-foreground font-medium">{contact.school_name}</p>
                        )}
                        {contact.grade_level && (
                          <p className="text-xs text-muted-foreground">{contact.grade_level}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {contact._type === 'student' && (contact.parent_name || contact.parent_email || contact.parent_phone) ? (
                        <div className="space-y-1">
                          {contact.parent_name && (
                            <p className="text-xs text-foreground font-medium">{contact.parent_name}</p>
                          )}
                          {contact.parent_email && (
                            <p className="text-xs text-muted-foreground">{contact.parent_email}</p>
                          )}
                          {contact.parent_phone && (
                            <p className="text-xs text-muted-foreground">{contact.parent_phone}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {(contact.phone || contact.parent_phone) && (
                          <button
                            onClick={() => sendWhatsApp(contact.phone || contact.parent_phone!, contact.full_name)}
                            className="p-2 hover:bg-emerald-500/10 text-emerald-500 rounded-lg transition-colors"
                            title="Send WhatsApp"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(contact)}
                          className="p-2 hover:bg-orange-500/10 text-orange-500 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-border shadow-2xl rounded-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Edit Contact</h2>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {editingContact._type === 'student' ? (
                <>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Student Name</label>
                    <input
                      type="text"
                      value={editingContact.full_name}
                      disabled
                      className="w-full px-4 py-2.5 bg-muted border border-border text-sm text-muted-foreground rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Parent Name</label>
                    <input
                      type="text"
                      value={editingContact.parent_name || ''}
                      onChange={e => setEditingContact({ ...editingContact, parent_name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Parent Email</label>
                    <input
                      type="email"
                      value={editingContact.parent_email || ''}
                      onChange={e => setEditingContact({ ...editingContact, parent_email: e.target.value })}
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Parent Phone</label>
                    <input
                      type="tel"
                      value={editingContact.parent_phone || ''}
                      onChange={e => setEditingContact({ ...editingContact, parent_phone: e.target.value })}
                      placeholder="+234..."
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Relationship</label>
                    <select
                      value={editingContact.parent_relationship || 'Guardian'}
                      onChange={e => setEditingContact({ ...editingContact, parent_relationship: e.target.value })}
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={editingContact.full_name}
                      onChange={e => setEditingContact({ ...editingContact, full_name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Email</label>
                    <input
                      type="email"
                      value={editingContact.email}
                      onChange={e => setEditingContact({ ...editingContact, email: e.target.value })}
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={editingContact.phone || ''}
                      onChange={e => setEditingContact({ ...editingContact, phone: e.target.value })}
                      placeholder="+234..."
                      className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
