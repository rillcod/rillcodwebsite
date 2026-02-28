import SupabaseTest from '@/components/test/SupabaseTest';

export default function TestSupabasePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Supabase Configuration Test Page</h1>
          <SupabaseTest />
        </div>
      </div>
    </div>
  );
}
