# Rillcod Academy Website

A modern Next.js website for Rillcod Academy, featuring technology education programs for Nigerian students.

## 🚀 Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Mode**: Theme toggle with system preference support
- **Registration Forms**: Student and school registration with Supabase backend
- **Modern UI**: Built with Tailwind CSS and Lucide icons
- **SEO Optimized**: Meta tags and structured data

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Icons**: Lucide React
- **Deployment**: Cloudflare Containers (primary). See `docs/CLOUDFLARE_DEPLOY.md`.

## 🚀 Deploy (production)

Push to **`main`** → GitHub Action deploys to Cloudflare automatically.

```bash
git add .
git commit -m "your message"
git push origin main
```

Watch: https://github.com/rillcod/rillcodwebsite/actions

**One-time GitHub secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`718b36de1443954931b052a9594d329d`).

Local alternative (Docker required): `npm run deploy`

Full handbook: [`docs/CLOUDFLARE_DEPLOY.md`](docs/CLOUDFLARE_DEPLOY.md)

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rillcod/rillcod1.git
   cd rillcod1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

## 🗄️ Database Schema

### Students Table
```sql
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INTEGER,
  grade TEXT,
  school_name TEXT, -- or current_school depending on your schema
  gender TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  course_interest TEXT,
  preferred_schedule TEXT,
  hear_about_us TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Schools Table
```sql
CREATE TABLE schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  school_type TEXT,
  contact_person TEXT,
  address TEXT,
  lga TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  student_count INTEGER,
  program_interest TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🚨 Troubleshooting

### Registration Issues

#### 1. "Failed to fetch" Error (Development)
**Cause**: Network connectivity or CORS issues
**Solution**:
- Check your internet connection
- Verify Supabase URL and key are correct
- Ensure Supabase project is active
- Check browser console for detailed error messages

#### 2. "Could not find school name column" Error
**Cause**: Database schema mismatch
**Solution**:
1. **Check your database schema**:
   ```sql
   -- Run this in Supabase SQL editor
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'students';
   ```

2. **Update column names if needed**:
   ```sql
   -- If you need to rename current_school to school_name
   ALTER TABLE students RENAME COLUMN current_school TO school_name;
   ```

3. **Check the Cloudflare environment**:
   - Run `npm run cf:env:check`.
   - Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present.

#### 3. Environment Variables Not Working
**Solution**:
1. **For Development**: Ensure `.env.local` exists in project root
2. **For production**: update the Cloudflare environment with `npm run cf:env`
3. **Restart development server** after adding environment variables

### Theme Issues

#### Theme Toggle Not Working
**Solution**:
- Clear browser cache and localStorage
- Check browser console for errors
- Ensure all theme-related components are properly imported

## 🌐 Deployment

### Cloudflare Containers deployment

Push to `main` to run `.github/workflows/deploy-cloudflare.yml`, or run `npm run deploy` locally with Docker available. See `docs/CLOUDFLARE_DEPLOY.md` for environment, DNS and smoke-test instructions.

## 📱 Mobile Optimization

- Responsive design for all screen sizes
- Touch-friendly navigation
- Optimized images and performance
- PWA-ready configuration

## 🔒 Security

- Environment variables for sensitive data
- Supabase Row Level Security (RLS)
- Input validation and sanitization
- HTTPS enforcement

## 📞 Support

For technical support or questions:
- Email: support@rillcod.com
- Phone: +234 811 660 0091
- WhatsApp: [Chat with us](https://wa.me/2348116600091)

## 📄 License

This project is proprietary to Rillcod Academy. All rights reserved.

---

**Made with ❤️ in Nigeria**
