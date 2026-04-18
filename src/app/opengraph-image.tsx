import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — Nigeria\'s Leading STEM & Coding Academy';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  // Fetch the local logo
  const logoData = await fetch(
    new URL('../../public/images/logo.png', import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Container for Logo + Brand Name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            marginBottom: '40px',
          }}
        >
          {/* Official Logo alongside the Brand Title */}
          <img
            src={logoData as any}
            alt="Rillcod Technologies Logo"
            width="180"
            height="180"
            style={{
              borderRadius: '24px',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: '96px',
                fontWeight: 'bold',
                color: 'white',
                lineHeight: 1,
              }}
            >
              Rillcod
            </div>
            <div
              style={{
                fontSize: '52px',
                fontWeight: 'bold',
                color: '#f97316', // Orange theme color
                lineHeight: 1,
                marginTop: '10px',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              Technologies
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            color: '#94a3b8',
            maxWidth: '900px',
            textAlign: 'center',
            lineHeight: 1.4,
            marginBottom: '50px',
          }}
        >
          Nigeria's Premier STEM, Coding & Robotics Academy for Future Leaders.
        </div>

        {/* Feature Tags */}
        <div
          style={{
            display: 'flex',
            gap: '30px',
          }}
        >
          {['Coding', 'Robotics', 'AI', 'STEM'].map((item, i) => (
            <div
              key={item}
              style={{
                background: i % 2 === 0 ? '#1e293b' : 'rgba(249, 115, 22, 0.1)',
                padding: '12px 32px',
                borderRadius: '50px',
                border: i % 2 === 0 ? '1px solid #334155' : '1px solid rgba(249, 115, 22, 0.3)',
                color: i % 2 === 0 ? '#cbd5e1' : '#f97316',
                fontSize: '22px',
                fontWeight: '600',
              }}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '20px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>Benin City, Edo State</span>
          <div style={{ width: '4px', height: '4px', borderRadius: '2px', background: '#334155' }} />
          <span>Nigeria</span>
          <div style={{ width: '4px', height: '4px', borderRadius: '2px', background: '#334155' }} />
          <span>www.rillcod.com</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

