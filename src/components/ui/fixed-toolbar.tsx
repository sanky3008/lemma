'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Toolbar } from './toolbar';

export function FixedToolbar({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Toolbar>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateShadows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateShadows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateShadows);
    const ro = new ResizeObserver(updateShadows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateShadows);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative h-10 w-full shrink-0 border-b bg-background/95 backdrop-blur-sm supports-backdrop-blur:bg-background/60">
      {/* Left scroll shadow */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-150',
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        )}
      />
      {/* Right scroll shadow */}
      <div
        className={cn(
          'pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-150',
          canScrollRight ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div ref={scrollRef} className="h-full overflow-x-auto scrollbar-hide">
        <Toolbar
          {...props}
          className={cn(
            'h-full w-max min-w-full justify-between px-2',
            className
          )}
        >
          {children}
        </Toolbar>
      </div>
    </div>
  );
}
