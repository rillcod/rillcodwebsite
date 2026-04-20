import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'Rillcod Technologies — Tech Education & Innovation Hub';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  const logoBuffer = readFileSync(join(process.cwd(), 'public/images/logo.png'));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

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
          backgroundColor: '#0f0f1a',
          backgroundImage: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
          position: 'relative',
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
            backgroundImage: `
              radial-gradient(circle at 25% 25%, rgba(255, 165, 0, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 75% 75%, rgba(138, 43, 226, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(0, 191, 255, 0.05) 0%, transparent 50%)
            `,
            display: 'flex',
          }}
        />

        {/* Twitter Badge */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            right: '30px',
            backgroundColor: '#1da1f2',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '16px',
            fontWeight: 'bold',
            display: 'flex',
          }}
        >
          @rillcod_
        </div>

        {/* Main Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            zIndex: 1,
            padding: '60px',
          }}
        >
          {/* Logo/Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt="Rillcod Technologies"
              width={80}
              height={80}
              style={{ marginRight: '20px', objectFit: 'contain' }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  color: 'white',
                  fontSize: '40px',
                  fontWeight: 'bold',
                  letterSpacing: '-1px',
                  lineHeight: 1,
                }}
              >
                RILLCOD
              </div>
              <div
                style={{
                  color: '#ff6b35',
                  fontSize: '18px',
                  fontWeight: '600',
                  letterSpacing: '4px',
                  lineHeight: 1,
                  marginTop: '4px',
                }}
              >
                TECHNOLOGIES
              </div>
            </div>
          </div>

          {/* Main Title */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: 'white',
              fontSize: '52px',
              fontWeight: 'bold',
              lineHeight: 1.1,
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex' }}>Tech Education &amp;</div>
            <div style={{ display: 'flex' }}>Innovation Hub</div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              color: '#a0a0a0',
              fontSize: '26px',
              fontWeight: '500',
              lineHeight: 1.3,
              textAlign: 'center',
              marginBottom: '30px',
              display: 'flex',
            }}
          >
            STEM • Robotics • Coding • Web Development
          </div>

          {/* Location */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#ff6b35',
              fontSize: '20px',
              fontWeight: '600',
            }}
          >
            📍 Benin City, Nigeria
          </div>
        </div>

        {/* Decorative Elements */}
        <div
          style={{
            position: 'absolute',
            top: '50px',
            left: '50px',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.2) 0%, rgba(138, 43, 226, 0.2) 100%)',
            filter: 'blur(40px)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            right: '50px',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0, 191, 255, 0.2) 0%, rgba(255, 107, 53, 0.2) 100%)',
            filter: 'blur(30px)',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
