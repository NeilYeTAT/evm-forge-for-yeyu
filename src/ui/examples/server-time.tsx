'use client'

import type { FC } from 'react'
import type { ComponentProps } from 'react'
import { useServerTime } from '@/lib/hooks/time'
import { formatTime } from '@/lib/utils/formatters'

export const ServerTime: FC<ComponentProps<'div'>> = props => {
  const { data: serverTime } = useServerTime()

  return <div {...props}>Server time: {formatTime(serverTime)}</div>
}
