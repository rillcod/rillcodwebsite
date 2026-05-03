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
          backgroundColor: '#ffffff',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {/* Left Panel - Branded Section */}
        <div
          style={{
            width: '42%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#0a0f1e',
            padding: '40px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background Glow */}
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '10%',
              width: '400px',
              height: '400px',
              background: 'radial-gradient(circle, rgba(249, 115, 22, 0.15) 0%, transparent 70%)',
              display: 'flex',
            }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: '180px',
                height: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '32px',
                background: 'white',
                padding: '20px',
                marginBottom: '32px',
              }}
            >
              <img
                src="https://www.rillcod.com/logo.png"
                alt="Logo"
                width="140"
                height="140"
                style={{ objectFit: 'contain' }}
              />
            </div>

            <div
              style={{
                fontSize: '48px',
                fontWeight: '900',
                color: '#ffffff',
                letterSpacing: '-1px',
                lineHeight: 1,
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
                marginTop: '8px',
              }}
            >
              Technologies
            </div>
            <div
              style={{
                width: '60px',
                height: '4px',
                background: '#f97316',
                marginTop: '20px',
              }}
            />
          </div>
        </div>

        {/* Right Panel - Content Section */}
        <div
          style={{
            width: '58%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '60px',
            backgroundColor: '#f8fafc',
            position: 'relative',
          }}
        >
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

          <p
            style={{
              fontSize: '20px',
              color: '#64748b',
              marginBottom: '32px',
              fontWeight: '500',
            }}
          >
            Empowering Nigeria with cutting-edge tech solutions and premium STEM education.
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {[
              { icon: '🎓', title: 'STEM Education', color: '#ecfdf5', border: '#86efac' },
              { icon: '💻', title: 'Web & App Dev', color: '#eff6ff', border: '#93c5fd' },
              { icon: '🤖', title: 'Robotics & AI', color: '#fef3f2', border: '#fca5a5' },
            ].map((s) => (
              <div
                key={s.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px 20px',
                  background: s.color,
                  borderRadius: '16px',
                  border: `2px solid ${s.border}`,
                }}
              >
                <span style={{ fontSize: '28px' }}>{s.icon}</span>
                <span style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{s.title}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '32px',
              gap: '10px',
              color: '#ea580c',
              fontSize: '16px',
              fontWeight: '700',
            }}
          >
            📍 Benin City, Edo State • Nigeria
          </div>
        </div>

        {/* Separator */}
        <div
          style={{
            position: 'absolute',
            left: '42%',
            top: 0,
            width: '4px',
            height: '100%',
            background: '#f97316',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
