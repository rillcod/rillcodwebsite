import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { storageService } from '@/services/storage.service';

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerClient();
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify staff role
        const { data: profile } = await adminClient()
            .from('portal_users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
            return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const studentName = formData.get('studentName') as string || 'generic';
        const folder = formData.get('folder') as string || 'reports';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Only images are allowed' }, { status: 400 });
        }

        // Validate file size (e.g., 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const timestamp = new Date().getTime();
        const cleanName = studentName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const extension = file.name.split('.').pop();
        const fileName = `${cleanName}_${timestamp}.${extension}`;

        // Upload to R2 via StorageService (expects 4 arguments)
        await storageService.uploadFile(
            folder,
            fileName,
            buffer,
            file.type
        );

        // Use the Media Proxy URL for permanent storage in the DB
        const publicUrl = `/api/media/${folder}/${fileName}`;

        return NextResponse.json({ 
            success: true, 
            url: publicUrl,
            key: fileName 
        });
    } catch (error: any) {
        console.error('Report photo upload error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
