'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  MagnifyingGlassIcon, UserGroupIcon, EnvelopeIcon, PhoneIcon,
  ArrowDownTrayIcon, ChatBubbleLeftRightIcon, PrinterIcon,
} from '@/lib/icons';

interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
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

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (isStaff) loadContacts();
  }, [isStaff]);

  useEffect(() => {
    applyFilters();
  }, [contacts, search, filterType, filterSchool]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      // Fetch students - only essential info
      const studentsRes = await fetch('/api/students');
      const studentsJson = await studentsRes.json();
      const students = (studentsJson.data ?? [])
        .filter((s: any) => s.full_name && (s.email || s.phone)) // Only include if has name and contact info
        .map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          email: s.email || '',
          phone: s.phone || s.parent_phone || null,
          school_name: s.school_name || null,
          role: 'student' as const,
          _type: 'student' as const,
        }));

      // Fetch portal users (parents, teachers) - only essential info
      const usersRes = await fetch('/api/portal-users?scoped=true');
      const usersJson = await usersRes.json();
      const users = (usersJson.data ?? [])
        .filter((u: any) => ['parent', 'teacher'].includes(u.role) && u.full_name && (u.email || u.phone))
        .map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email || '',
          phone: u.phone || null,
          school_name: u.school_name || null,
          role: u.role,
          _type: u.role === 'parent' ? 'parent' : 'staff',
        }));

      const allContacts = [...students, ...users];
      setContacts(allContacts);

      // Extract unique schools for filtering
      const uniqueSchools = [...new Set(allContacts.map(c => c.school_name).filter(Boolean))];
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
        c.school_name?.toLowerCase().includes(term)
      );
    }

    setFilteredContacts(filtered);
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Type', 'School'];
    const rows = filteredContacts.map(c => [
      c.full_name,
      c.email,
      c.phone || '',
      c._type,
      c.school_name || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const printDirectory = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    // Get current filter descriptions
    const filterDescription = [];
    if (filterType !== 'all') filterDescription.push(`Type: ${filterType}`);
    if (filterSchool) filterDescription.push(`School: ${filterSchool}`);
    if (search) filterDescription.push(`Search: "${search}"`);
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>School Directory - Rillcod Technologies</title>
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              margin: 0; 
              padding: 20px; 
              background: #fff;
              color: #333;
            }
            .header { 
              border-bottom: 3px solid #ea580c; 
              padding-bottom: 20px; 
              margin-bottom: 30px;
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .logo-section {
              display: flex;
              align-items: center;
              gap: 15px;
            }
            .logo {
              width: 60px;
              height: 60px;
              background: linear-gradient(135deg, #ea580c, #f97316);
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 24px;
            }
            .company-info h1 { 
              color: #ea580c; 
              margin: 0 0 5px 0; 
              font-size: 28px;
              font-weight: 900;
              letter-spacing: -0.5px;
            }
            .company-info .tagline {
              color: #666;
              margin: 0;
              font-size: 14px;
              font-weight: 500;
            }
            .print-info {
              text-align: right;
              color: #666;
              font-size: 12px;
            }
            .filters {
              background: #f8fafc;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 20px;
              border-left: 4px solid #ea580c;
            }
            .filters h3 {
              margin: 0 0 10px 0;
              color: #ea580c;
              font-size: 14px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .filter-tags {
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            .filter-tag {
              background: #ea580c;
              color: white;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 500;
            }
            .stats { 
              margin-bottom: 20px; 
              color: #666; 
              font-size: 14px;
              font-weight: 500;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 10px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th, td { 
              border: 1px solid #e2e8f0; 
              padding: 12px 8px; 
              text-align: left; 
            }
            th { 
              background: #ea580c; 
              color: white;
              font-weight: bold;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            tr:nth-child(even) { 
              background: #f8fafc; 
            }
            tr:hover {
              background: #f1f5f9;
            }
            .contact-type {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .type-student { background: #dbeafe; color: #1e40af; }
            .type-parent { background: #d1fae5; color: #065f46; }
            .type-staff { background: #e0e7ff; color: #3730a3; }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #e2e8f0;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            @media print {
              body { margin: 0; }
              .header { page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              <div class="logo">R</div>
              <div class="company-info">
                <h1>RILLCOD TECHNOLOGIES</h1>
                <p class="tagline">Educational Excellence & Innovation</p>
              </div>
            </div>
            <div class="print-info">
              <div><strong>School Directory</strong></div>
              <div>Generated: ${new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</div>
              <div>Time: ${new Date().toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</div>
            </div>
          </div>
          
          ${filterDescription.length > 0 ? `
            <div class="filters">
              <h3>Applied Filters</h3>
              <div class="filter-tags">
                ${filterDescription.map(filter => `<span class="filter-tag">${filter}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          
          <div class="stats">
            <strong>${filteredContacts.length}</strong> contacts found
            ${contacts.length !== filteredContacts.length ? ` (filtered from ${contacts.length} total)` : ''}
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Type</th>
                <th>School</th>
              </tr>
            </thead>
            <tbody>
              ${filteredContacts.map(c => `
                <tr>
                  <td><strong>${c.full_name}</strong></td>
                  <td>${c.email}</td>
                  <td>${c.phone || '—'}</td>
                  <td><span class="contact-type type-${c._type}">${c._type}</span></td>
                  <td>${c.school_name || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p><strong>Rillcod Technologies</strong> | Educational Management System</p>
            <p>This directory contains confidential information. Handle with care.</p>
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
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
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg">
            <UserGroupIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">School Directory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Essential contact information for easy export and printing</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
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

        {/* Stats & Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{filteredContacts.length}</span> of <span className="font-bold text-foreground">{contacts.length}</span> contacts
          </p>
          <div className="flex gap-2">
            <button
              onClick={printDirectory}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
            >
              <PrinterIcon className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Export CSV
            </button>
          </div>
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
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Phone</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">School</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          contact._type === 'student' ? 'bg-blue-500' :
                          contact._type === 'parent' ? 'bg-emerald-500' : 'bg-violet-500'
                        }`}>
                          {contact.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{contact.full_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {contact.email ? (
                        <div className="flex items-center gap-2">
                          <EnvelopeIcon className="w-4 h-4 text-muted-foreground" />
                          <a 
                            href={`mailto:${contact.email}`} 
                            className="text-sm text-foreground hover:text-orange-500 transition-colors"
                          >
                            {contact.email}
                          </a>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {contact.phone ? (
                        <div className="flex items-center gap-2">
                          <PhoneIcon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{contact.phone}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${
                        contact._type === 'student' ? 'bg-blue-500/20 text-blue-400' :
                        contact._type === 'parent' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-violet-500/20 text-violet-400'
                      }`}>
                        {contact._type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {contact.school_name ? (
                        <span className="text-sm text-foreground">{contact.school_name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {contact.phone && (
                          <button
                            onClick={() => sendWhatsApp(contact.phone!, contact.full_name)}
                            className="p-2 hover:bg-emerald-500/10 text-emerald-500 rounded-lg transition-colors"
                            title="Send WhatsApp"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}