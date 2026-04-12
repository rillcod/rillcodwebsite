-- Newsletters table
CREATE TABLE IF NOT EXISTS newsletters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Markdown/HTML content
    image_url TEXT,
    author_id UUID REFERENCES portal_users(id),
    status TEXT DEFAULT 'draft', -- draft, published
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- Newsletter delivery tracking (for View-Once popups)
CREATE TABLE IF NOT EXISTS newsletter_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    is_viewed BOOLEAN DEFAULT false,
    delivered_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(newsletter_id, user_id)
);

-- RLS
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_delivery ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins can manage newsletters" ON newsletters
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can manage delivery" ON newsletter_delivery
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );

-- Users can view published newsletters they are recipients of
CREATE POLICY "Users can view their newsletters" ON newsletters
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM newsletter_delivery 
            WHERE newsletter_id = newsletters.id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view/update their delivery status" ON newsletter_delivery
    FOR ALL TO authenticated USING (user_id = auth.uid());
