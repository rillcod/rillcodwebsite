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
          background: '#ffffff',
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
            background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1f35 50%, #0f1729 100%)',
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
            }}
          />

          {/* Glow Effect */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '400px',
              height: '400px',
              background: 'radial-gradient(circle, rgba(249, 115, 22, 0.3) 0%, transparent 70%)',
              filter: 'blur(60px)',
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
            {/* Official Logo with Premium Frame */}
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
                  width: '200px',
                  height: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '32px',
                  boxShadow: '0 30px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(249, 115, 22, 0.3)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '20px',
                  overflow: 'hidden',
                }}
              >
                <img
                  src="https://www.rillcod.com/logo.png"
                  alt="Rillcod Logo"
                  width="160"
                  height="160"
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
              }}
            >
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: '900',
                  background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
                  backgroundClip: 'text',
                  color: 'transparent',
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
                  height: '3px',
                  background: 'linear-gradient(90deg, transparent 0%, #f97316 50%, transparent 100%)',
                  marginTop: '16px',
                  borderRadius: '2px',
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
            padding: '60px 50px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            position: 'relative',
          }}
        >
          {/* Subtle Pattern */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '300px',
              height: '300px',
              background: 'radial-gradient(circle, rgba(249, 115, 22, 0.05) 0%, transparent 70%)',
              borderRadius: '50%',
            }}
          />

          {/* Main Heading */}
          <div
            style={{
              fontSize: '52px',
              fontWeight: '900',
              color: '#0f172a',
              lineHeight: 1.1,
              marginBottom: '20px',
              letterSpacing: '-1px',
            }}
          >
            Tech Education &<br />
            Innovation Hub
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '22px',
              color: '#64748b',
              marginBottom: '40px',
              lineHeight: 1.5,
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
              gap: '14px',
            }}
          >
            {[
              { icon: '🎓', title: 'STEM Education', desc: 'Coding & Robotics Training', gradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '#86efac' },
              { icon: '💻', title: 'Web & App Development', desc: 'Custom Software Solutions', gradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '#93c5fd' },
              { icon: '🏠', title: 'Smart Home & IoT', desc: 'Automation Systems', gradient: 'linear-gradient(135deg, #fef3f2 0%, #fee2e2 100%)', border: '#fca5a5' },
            ].map((service) => (
              <div
                key={service.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                  padding: '18px 24px',
                  background: service.gradient,
                  borderRadius: '16px',
                  border: `2px solid ${service.border}`,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {service.icon}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: '800',
                      color: '#0f172a',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {service.title}
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      color: '#64748b',
                      fontWeight: '500',
                      marginTop: '2px',
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
              gap: '12px',
              marginTop: '36px',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              borderRadius: '50px',
              border: '2px solid #fed7aa',
              width: 'fit-content',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.1)',
            }}
          >
            <div style={{ fontSize: '20px' }}>📍</div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#ea580c',
              }}
            >
              Benin City, Edo State • Nigeria
            </div>
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
            background: 'linear-gradient(180deg, #f97316 0%, #ea580c 50%, #f97316 100%)',
            boxShadow: '0 0 20px rgba(249, 115, 22, 0.5)',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
