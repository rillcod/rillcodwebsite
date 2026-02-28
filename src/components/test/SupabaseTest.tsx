'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';

export default function SupabaseTest() {
  const [status, setStatus] = useState<{
    connection: boolean;
    auth: boolean;
    database: boolean;
    error?: string;
  }>({
    connection: false,
    auth: false,
    database: false
  });

  useEffect(() => {
    async function testSupabase() {
      const supabase = createClient();
      
      try {
        // Test connection
        const { data: connectionTest, error: connectionError } = await supabase.from('portal_users').select('count').limit(1);
        if (connectionError) throw connectionError;
        setStatus(prev => ({ ...prev, connection: true }));

        // Test auth
        const { data: authTest, error: authError } = await supabase.auth.getSession();
        if (!authError) {
          setStatus(prev => ({ ...prev, auth: true }));
        }

        // Test database types
        const { data: dbTest, error: dbError } = await supabase
          .from('students')
          .select('full_name, parent_email, school_name')
          .limit(1);
        if (!dbError) {
          setStatus(prev => ({ ...prev, database: true }));
        }

      } catch (error) {
        setStatus(prev => ({ 
          ...prev, 
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }));
      }
    }

    testSupabase();
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Supabase Configuration Test</h2>
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${status.connection ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Connection: {status.connection ? 'OK' : 'Failed'}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${status.auth ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Auth: {status.auth ? 'OK' : 'Failed'}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${status.database ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Database Types: {status.database ? 'OK' : 'Failed'}</span>
        </div>

        {status.error && (
          <div className="text-red-500 mt-4">
            <p className="font-semibold">Error:</p>
            <p className="text-sm">{status.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
