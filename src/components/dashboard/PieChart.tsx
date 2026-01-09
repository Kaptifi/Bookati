import React from 'react';
import { useTranslation } from 'react-i18next';

interface PieChartData {
  label: string;
  value: number;
  color: string;
  percentage: number;
}

interface PieChartProps {
  title: string;
  data: PieChartData[];
}

export function PieChart({ title, data }: PieChartProps) {
  const { t } = useTranslation();

  const total = data.reduce((sum, item) => sum + item.value, 0);

  console.log('PieChart:', { title, dataLength: data.length, total, data });

  if (total === 0 || data.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>
        <div className="text-center py-12 text-gray-500">
          {t('dashboard.noDataAvailable')}
        </div>
      </div>
    );
  }

  let currentAngle = 0;
  const centerX = 50;
  const centerY = 50;
  const radius = 40;
  const innerRadius = 15;

  const segments = data.map((item) => {
    const percentage = (item.value / total) * 100;
    let angle = (percentage / 100) * 360;

    // Handle full circle (360 degrees) - slightly reduce to 359.99 to avoid arc path issues
    if (angle >= 360) {
      angle = 359.99;
    }

    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);

    const x3 = centerX + innerRadius * Math.cos(endAngleRad);
    const y3 = centerY + innerRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(startAngleRad);
    const y4 = centerY + innerRadius * Math.sin(startAngleRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z'
    ].join(' ');

    return {
      ...item,
      percentage,
      pathData,
    };
  });

  console.log('PieChart segments:', segments.map(s => ({
    label: s.label,
    value: s.value,
    color: s.color,
    percentage: s.percentage,
    pathData: s.pathData
  })));

  return (
    <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-lg p-6 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>

      <div className="flex flex-col items-center gap-6">
        <div className="w-64 h-64 relative flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ transform: 'scale(1.1)' }}
          >
            {segments.map((segment, index) => (
              <path
                key={index}
                d={segment.pathData}
                fill={segment.color}
                stroke="white"
                strokeWidth="0.3"
                className="transition-all hover:opacity-90 cursor-pointer"
                style={{
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                }}
              />
            ))}
          </svg>
        </div>

        <div className="w-full grid grid-cols-1 gap-2">
          {data.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-white rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-sm shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-gray-900">
                  {item.label}
                </span>
              </div>
              <div className="text-sm flex items-center gap-2">
                <span className="font-bold text-blue-700">
                  ({item.percentage.toFixed(1)}%)
                </span>
                <span className="text-gray-600">{item.value.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
