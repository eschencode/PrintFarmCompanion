// Consistent color palette for categories
// Colors are assigned based on category name hash for stability

const CATEGORY_COLORS = [
  { bg: 'bg-blue-500/10 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', border: 'border-blue-200 dark:border-blue-800', accent: 'bg-blue-500' },
  { bg: 'bg-violet-500/10 dark:bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500', border: 'border-violet-200 dark:border-violet-800', accent: 'bg-violet-500' },
  { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', accent: 'bg-emerald-500' },
  { bg: 'bg-amber-500/10 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800', accent: 'bg-amber-500' },
  { bg: 'bg-rose-500/10 dark:bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500', border: 'border-rose-200 dark:border-rose-800', accent: 'bg-rose-500' },
  { bg: 'bg-cyan-500/10 dark:bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500', border: 'border-cyan-200 dark:border-cyan-800', accent: 'bg-cyan-500' },
  { bg: 'bg-orange-500/10 dark:bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', border: 'border-orange-200 dark:border-orange-800', accent: 'bg-orange-500' },
  { bg: 'bg-pink-500/10 dark:bg-pink-500/15', text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-500', border: 'border-pink-200 dark:border-pink-800', accent: 'bg-pink-500' },
  { bg: 'bg-teal-500/10 dark:bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-500', border: 'border-teal-200 dark:border-teal-800', accent: 'bg-teal-500' },
  { bg: 'bg-indigo-500/10 dark:bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500', border: 'border-indigo-200 dark:border-indigo-800', accent: 'bg-indigo-500' },
];

const UNCATEGORIZED_COLOR = {
  bg: 'bg-zinc-500/10 dark:bg-zinc-500/15',
  text: 'text-zinc-500 dark:text-zinc-400',
  dot: 'bg-zinc-400',
  border: 'border-zinc-200 dark:border-zinc-700',
  accent: 'bg-zinc-400'
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCategoryColor(category: string) {
  if (!category || category === 'Uncategorized') return UNCATEGORIZED_COLOR;
  return CATEGORY_COLORS[hashString(category) % CATEGORY_COLORS.length];
}

export type CategoryColor = typeof UNCATEGORIZED_COLOR;
