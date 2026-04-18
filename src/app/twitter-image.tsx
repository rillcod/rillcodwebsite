import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — STEM & Coding Education';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  // Fetch the logo
  const logoData = await fetch(
    new URL('../../../public/logo.png', import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Official Logo */}
        <img
          src={logoData as any}
          alt="Rillcod Technologies Logo"
          width={150}
          height={150}
          style={{
            marginBottom: 40,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 20,
            background: 'linear-gradient(90deg, #ffffff 0%, #f97316 100%)',
            backgroundClip: 'text',
            color: 'transparent',
            lineHeight: 1.2,
          }}
        >
          Rillcod Technologies
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            textAlign: 'center',
            color: '#94a3b8',
            marginBottom: 30,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Empowering Nigerian Children with STEM Skills
        </div>

        {/* Features */}
        <div
          style={{
            display: 'flex',
            gap: 30,
            fontSize: 24,
            color: '#cbd5e1',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: '#10b981',
              }}
            />
            Coding
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: '#3b82f6',
              }}
            />
            Robotics
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: '#8b5cf6',
              }}
            />
            AI
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
