import { cn } from '@/lib/utils';

/** 5×7 pixel glyphs for the ONB wordmark. */
const GLYPHS: Record<'O' | 'N' | 'B', string[]> = {
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
};
const WORD = ['O', 'N', 'B'] as const;
const COLS = 5;
const GAP = 1;
const WIDTH = WORD.length * COLS + (WORD.length - 1) * GAP;

const pixels = WORD.flatMap((letter, i) =>
  GLYPHS[letter].flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === '#' ? [{ x: i * (COLS + GAP) + x, y }] : [])),
  ),
);

/** Pixel wordmark from the design. Inherits the text colour. */
export function OnbLogo({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${WIDTH} 7`} role="img" aria-label="ONB" className={cn('h-[30px] w-auto fill-current', className)} shapeRendering="crispEdges">
      {pixels.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} />
      ))}
    </svg>
  );
}
