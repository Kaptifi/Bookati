import React from 'react';
import { 
  Clock, 
  CreditCard, 
  UtensilsCrossed, 
  Users, 
  Shield, 
  Calendar,
  CheckCircle,
  Sparkles
} from 'lucide-react';

export type BadgeType = 
  | 'flexible-duration'
  | 'book-now-pay-later'
  | 'meals-included'
  | 'guided-tour'
  | 'free-cancellation'
  | 'instant-confirmation'
  | 'vip-access'
  | 'custom';

interface ServiceBadgeProps {
  type: BadgeType;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const badgeIcons: Record<BadgeType, React.ReactNode> = {
  'flexible-duration': <Clock className="w-4 h-4" />,
  'book-now-pay-later': <CreditCard className="w-4 h-4" />,
  'meals-included': <UtensilsCrossed className="w-4 h-4" />,
  'guided-tour': <Users className="w-4 h-4" />,
  'free-cancellation': <Shield className="w-4 h-4" />,
  'instant-confirmation': <CheckCircle className="w-4 h-4" />,
  'vip-access': <Sparkles className="w-4 h-4" />,
  'custom': null,
};

const defaultLabels: Record<BadgeType, string> = {
  'flexible-duration': 'Flexible duration',
  'book-now-pay-later': 'Book now, pay later',
  'meals-included': 'Meals included',
  'guided-tour': 'Guided tour',
  'free-cancellation': 'Free cancellation',
  'instant-confirmation': 'Instant confirmation',
  'vip-access': 'VIP access',
  'custom': '',
};

const sizeClasses = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

export function ServiceBadge({
  type,
  label,
  icon,
  className = '',
  size = 'md',
}: ServiceBadgeProps) {
  const displayLabel = label || defaultLabels[type];
  const displayIcon = icon || badgeIcons[type];

  if (!displayLabel) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full font-medium ${sizeClasses[size]} ${className}`}
    >
      {displayIcon && <span className="flex-shrink-0">{displayIcon}</span>}
      <span>{displayLabel}</span>
    </div>
  );
}

interface ServiceBadgesProps {
  badges: Array<{ type: BadgeType; label?: string }>;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ServiceBadges({ badges, className = '', size = 'md' }: ServiceBadgesProps) {
  if (!badges || badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {badges.map((badge, index) => {
        // Validate badge type
        const validTypes: BadgeType[] = [
          'flexible-duration',
          'book-now-pay-later',
          'meals-included',
          'guided-tour',
          'free-cancellation',
          'instant-confirmation',
          'vip-access',
          'custom',
        ];
        const badgeType = validTypes.includes(badge.type as BadgeType) 
          ? (badge.type as BadgeType)
          : 'custom';
        
        return (
          <ServiceBadge
            key={index}
            type={badgeType}
            label={badge.label}
            size={size}
          />
        );
      })}
    </div>
  );
}

