import React from 'react';
import { useTranslation } from 'react-i18next';

interface ChartData {
  label: string;
  value: number;
  revenue: number;
  color: string;
}

interface PerformanceChartProps {
  title: string;
  data: ChartData[];
  metric: 'bookings' | 'revenue';
}

export function PerformanceChart({ title, data, metric }: PerformanceChartProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const maxValue = Math.max(...data.map((item) => (metric === 'bookings' ? item.value : item.revenue)), 1);

  return (
    <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-lg p-6 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>

      {data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {t('dashboard.noDataAvailable')}
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((item, index) => {
            const percentage = ((metric === 'bookings' ? item.value : item.revenue) / maxValue) * 100;

            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-900">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-blue-700 font-bold">
                      {metric === 'bookings'
                        ? `${item.value} ${t('dashboard.bookings').toLowerCase()}`
                        : `${item.revenue.toFixed(2)} ${t('service.currency')}`
                      }
                    </span>
                    {metric === 'bookings' && item.revenue > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {item.revenue.toFixed(2)} {t('service.currency')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative w-full bg-gradient-to-r from-gray-100 to-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out relative"
                    style={{
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}dd 100%)`,
                      boxShadow: `0 2px 8px ${item.color}40`,
                      [isRTL ? 'marginRight' : 'marginLeft']: 0,
                      direction: isRTL ? 'rtl' : 'ltr',
                    }}
                  >
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
