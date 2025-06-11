'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export default function SupabaseTableChecker() {
  const [tableExists, setTableExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkTable = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to query the schools table
      const { data, error } = await supabase
        .from('schools')
        .select('id')
        .limit(1);

      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist
          setTableExists(false);
          setError('Schools table does not exist. Please create it in Supabase dashboard.');
        } else {
          setTableExists(false);
          setError(`Database error: ${error.message}`);
        }
      } else {
        setTableExists(true);
      }
    } catch (err) {
      setTableExists(false);
      setError(`Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const createTable = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Create the schools table
      const { error } = await supabase.rpc('exec_sql', {
        sql: `
          create table if not exists schools (
            id uuid primary key default uuid_generate_v4(),
            name text not null,
            address text,
            city text,
            state text,
            postal_code text,
            contact_person text,
            phone text,
            email text,
            website text,
            student_count integer,
            grade_levels text,
            computer_labs integer,
            internet_access text,
            preferred_schedule text,
            program_interest text[],
            additional_info text,
            created_at timestamp with time zone default now()
          );
        `
      });

      if (error) {
        setError(`Failed to create table: ${error.message}`);
      } else {
        await checkTable();
      }
    } catch (err) {
      setError(`Error creating table: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTable();
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center">
          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mr-2" />
          <span className="text-blue-800">Checking database table...</span>
        </div>
      </div>
    );
  }

  if (tableExists === false) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-600 mr-2" />
            <div>
              <p className="text-red-800 font-medium">Database Table Missing</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
          <button
            onClick={createTable}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Try to Create Table
          </button>
        </div>
        <div className="mt-3 p-3 bg-red-100 rounded text-sm">
          <p className="font-medium text-red-800">Manual Fix:</p>
          <p className="text-red-700 mt-1">
            1. Go to your Supabase Dashboard → SQL Editor<br/>
            2. Run this SQL:<br/>
            <code className="bg-red-200 px-2 py-1 rounded mt-1 block">
              create table if not exists schools (id uuid primary key default uuid_generate_v4(), name text not null, address text, city text, state text, postal_code text, contact_person text, phone text, email text, website text, student_count integer, grade_levels text, computer_labs integer, internet_access text, preferred_schedule text, program_interest text[], additional_info text, created_at timestamp with time zone default now());
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="flex items-center">
        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
        <span className="text-green-800 font-medium">Database table ready! You can submit school registrations.</span>
      </div>
    </div>
  );
} 