import React from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface DataPoint {
  date: string;
  value: number;
}

interface Series {
  name: string;
  data: DataPoint[];
  color: string;
}

interface ComparisonChartProps {
  title: string;
  series: Series[];
  valueLabel: string;
}

export function ComparisonChart({ title, series, valueLabel }: ComparisonChartProps) {
  const { t, i18n } = useTranslation();

  if (series.length === 0 || series.every(s => s.data.length === 0)) {
    return (
      <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>
        <div className="text-center py-12 text-gray-500">
          {t('dashboard.noDataAvailable')}
        </div>
      </div>
    );
  }

  const allDates = Array.from(
    new Set(series.flatMap(s => s.data.map(d => d.date)))
  ).sort();

  const maxValue = Math.max(
    ...series.flatMap(s => s.data.map(d => d.value)),
    1
  );

  const chartHeight = 300;
  const chartWidth = 100;
  const barWidth = Math.min(80 / (series.length * allDates.length), 12);
  const groupWidth = barWidth * series.length + 2;

  return (
    <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-lg p-6 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>

      <div className="mb-6 flex flex-wrap gap-4">
        {series.map((s, index) => (
          <div key={index} className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-sm font-medium text-gray-700">{s.name}</span>
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto bg-white rounded-lg p-4">
        <div style={{ minWidth: `${Math.max(600, allDates.length * groupWidth * 1.5)}px` }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full"
            style={{ height: '400px' }}
          >
            <defs>
              <linearGradient id="gridGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
              {series.map((s, idx) => (
                <linearGradient key={idx} id={`barGradient${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.7" />
                </linearGradient>
              ))}
            </defs>

            <rect
              x="10"
              y="10"
              width={chartWidth - 15}
              height={chartHeight - 50}
              fill="url(#gridGradient)"
              opacity="0.3"
            />

            <line
              x1="10"
              y1={chartHeight - 40}
              x2={chartWidth - 5}
              y2={chartHeight - 40}
              stroke="#3B82F6"
              strokeWidth="0.8"
            />

            {[0, 25, 50, 75, 100].map((percent) => {
              const y = chartHeight - 40 - ((chartHeight - 60) * percent) / 100;
              return (
                <g key={percent}>
                  <line
                    x1="10"
                    y1={y}
                    x2={chartWidth - 5}
                    y2={y}
                    stroke="#E0E7FF"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                  />
                  <text
                    x="8"
                    y={y + 1}
                    textAnchor="end"
                    className="text-xs fill-blue-600"
                    fontSize="3"
                    fontWeight="600"
                  >
                    {((maxValue * percent) / 100).toFixed(0)}
                  </text>
                </g>
              );
            })}

            {allDates.map((date, dateIndex) => {
              const x = 15 + (dateIndex * (chartWidth - 20)) / allDates.length;

              return (
                <g key={date}>
                  {series.map((s, seriesIndex) => {
                    const dataPoint = s.data.find(d => d.date === date);
                    const value = dataPoint?.value || 0;
                    const barHeight = ((chartHeight - 60) * value) / maxValue;
                    const barX = x + seriesIndex * barWidth;
                    const barY = chartHeight - 40 - barHeight;

                    return (
                      <g key={`${date}-${seriesIndex}`}>
                        <rect
                          x={barX}
                          y={barY}
                          width={barWidth - 0.5}
                          height={barHeight}
                          fill={`url(#barGradient${seriesIndex})`}
                          className="transition-all hover:opacity-80 drop-shadow-md"
                          rx="0.5"
                        />
                        {value > 0 && (
                          <text
                            x={barX + barWidth / 2}
                            y={barY - 2}
                            textAnchor="middle"
                            className="text-xs fill-gray-700"
                            fontSize="2.5"
                            fontWeight="600"
                          >
                            {value.toFixed(0)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <text
                    x={x + (series.length * barWidth) / 2}
                    y={chartHeight - 30}
                    textAnchor="middle"
                    className="text-xs fill-blue-700"
                    fontSize="3"
                    fontWeight="500"
                  >
                    {format(new Date(date), 'MMM dd', { locale: i18n.language === 'ar' ? ar : undefined })}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="text-center mt-2 text-sm font-medium text-blue-700">
            {valueLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
