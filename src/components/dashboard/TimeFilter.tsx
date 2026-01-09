import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Calendar } from 'lucide-react';

export type TimeRange = 'today' | 'yesterday' | 'last_week' | 'last_month' | 'custom';

interface TimeFilterProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (startDate: string, endDate: string) => void;
}

export function TimeFilter({
  selectedRange,
  onRangeChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
}: TimeFilterProps) {
  const { t } = useTranslation();

  const ranges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: t('dashboard.today') },
    { value: 'yesterday', label: t('dashboard.yesterday') },
    { value: 'last_week', label: t('dashboard.lastWeek') },
    { value: 'last_month', label: t('dashboard.lastMonth') },
    { value: 'custom', label: t('dashboard.customRange') },
  ];

  return (
    <div className="bg-white rounded-lg border p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-900">{t('dashboard.timeRange')}</h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {ranges.map((range) => (
          <Button
            key={range.value}
            size="sm"
            variant={selectedRange === range.value ? 'primary' : 'secondary'}
            onClick={() => onRangeChange(range.value)}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {selectedRange === 'custom' && onCustomDateChange && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
          <Input
            type="date"
            label={t('dashboard.startDate')}
            value={customStartDate || ''}
            onChange={(e) => onCustomDateChange(e.target.value, customEndDate || '')}
          />
          <Input
            type="date"
            label={t('dashboard.endDate')}
            value={customEndDate || ''}
            onChange={(e) => onCustomDateChange(customStartDate || '', e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
