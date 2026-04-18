import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Rillcod Technologies — STEM & Coding Education';
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
          <img
            src={logoData as any}
            alt="Logo"
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
                color: '#f97316',
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
            marginBottom: '40px',
          }}
        >
          Empowering Nigerian Children with Future-Ready Tech Skills.
        </div>

        {/* Categories */}
        <div
          style={{
            display: 'flex',
            gap: '30px',
          }}
        >
          {['Coding', 'Robotics', 'AI'].map((item, i) => (
            <div
              key={item}
              style={{
                background: 'rgba(249, 115, 22, 0.1)',
                padding: '12px 32px',
                borderRadius: '50px',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                color: '#f97316',
                fontSize: '22px',
                fontWeight: '600',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

