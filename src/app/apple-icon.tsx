import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #ffd700 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          borderRadius: '32px',
          boxShadow: '0 10px 30px rgba(255, 107, 53, 0.3)',
        }}
      >
        <div
          style={{
            fontSize: '80px',
            fontWeight: 'bold',
            textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          R
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}