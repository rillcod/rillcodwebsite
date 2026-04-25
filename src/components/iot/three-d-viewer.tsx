import React from 'react';

interface ThreeDDeviceViewerProps {
  deviceType: string;
  sensorData: any;
}

export const ThreeDDeviceViewer: React.FC<ThreeDDeviceViewerProps> = ({ deviceType, sensorData }) => {
  return (
    <div className="flex items-center justify-center h-32 bg-muted rounded-md">
      <p>3D Viewer for {deviceType}</p>
      <pre>{JSON.stringify(sensorData, null, 2)}</pre>
    </div>
  );
}; 