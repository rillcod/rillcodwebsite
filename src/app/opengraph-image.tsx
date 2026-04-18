import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — Tech Education & Innovation Hub';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#0a0f1e',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Background Gradients (No filters) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #0a0f1e 0%, #1a237e 30%, #0a0f1e 100%)',
            display: 'flex',
          }}
        />
        
        {/* Simplified Glows (Solid Opacity) */}
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '600px',
            height: '600px',
            background: 'rgba(249, 115, 22, 0.08)',
            borderRadius: '50%',
          }}
        />

        {/* Grid Pattern Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'linear-gradient(rgba(249, 115, 22, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(249, 115, 22, 0.05) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            opacity: 0.2,
            display: 'flex',
          }}
        />

        {/* Main Content Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '40px',
            zIndex: 1,
          }}
        >
          {/* Logo Container */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '32px',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '140px',
                height: '140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '24px',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '12px',
                border: '1px solid rgba(249, 115, 22, 0.2)',
              }}
            >
              <img
                src="https://www.rillcod.com/logo.png"
                alt="Rillcod Technologies"
                width="110"
                height="110"
                style={{
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          {/* Brand Name (Solid White for Satori Compatibility) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                fontSize: '64px',
                fontWeight: '900',
                color: '#ffffff',
                letterSpacing: '-2px',
                textAlign: 'center',
                lineHeight: 1.1,
              }}
            >
              RILLCOD TECHNOLOGIES
            </div>
            <div
              style={{
                width: '120px',
                height: '4px',
                background: '#f97316',
                marginTop: '12px',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#94a3b8',
              textAlign: 'center',
              marginBottom: '40px',
              maxWidth: '850px',
            }}
          >
            Tech Education & Innovation Hub
          </div>

          {/* Service Pills */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {[
              'STEM Education',
              'Web & App Dev',
              'Robotics',
              'IoT Solutions',
            ].map((label) => (
              <div
                key={label}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(249, 115, 22, 0.15)',
                  borderRadius: '50px',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  color: '#f8fafc',
                  fontSize: '18px',
                  fontWeight: '700',
                  display: 'flex',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Location Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '40px',
              padding: '12px 28px',
              background: 'rgba(249, 115, 22, 0.1)',
              borderRadius: '50px',
              border: '2px solid rgba(249, 115, 22, 0.5)',
              color: '#f97316',
              fontSize: '18px',
              fontWeight: '800',
            }}
          >
            Nigeria • Benin City • Edo State
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
