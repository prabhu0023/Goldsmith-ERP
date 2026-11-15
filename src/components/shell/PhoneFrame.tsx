import type { ReactNode } from 'react';

/** A 5-inch phone: where the karigar works. Text starts at 15 px, targets are 56 px. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22.5rem] rounded-[2.5rem] border-[10px] border-closed bg-surface shadow-2xl">
      <div className="h-[44rem] max-h-[calc(100vh-4rem)] overflow-y-auto rounded-[1.75rem] bg-paper text-[15px]">{children}</div>
    </div>
  );
}
