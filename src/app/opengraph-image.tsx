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
            padding: '50px 80px',
            zIndex: 1,
          }}
        >
          {/* Logo Container with Glow Effect */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '28px',
              position: 'relative',
            }}
          >
            {/* Glow Effect Behind Logo */}
            <div
              style={{
                position: 'absolute',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(40px)',
              }}
            />
            
            {/* Official Logo */}
            <div
              style={{
                width: '140px',
                height: '140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '24px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(249, 115, 22, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '14px',
                overflow: 'hidden',
              }}
            >
              <img
                src="https://www.rillcod.com/logo.png"
                alt="Rillcod Technologies"
                width="112"
                height="112"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>

          {/* Brand Name */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                fontSize: '58px',
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
                width: '100px',
                height: '3px',
                background: 'linear-gradient(90deg, transparent 0%, #f97316 50%, transparent 100%)',
                marginTop: '12px',
                borderRadius: '2px',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '26px',
              fontWeight: '600',
              color: '#cbd5e1',
              textAlign: 'center',
              marginBottom: '32px',
              maxWidth: '900px',
              lineHeight: 1.3,
            }}
          >
            Tech Education & Innovation Hub
          </div>

          {/* Service Pills - Premium Design */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '1000px',
            }}
          >
            {[
              { icon: '🎓', label: 'STEM Education' },
              { icon: '💻', label: 'Web & App Dev' },
              { icon: '🤖', label: 'Robotics' },
              { icon: '🏠', label: 'Smart Home' },
              { icon: '🔌', label: 'IoT Solutions' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 22px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  borderRadius: '50px',
                  border: '2px solid rgba(249, 115, 22, 0.3)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ fontSize: '22px' }}>{item.icon}</div>
                <div
                  style={{
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#f1f5f9',
                    letterSpacing: '0.3px',
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
              gap: '10px',
              marginTop: '32px',
              padding: '10px 24px',
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.15) 100%)',
              borderRadius: '50px',
              border: '2px solid rgba(249, 115, 22, 0.4)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 6px 24px rgba(249, 115, 22, 0.2)',
            }}
          >
            <div style={{ fontSize: '20px' }}>📍</div>
            <div
              style={{
                fontSize: '17px',
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
