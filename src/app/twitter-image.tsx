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
            <div
              style={{
                width: '80px',
                height: '80px',
                backgroundColor: '#ff6b35',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '20px',
                boxShadow: '0 10px 30px rgba(255, 107, 53, 0.3)',
              }}
            >
              <div
                style={{
                  color: 'white',
                  fontSize: '36px',
                  fontWeight: 'bold',
                }}
              >
                R
              </div>
            </div>
            <div
              style={{
                color: 'white',
                fontSize: '48px',
                fontWeight: 'bold',
                letterSpacing: '-2px',
              }}
            >
              RILLCOD
            </div>
          </div>

          {/* Main Title */}
          <div
            style={{
              color: 'white',
              fontSize: '52px',
              fontWeight: 'bold',
              lineHeight: 1.1,
              marginBottom: '20px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #ffd700 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Tech Education &
            <br />
            Innovation Hub
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
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}