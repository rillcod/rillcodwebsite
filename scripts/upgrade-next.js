const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to update package.json
function updatePackageJson() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Update Next.js and related dependencies
  packageJson.dependencies = {
    ...packageJson.dependencies,
    'next': '15.0.0',
    '@supabase/auth-helpers-nextjs': '^0.9.0',
    '@supabase/ssr': '^0.1.0',
    '@supabase/supabase-js': '^2.39.3',
    'react': '18.2.0',
    'react-dom': '18.2.0'
  };

  // Update dev dependencies
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    'eslint-config-next': '15.0.0',
    '@types/react': '^18.2.52',
    '@types/react-dom': '^18.2.18',
    '@types/node': '^20.11.16'
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

// Function to update middleware
function updateMiddleware() {
  const middlewarePath = path.join(process.cwd(), 'src/middleware.ts');
  const middlewareContent = `import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session and trying to access protected routes
  if (!session && req.nextUrl.pathname.startsWith('/dashboard')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If session exists and trying to access auth pages
  if (session && (req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup'))) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/signup',
  ],
};`;

  fs.writeFileSync(middlewarePath, middlewareContent);
}

// Function to update server-side Supabase client
function updateSupabaseServer() {
  const supabaseServerPath = path.join(process.cwd(), 'src/utils/supabase/server.ts');
  const supabaseServerContent = `import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';

export const createServerSupabaseClient = () => {
  const cookieStore = cookies();
  return createServerComponentClient<Database>({ cookies: () => cookieStore });
};`;

  fs.writeFileSync(supabaseServerPath, supabaseServerContent);
}

// Main upgrade process
console.log('Starting Next.js upgrade process...');

try {
  // Update package.json
  console.log('Updating package.json...');
  updatePackageJson();

  // Update middleware
  console.log('Updating middleware...');
  updateMiddleware();

  // Update Supabase server client
  console.log('Updating Supabase server client...');
  updateSupabaseServer();

  // Install dependencies
  console.log('Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  // Clear Next.js cache
  console.log('Clearing Next.js cache...');
  execSync('rm -rf .next', { stdio: 'inherit' });

  console.log('Upgrade completed successfully!');
  console.log('Please run "npm run dev" to test the application.');
} catch (error) {
  console.error('Error during upgrade:', error);
  process.exit(1);
} 