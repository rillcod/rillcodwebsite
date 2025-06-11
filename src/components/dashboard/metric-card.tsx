import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface MetricCardProps {
  title: string
  value: number
  trend: string
  icon: string
  priority?: boolean
}

export function MetricCard({ title, value, trend, icon, priority = false }: MetricCardProps) {
  const isPositive = trend.startsWith('+')
  const isNegative = trend.startsWith('-')
  
  return (
    <div className="transition-transform hover:scale-105">
      <Card className={`h-full ${priority ? 'ring-2 ring-rillcod-500' : ''}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-bold text-rillcod-900">{value}</span>
                <Badge 
                  variant={isPositive ? "default" : isNegative ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {trend}
                </Badge>
              </div>
            </div>
            <div className={`text-4xl ${priority ? 'animate-pulse' : ''}`}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 