import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          background: '#0a0f1e',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          overflow: 'hidden',
          color: 'white',
        }}
      >
        {/* Background Base - Deep Blue Gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1f35 50%, #0f1729 100%)',
            display: 'flex',
          }}
        />

        {/* Large Orange Glow Orb */}
        <div
          style={{
            position: 'absolute',
            top: '-300px',
            right: '-100px',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Medium Blue Glow Orb */}
        <div
          style={{
            position: 'absolute',
            bottom: '-200px',
            left: '-100px',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Grid Pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(249, 115, 22, 0.05) 1px, transparent 1px)',
            backgroundSize: '100% 50px',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(90deg, rgba(249, 115, 22, 0.05) 1px, transparent 1px)',
            backgroundSize: '50px 100%',
            display: 'flex',
          }}
        />

        {/* Main Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '40px',
            zIndex: 10,
          }}
        >
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
                position: 'absolute',
                width: '240px',
                height: '240px',
                background: 'radial-gradient(circle, rgba(249, 115, 22, 0.2) 0%, transparent 70%)',
                display: 'flex',
              }}
            />
            
            <div
              style={{
                width: '150px',
                height: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '28px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                padding: '16px',
              }}
            >
              <img
                src="https://www.rillcod.com/logo.png"
                alt="Logo"
                width="120"
                height="120"
                style={{ objectFit: 'contain' }}
              />
            </div>
          </div>

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
                fontSize: '60px',
                fontWeight: '900',
                color: '#ffffff',
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
                background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
                marginTop: '16px',
              }}
            />
          </div>

          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#d1d5db',
              textAlign: 'center',
              marginBottom: '40px',
            }}
          >
            Tech Education & Innovation Hub
          </div>

          <div
            style={{
              display: 'flex',
              gap: '14px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              maxWidth: '1000px',
            }}
          >
            {['STEM Education', 'Web & App Dev', 'Robotics', 'Smart Home', 'IoT Solutions'].map((text) => (
              <div
                key={text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 24px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: '50px',
                  border: '1px solid rgba(249, 115, 22, 0.4)',
                  color: '#f3f4f6',
                  fontSize: '18px',
                  fontWeight: '700',
                }}
              >
                {text}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '40px',
              gap: '12px',
              padding: '12px 30px',
              background: 'rgba(249, 115, 22, 0.1)',
              borderRadius: '50px',
              border: '2px solid #f97316',
            }}
          >
            <div style={{ fontSize: '20px' }}>📍</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#f97316' }}>
              Benin City, Edo State • Nigeria
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
