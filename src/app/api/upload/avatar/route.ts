import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { storageService } from '@/services/storage.service';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'Only images are allowed' }, { status: 400 });
        }

        // Validate file size (e.g., 2MB limit)
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: 'File size must be less than 2MB' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const extension = file.name.split('.').pop() || 'png';
        const key = `${user.id}-${Date.now()}.${extension}`;

        // Upload to R2 (via StorageService)
        const storagePath = await storageService.uploadFile('avatars', key, buffer, file.type);
        const publicUrl = await storageService.getDownloadUrl('avatars', storagePath);

        // Update user profile in Supabase
        const { error: updateError } = await supabase
            .from('portal_users')
            .update({ profile_image_url: publicUrl })
            .eq('id', user.id);

        if (updateError) {
            console.error('Failed to update profile image:', updateError);
            return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            url: publicUrl 
        });

    } catch (error: any) {
        console.error('Avatar upload error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
