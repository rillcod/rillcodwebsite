import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — Tech Education & Innovation Hub';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  // Fetch the official logo
  const logoData = await fetch(
    new URL('../../public/logo.png', import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1f35 50%, #0f1729 100%)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Animated Background Pattern */}
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.15) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-10%',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(50px)',
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
            backgroundImage: 'linear-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(249, 115, 22, 0.03) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            opacity: 0.3,
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
            padding: '80px',
            zIndex: 1,
          }}
        >
          {/* Logo Container with Glow Effect */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '48px',
              position: 'relative',
            }}
          >
            {/* Glow Effect Behind Logo */}
            <div
              style={{
                position: 'absolute',
                width: '240px',
                height: '240px',
                background: 'radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(40px)',
              }}
            />
            
            {/* Official Logo */}
            <img
              src={logoData as any}
              alt="Rillcod Technologies"
              width="180"
              height="180"
              style={{
                objectFit: 'contain',
                borderRadius: '28px',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(249, 115, 22, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '8px',
                backdropFilter: 'blur(10px)',
              }}
            />
          </div>

          {/* Brand Name */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                fontSize: '72px',
                fontWeight: '900',
                background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #cbd5e1 100%)',
                backgroundClip: 'text',
                color: 'transparent',
                letterSpacing: '-2px',
                textAlign: 'center',
                lineHeight: 1,
              }}
            >
              RILLCOD TECHNOLOGIES
            </div>
            <div
              style={{
                width: '120px',
                height: '4px',
                background: 'linear-gradient(90deg, transparent 0%, #f97316 50%, transparent 100%)',
                marginTop: '16px',
                borderRadius: '2px',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '32px',
              fontWeight: '600',
              color: '#cbd5e1',
              textAlign: 'center',
              marginBottom: '48px',
              maxWidth: '900px',
              lineHeight: 1.4,
            }}
          >
            Tech Education & Innovation Hub
          </div>

          {/* Service Pills - Premium Design */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '1000px',
            }}
          >
            {[
              { icon: '🎓', label: 'STEM Education', color: '#10b981' },
              { icon: '💻', label: 'Web & App Dev', color: '#3b82f6' },
              { icon: '🤖', label: 'Robotics', color: '#8b5cf6' },
              { icon: '🏠', label: 'Smart Home', color: '#f59e0b' },
              { icon: '🔌', label: 'IoT Solutions', color: '#ec4899' },
            ].map((item, index) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 28px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  borderRadius: '50px',
                  border: '2px solid rgba(249, 115, 22, 0.3)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ fontSize: '28px' }}>{item.icon}</div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#f1f5f9',
                    letterSpacing: '0.5px',
                  }}
                >
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* Location Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '48px',
              padding: '14px 32px',
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.15) 100%)',
              borderRadius: '50px',
              border: '2px solid rgba(249, 115, 22, 0.4)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(249, 115, 22, 0.2)',
            }}
          >
            <div style={{ fontSize: '24px' }}>📍</div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Benin City, Edo State • Nigeria
            </div>
          </div>
        </div>

        {/* Corner Accent */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '200px',
            height: '200px',
            background: 'linear-gradient(135deg, transparent 0%, rgba(249, 115, 22, 0.1) 100%)',
            borderTopLeftRadius: '100%',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
