import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — Tech Education & Innovation';
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
          backgroundColor: '#ffffff',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {/* Left Panel - Dark Branded Section */}
        <div
          style={{
            width: '42%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#0a0f1e',
            padding: '60px 40px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background Pattern */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(249, 115, 22, 0.15) 1px, transparent 0)',
              backgroundSize: '40px 40px',
              opacity: 0.3,
              display: 'flex',
            }}
          />

          {/* Glow Effect (Simplified) */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              left: '20%',
              width: '300px',
              height: '300px',
              background: 'rgba(249, 115, 22, 0.1)',
              borderRadius: '50%',
            }}
          />

          {/* Logo Container */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 1,
            }}
          >
            {/* Official Logo */}
            <div
              style={{
                width: '180px',
                height: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '32px',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '20px',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              <img
                src="https://www.rillcod.com/logo.png"
                alt="Rillcod Logo"
                width="140"
                height="140"
                style={{
                  objectFit: 'contain',
                }}
              />
            </div>

            {/* Brand Name */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: '32px',
              }}
            >
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: '900',
                  color: '#ffffff',
                  letterSpacing: '-1px',
                  textAlign: 'center',
                }}
              >
                RILLCOD
              </div>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#f97316',
                  letterSpacing: '4px',
                  textTransform: 'uppercase',
                  marginTop: '4px',
                }}
              >
                Technologies
              </div>
              <div
                style={{
                  width: '80px',
                  height: '4px',
                  background: '#f97316',
                  marginTop: '16px',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Light Content Section */}
        <div
          style={{
            width: '58%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '40px 45px',
            backgroundColor: '#f8fafc',
            position: 'relative',
          }}
        >
          {/* Main Heading */}
          <div
            style={{
              fontSize: '48px',
              fontWeight: '900',
              color: '#0f172a',
              lineHeight: 1.1,
              marginBottom: '16px',
              letterSpacing: '-1px',
            }}
          >
            Tech Education &<br />
            Innovation Hub
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '20px',
              color: '#64748b',
              marginBottom: '32px',
              lineHeight: 1.4,
              fontWeight: '500',
            }}
          >
            Empowering Nigeria with cutting-edge<br />
            technology solutions and education
          </div>

          {/* Service Cards */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {[
              { icon: '🎓', title: 'STEM Education', desc: 'Coding & Robotics Training', color: '#ecfdf5', border: '#86efac' },
              { icon: '💻', title: 'Web & App Development', desc: 'Custom Software Solutions', color: '#eff6ff', border: '#93c5fd' },
              { icon: '🏠', title: 'Smart Home & IoT', desc: 'Automation Systems', color: '#fef3f2', border: '#fca5a5' },
            ].map((service) => (
              <div
                key={service.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 20px',
                  background: service.color,
                  borderRadius: '14px',
                  border: `2px solid ${service.border}`,
                  display: 'flex',
                }}
              >
                <div style={{ fontSize: '32px' }}>{service.icon}</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: '800',
                      color: '#0f172a',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {service.title}
                  </div>
                  <div
                    style={{
                      fontSize: '15px',
                      color: '#64748b',
                      fontWeight: '500',
                    }}
                  >
                    {service.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Location Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '28px',
              padding: '10px 24px',
              background: '#fff7ed',
              borderRadius: '50px',
              border: '2px solid #fed7aa',
              color: '#ea580c',
              fontSize: '16px',
              fontWeight: '700',
            }}
          >
            📍 Benin City, Edo State • Nigeria
          </div>
        </div>

        {/* Vertical Accent Line */}
        <div
          style={{
            position: 'absolute',
            left: '42%',
            top: '0',
            width: '4px',
            height: '100%',
            background: '#f97316',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
