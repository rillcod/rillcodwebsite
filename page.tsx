import { createClient } from './utils/supabase/server'

export default async function Page() {
  const supabase = await createClient()

  // For now, just return a simple page since we don't have todos table
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Welcome to Begnagan</h1>
      <p>Your school registration system is ready!</p>
    </div>
  )
}
