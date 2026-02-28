'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type TestStatus = 'pending' | 'success' | 'error';

interface TestResult {
  status: TestStatus;
  message: string;
  details?: string;
}

export default function SupabaseTestComponent() {
  const [envVarsTest, setEnvVarsTest] = useState<TestResult>({
    status: 'pending',
    message: 'Checking environment variables...',
  });
  
  const [connectionTest, setConnectionTest] = useState<TestResult>({
    status: 'pending',
    message: 'Testing Supabase connection...',
  });
  
  const [authTest, setAuthTest] = useState<TestResult>({
    status: 'pending',
    message: 'Testing Supabase auth...',
  });
  
  const [databaseTest, setDatabaseTest] = useState<TestResult>({
    status: 'pending',
    message: 'Testing database access...',
  });

  const [importPathTest, setImportPathTest] = useState<TestResult>({
    status: 'pending',
    message: 'Checking import paths...',
  });

  useEffect(() => {
    async function runTests() {
      // Test 1: Check environment variables
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          setEnvVarsTest({
            status: 'error',
            message: 'Environment variables missing',
            details: `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'Set' : 'Missing'}, NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseKey ? 'Set' : 'Missing'}`,
          });
        } else {
          setEnvVarsTest({
            status: 'success',
            message: 'Environment variables are set correctly',
          });
        }
      } catch (error) {
        setEnvVarsTest({
          status: 'error',
          message: 'Error checking environment variables',
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test 2: Check import paths
      try {
        // This test is more of a build-time check, but we can verify the client is created
        const supabase = createClient();
        if (supabase) {
          setImportPathTest({
            status: 'success',
            message: 'Supabase client imported successfully',
          });
        } else {
          setImportPathTest({
            status: 'error',
            message: 'Failed to import Supabase client',
          });
        }
      } catch (error) {
        setImportPathTest({
          status: 'error',
          message: 'Error importing Supabase client',
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test 3: Test Supabase connection
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from('portal_users').select('count').limit(1);
        
        if (error) {
          setConnectionTest({
            status: 'error',
            message: 'Failed to connect to Supabase',
            details: error.message,
          });
        } else {
          setConnectionTest({
            status: 'success',
            message: 'Successfully connected to Supabase',
            details: `Received data: ${JSON.stringify(data)}`,
          });
        }
      } catch (error) {
        setConnectionTest({
          status: 'error',
          message: 'Error connecting to Supabase',
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test 4: Test Supabase auth
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          setAuthTest({
            status: 'error',
            message: 'Failed to initialize Supabase auth',
            details: error.message,
          });
        } else {
          setAuthTest({
            status: 'success',
            message: 'Supabase auth initialized successfully',
            details: `Session: ${data.session ? 'Active' : 'None'}`,
          });
        }
      } catch (error) {
        setAuthTest({
          status: 'error',
          message: 'Error initializing Supabase auth',
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test 5: Test database access
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('students')
          .select('full_name, parent_email')
          .limit(1);
        
        if (error) {
          setDatabaseTest({
            status: 'error',
            message: 'Failed to query database',
            details: error.message,
          });
        } else {
          setDatabaseTest({
            status: 'success',
            message: 'Successfully queried database',
            details: `Retrieved ${data.length} records`,
          });
        }
      } catch (error) {
        setDatabaseTest({
          status: 'error',
          message: 'Error querying database',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    runTests();
  }, []);

  const renderTestResult = (result: TestResult) => {
    const statusIcons = {
      pending: '⏳',
      success: '✅',
      error: '❌',
    };

    const statusColors = {
      pending: 'bg-yellow-100 border-yellow-300 text-yellow-800',
      success: 'bg-green-100 border-green-300 text-green-800',
      error: 'bg-red-100 border-red-300 text-red-800',
    };

    return (
      <div className={`p-4 mb-4 rounded-lg border ${statusColors[result.status]}`}>
        <div className="flex items-start">
          <span className="text-xl mr-2">{statusIcons[result.status]}</span>
          <div>
            <h3 className="font-medium">{result.message}</h3>
            {result.details && (
              <pre className="mt-2 text-sm whitespace-pre-wrap bg-white bg-opacity-50 p-2 rounded">
                {result.details}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  };

  const allTestsComplete = 
    envVarsTest.status !== 'pending' && 
    connectionTest.status !== 'pending' && 
    authTest.status !== 'pending' && 
    databaseTest.status !== 'pending' &&
    importPathTest.status !== 'pending';

  const allTestsPassed = 
    envVarsTest.status === 'success' && 
    connectionTest.status === 'success' && 
    authTest.status === 'success' && 
    databaseTest.status === 'success' &&
    importPathTest.status === 'success';

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Supabase Configuration Tests</h2>
        
        {renderTestResult(envVarsTest)}
        {renderTestResult(importPathTest)}
        {renderTestResult(connectionTest)}
        {renderTestResult(authTest)}
        {renderTestResult(databaseTest)}
      </div>

      {allTestsComplete && (
        <div className={`p-4 rounded-lg ${allTestsPassed ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <h3 className="font-bold text-lg">
            {allTestsPassed 
              ? '🎉 All tests passed! Your Supabase configuration is working correctly.' 
              : '⚠️ Some tests failed. Please check the details above and fix the issues.'}
          </h3>
          
          {!allTestsPassed && (
            <div className="mt-4">
              <h4 className="font-semibold">Common fixes:</h4>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Ensure your <code>.env.local</code> file has the correct Supabase URL and anon key</li>
                <li>Check that your Supabase project is running and accessible</li>
                <li>Verify that your database schema matches the type definitions</li>
                <li>Make sure all imports use <code>@/lib/supabase/client</code> instead of legacy paths</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}